/// PDF 导出（Typora 模式）
///
/// 流程：点击「导出 PDF」→ 弹出保存对话框 → 把编辑器渲染的文档构造成**自包含 HTML**
/// （应用样式、KaTeX 公式字体、图片全部内联，离线可用）→ 交给 Rust 侧静默打印成 PDF 文件。
/// 全程没有系统打印对话框，与 Typora「导出 PDF 直接落盘」的体验一致。
///
/// Rust 实现见 src-tauri/src/commands/pdf.rs（隐藏 WebView2 窗口 + ICoreWebView2_7::PrintToPdf）。

import { invoke } from '@tauri-apps/api/core'
import { editorViewCtx } from '@milkdown/kit/core'
import type { Editor } from '@milkdown/kit/core'
import { save } from '@tauri-apps/plugin-dialog'
import { readFileBytes, writeFile, fileSize, bytesToBase64 } from './fs'
import { parentDirOf, joinPath, basenameOf } from '../utils/files'

/** 转义 HTML 特殊字符（用于标题等） */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 收集页面完整样式并**内联**进导出文档，保证独立打开时样式不丢失。
 *
 * - 页面内 `<style>` 直接内联其文本；
 * - `<link rel="stylesheet">` 通过 fetch 取回真实 CSS 文本内联（Vite 生产构建中
 *   index.css 以 `<link>` 引入，若只写 `@import url(...)` 相对路径，独立打开导出的
 *   HTML 时无法解析 → 代码块背景、hljs 语法高亮配色全部丢失）；
 * - 运行时通过 JS 注入到 <html> 上的 CSS 变量（主题色）一并内联，保证配色与当前界面一致。
 */
async function collectAppStyles(): Promise<string> {
  const parts: string[] = []

  // 内联 <style> 标签
  document.querySelectorAll('style').forEach((el) => parts.push(el.innerHTML))

  // 取回 <link> 样式表真实文本并内联；失败时退化为 @import 以尽可能保留
  const linkCss = await Promise.all(
    Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(async (el) => {
      const href = el.getAttribute('href')
      if (!href) return ''
      try {
        const abs = new URL(href, document.baseURI).href
        const res = await fetch(abs)
        if (!res.ok) return ''
        return await res.text()
      } catch {
        return `@import url("${href}");`
      }
    }),
  )
  parts.push(...linkCss.filter(Boolean))

  return parts.join('\n')
}

/** 字节数组 → base64：统一复用 services/fs 的实现（分块拼接，避免栈溢出） */

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
}

/**
 * 把文档中的图片解析为可打印的地址：
 * - 相对路径（如 `笔记.assets/xxx.png`、`./img.png`）→ 相对文档所在目录解析为绝对路径，
 *   读取字节后内联为 base64 data URI（导出的 PDF 自带图片，与 Typora 一致）；
 * - http(s) / data 链接保持原样。
 */
async function embedImages(root: HTMLElement, docPath: string): Promise<void> {
  const docDir = parentDirOf(docPath)
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src')
      if (!src || /^(https?:|data:)/i.test(src)) return

      // 去掉 file:// 前缀（Windows 上为 file:///C:/...）
      let filePath = src
      if (filePath.startsWith('file://')) {
        filePath = filePath.slice('file://'.length)
        if (filePath.startsWith('/')) filePath = filePath.slice(1)
      }
      // 解码 URL 编码（如 %20 空格），失败则保留原样
      try {
        filePath = decodeURIComponent(filePath)
      } catch {
        /* 保留原样 */
      }
      // 非绝对路径 → 相对文档目录拼接
      if (!/^[A-Za-z]:[\\/]/.test(filePath)) {
        filePath = joinPath(docDir, filePath)
      }

      const ext = filePath.split('.').pop()?.toLowerCase() || ''
      const mime = IMAGE_MIME[ext] || 'image/png'
      try {
        // readFileBytes（base64 通道）返回的 Uint8Array 就是完整 buffer，可直接编码
        const b64 = bytesToBase64(await readFileBytes(filePath))
        img.setAttribute('src', `data:${mime};base64,${b64}`)
      } catch {
        // 读取失败（文件被移动等）：保留原路径，打印时按原样处理
      }
    }),
  )
  // 清除编辑器上传插件可能写入的 srcset，避免干扰
  root.querySelectorAll('img').forEach((img) => img.removeAttribute('srcset'))
}

/** 清理编辑器专用 DOM 痕迹，只保留文档内容 */
function cleanEditorDom(root: HTMLElement): void {
  root.removeAttribute('contenteditable')
  root.removeAttribute('spellcheck')
  root.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'))
  // 代码块语言徽标 / 表格列宽拖拽手柄（编辑器 UI，不应出现在导出文档里）
  root.querySelectorAll('.code-lang-badge, .mditor-table-resize-handle, .code-copy-btn').forEach((el) => el.remove())
  // 空文档占位符
  root.querySelectorAll('p.is-editor-empty').forEach((el) => el.classList.remove('is-editor-empty'))
}

/** 校验导出文件确实落盘且非空（防止「成功」提示与实际不符） */
async function verifyExportedFile(path: string): Promise<void> {
  const size = await fileSize(path)
  if (!size || size <= 0) throw new Error('导出文件为空或不存在')
}

/** 打印专用样式：白底黑字、A4 友好排版、隐藏编辑器 UI、长行折行不截断 */
const PRINT_STYLES = `
html, body { background: #fff; }
body { color: #1f2328; }
.ProseMirror { padding: 0 !important; }
.code-lang-badge, .code-copy-btn, .mditor-table-resize-handle { display: none !important; }
pre { white-space: pre-wrap; word-wrap: break-word; }
h1, h2, h3, h4 { break-after: avoid; }
pre, blockquote, .katex-block, img { break-inside: avoid; }
a { word-break: break-all; }
`

/**
 * 提取文档标题大纲（h1~h6），供 PDF 导出后注入书签（大纲）使用。
 * 从渲染后的克隆 DOM 上读取，文本取 textContent（含加粗等行内格式的文字）。
 */
function extractOutline(root: HTMLElement): { level: number; text: string }[] {
  const outline: { level: number; text: string }[] = []
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const text = (h.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text) return
    outline.push({ level: Number(h.tagName[1]), text })
  })
  return outline
}

/**
 * 导出内容构造第一步：克隆编辑器渲染 DOM → 清理编辑器痕迹 → 内联图片 → 提取大纲。
 * PDF / HTML 两条导出链路共用，保证三者看到的文档内容永远一致。
 * 返回的 HTMLElement 是游离 DOM（未插入文档），调用方可继续加工。
 */
async function buildExportBody(
  editor: Editor,
  docPath: string,
): Promise<{ proseMirror: HTMLElement; outline: { level: number; text: string }[] } | null> {
  return editor.action(async (ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return null

    // 克隆 ProseMirror 渲染 DOM 作为文档本体
    const proseMirror = view.dom.cloneNode(true) as HTMLElement
    cleanEditorDom(proseMirror)
    await embedImages(proseMirror, docPath)
    // PDF 大纲：h1~h6 标题（层级 + 文本）
    const outline = extractOutline(proseMirror)
    return { proseMirror, outline }
  })
}

/** 构建自包含的导出 HTML（样式 + KaTeX 字体 + 图片全部内联），并提取标题大纲 */
async function buildExportHtml(
  editor: Editor,
  docPath: string,
): Promise<{ html: string; outline: { level: number; text: string }[] } | null> {
  const built = await buildExportBody(editor, docPath)
  if (!built) return null
  const { proseMirror, outline } = built

  // KaTeX 公式字体：优先内联（离线可用）；构建异常时退回 CDN 链接
  let katexCss = ''
  let katexFallbackLink = ''
  const rootStyle = document.documentElement.getAttribute('style') || ''
  try {
    const { buildKatexCssWithFonts } = await import('./exportFonts')
    katexCss = buildKatexCssWithFonts()
  } catch {
    katexFallbackLink =
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.4/dist/katex.min.css" crossorigin="anonymous">'
  }

  return {
    html: `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light"${rootStyle ? ` style="${rootStyle}"` : ''}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(basenameOf(docPath))}</title>
  <style>${await collectAppStyles()}</style>
  ${katexCss ? `<style>${katexCss}</style>` : katexFallbackLink}
  <style>${PRINT_STYLES}</style>
</head>
<body>
  ${proseMirror.outerHTML}
</body>
</html>`,
    outline,
  }
}

/**
 * 导出当前内容为 PDF（Typora 模式）：保存对话框 → 直接生成 PDF 文件。
 * @returns 用户完成导出返回 true；用户取消保存对话框返回 false；失败时抛出异常。
 */
export async function exportPdf(editor: Editor | null, docPath: string): Promise<boolean> {
  if (!editor) return false

  const defaultName = basenameOf(docPath).replace(/\.md$/i, '') + '.pdf'
  const filePath = await save({
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!filePath) return false

  const built = await buildExportHtml(editor, docPath)
  if (!built) return false

  // outline：标题层级 + 文本，Rust 侧用于在 PDF 里注入大纲（书签）
  await invoke('export_pdf', {
    html: built.html,
    targetPath: filePath,
    outline: built.outline,
  })
  // 二次校验：PDF 由隐藏窗口静默打印生成，这里确认文件确实落盘且非空，
  // 避免 WebView2 回调误报成功时仍提示「已导出」。
  await verifyExportedFile(filePath)
  return true
}

/**
 * 导出当前内容为独立 .html 文件（自包含：样式 + KaTeX 字体 + 图片全部内联，离线可用）。
 * 与 PDF 导出复用同一套「构造导出 HTML」逻辑，只是落盘方式不同（直接写文本文件，无打印步骤）。
 * @returns 用户完成导出返回 true；用户取消保存对话框返回 false；失败时抛出异常。
 */
export async function exportHtml(editor: Editor | null, docPath: string): Promise<boolean> {
  if (!editor) return false

  const defaultName = basenameOf(docPath).replace(/\.md$/i, '') + '.html'
  const filePath = await save({
    defaultPath: defaultName,
    filters: [{ name: 'HTML', extensions: ['html'] }],
  })
  if (!filePath) return false

  const built = await buildExportHtml(editor, docPath)
  if (!built) return false

  await writeFile(filePath, built.html)
  await verifyExportedFile(filePath)
  return true
}
