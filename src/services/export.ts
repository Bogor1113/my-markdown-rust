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
import { toLocalAbsPath } from './imageDisplay'
import { parentDirOf, joinPath, basenameOf } from '../utils/files'
import { slugifyHeading } from '../utils/markdown'

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
      if (!src || /^data:/i.test(src)) return

      // 解析为本地路径。关键：编辑器渲染时 img src 已被 toDisplayImageSrc 改写成
      // asset://…/http://asset.localhost/… 显示地址（WebView 才能加载本地文件），
      // 若不还原，旧逻辑按 `http:` 前缀整体跳过 → 导出的 HTML 里全部本地图裂图。
      // toLocalAbsPath 同时处理 asset 还原、Windows 盘符/UNC 绝对路径与相对路径。
      let filePath = toLocalAbsPath(src)
      if (filePath == null) {
        if (/^https?:/i.test(src)) return
        filePath = src
        if (filePath.startsWith('file://')) {
          filePath = filePath.slice('file://'.length)
          if (/^\/[A-Za-z]:/.test(filePath)) {
            filePath = filePath.slice(1) // file:///C:/... → C:/...
          } else if (!filePath.startsWith('/')) {
            // file://server/share/... → UNC：还原 \\server\share\...
            filePath = '\\\\' + filePath.replace(/\//g, '\\')
          }
        }
        // 解码 URL 编码（如 %20 空格），失败则保留原样
        try {
          filePath = decodeURIComponent(filePath)
        } catch {
          /* 保留原样 */
        }
        // 非绝对路径 → 相对文档目录拼接（含 UNC 网络路径 \\server\share）
        if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/\/)/.test(filePath)) {
          filePath = joinPath(docDir, filePath)
        }
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

/**
 * 导出前把文档内容里「写死颜色」的背景归一化为当前主题色。
 *
 * 背景：课件里常见从网页/其他文档粘贴来的 HTML 块，例如
 *   <div style="background-color:#fff9e6; padding:16px">…</div>
 * 颜色写死在内容里，导出后就会在主题底色上留一大块与整体不搭的色块
 * （这正是「导出后背景有黄有白」的来源）。
 *
 * 处理范围刻意收窄，只动两处：
 *   1. 元素级 inline `background-color` → 主题面板色；
 *   2. `<mark>` 的浏览器默认黄底 → 主题强调色底。
 * 由 class 驱动的背景（代码块、表格表头、callout、引用块）本来就跟着主题变量走，一律不碰。
 * 背景图 `url(...)` 不受影响。
 * 公式内部（.katex）与 svg 子树跳过，避免破坏公式排版与图表。
 */
function normalizeInlineBackgrounds(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (el.closest('.katex, svg')) return
    const style = el.style
    if (style && style.backgroundColor) {
      style.backgroundColor = 'var(--color-bg-sidebar)'
    }
    // 老式 HTML 属性写法：bgcolor 在部分元素上仍会画底色
    if (el.hasAttribute('bgcolor')) el.removeAttribute('bgcolor')
  })
  // <mark> 的黄底是浏览器默认样式，不在 inline style 里，需显式接管
  root.querySelectorAll('mark').forEach((el) => {
    el.style.backgroundColor = 'var(--color-accent-glow, rgba(91, 157, 255, 0.12))'
    el.style.color = 'inherit'
    el.style.padding = '0 2px'
  })
}

/** 校验导出文件确实落盘且非空（防止「成功」提示与实际不符） */
async function verifyExportedFile(path: string): Promise<void> {
  const size = await fileSize(path)
  if (!size || size <= 0) throw new Error('导出文件为空或不存在')
}

/**
 * 导出页面的排版样式。
 *
 * 背景与文字颜色**跟随应用当前主题**（data-theme 由 buildExportHtml 从编辑器实时读取写入），
 * 只在真正打印时才强制白底黑字（@media print）—— PDF 导出走 WebView2 打印、
 * 浏览器里 Ctrl+P 也都命中这一条，屏幕浏览时则保持主题配色。
 */
const PRINT_STYLES = `
/* 应用外壳的装饰层（body::before 的氛围光晕、body::after 的网格）是为编辑器窗口
   做的 fixed 全屏层，导出成静态文档后只剩背景污染，必须摘掉。
   同样摘掉的还有 body 上可能残留的噪点纹理变量。 */
body::before, body::after { display: none !important; }
.ProseMirror { padding: 0 !important; }
.code-lang-badge, .code-copy-btn, .mditor-table-resize-handle { display: none !important; }
pre { white-space: pre-wrap; word-wrap: break-word; }
h1, h2, h3, h4 { break-after: avoid; }
pre, blockquote, .katex-block, img { break-inside: avoid; }
a { word-break: break-all; }
@media print {
  html, body { background: #fff !important; }
  body { color: #1f2328 !important; }
}
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
    // 把内容里写死的背景色交给主题接管（详见 normalizeInlineBackgrounds 注释）
    normalizeInlineBackgrounds(proseMirror)
    await embedImages(proseMirror, docPath)
    // PDF 大纲：h1~h6 标题（层级 + 文本）
    const outline = extractOutline(proseMirror)
    return { proseMirror, outline }
  })
}

/**
 * 目录导航条目（HTML 导出专用）。
 */
interface TocItem {
  /** 写入标题元素的 id，同时是左侧导航 <a href="#id"> 的目标 */
  id: string
  /** 标题层级 1~6 */
  level: number
  /** 标题纯文本 */
  text: string
}

/**
 * 给克隆 DOM 里的所有标题（h1~h6）写入唯一锚点 id，并按文档顺序返回目录条目。
 *
 * 为什么必须在**导出时**生成：编辑器 DOM 里的标题没有 id，正文里通过「插入目录」
 * 写下的 `[标题](#slug)` 内部链接在编辑器里也无处可跳，只有导出文档给了 id 之后
 * 它们才真正可用（id 规则与 utils/markdown.slugifyHeading 一致）。
 *
 * 去重策略：同名标题加 -2 / -3 后缀（第一个保留原 slug，保证正文里的 #slug 链接
 * 指向首个同名标题）；同时避开正文里已存在的 id（如 HTML 块手写的锚点）。
 */
function assignHeadingAnchors(root: HTMLElement): TocItem[] {
  const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'))
  const headingSet = new Set<Element>(headings)

  // 正文里已存在的 id（HTML 块手写的锚点等）不能被标题占用
  const used = new Set<string>()
  root.querySelectorAll('[id]').forEach((el) => {
    if (headingSet.has(el)) return // 标题自身的 id 在下面单独判定
    const id = (el.getAttribute('id') || '').trim()
    if (id) used.add(id)
  })

  const items: TocItem[] = []
  headings.forEach((h) => {
    const text = (h.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text) return // 空标题（如只放了图片的标题）不入目录
    const level = Number(h.tagName[1])

    // 标题本就带 id（如 Milkdown heading id 属性 / HTML 块）：保留原值，
    // 否则正文里的 #自定义锚点 会在导出后全部失效
    const own = (h.getAttribute('id') || '').trim()
    if (own && !used.has(own)) {
      used.add(own)
      items.push({ id: own, level, text })
      return
    }

    const base = slugifyHeading(text) || `section-${items.length + 1}`
    let id = base
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`
    used.add(id)
    h.setAttribute('id', id)
    items.push({ id, level, text })
  })
  return items
}

/**
 * 左侧目录导航样式。
 *
 * 配色全部走主题变量（导出文档固定 data-theme="light"，变量由内联的 app 样式提供，
 * 并带 hex 兜底，保证样式表缺失时也不会变成透明文字）。
 */
const TOC_STYLES = `
:root { --mditor-toc-w: 288px; }
.mditor-export-main {
  box-sizing: border-box;
  padding: 44px 56px 128px;
}
/* 正文让出左侧目录的宽度。只在「宽屏且目录展开」时才让位：
   窄屏是覆盖式抽屉，正文必须始终占满宽度——否则抽屉一开一合就会让整篇
   重新折行、文档高度跳变，正在跳转的位置随之偏移。 */
html:not(.mditor-toc-narrow) .mditor-export-main { margin-left: var(--mditor-toc-w); }
html.mditor-toc-hidden .mditor-export-main { margin-left: 0; }
html.mditor-toc-narrow .mditor-export-main { margin-left: 0; padding: 62px 20px 96px; }
@media (max-width: 1100px) {
  /* 脚本尚未执行（首屏 / 禁用 JS）时的兜底：窄屏一律不预留目录宽度 */
  .mditor-export-main { margin-left: 0 !important; padding: 62px 20px 96px; }
}
.mditor-export-main > .ProseMirror { max-width: 860px; margin: 0 auto; }
.mditor-export-main h1, .mditor-export-main h2, .mditor-export-main h3,
.mditor-export-main h4, .mditor-export-main h5, .mditor-export-main h6 {
  scroll-margin-top: 20px;
}
.mditor-toc {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: var(--mditor-toc-w);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  z-index: 30;
  background: var(--color-bg-sidebar, #f6f7fa);
  border-right: 1px solid var(--color-border, #dde0e8);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 13px;
  line-height: 1.6;
  transition: transform 0.24s ease;
}
.mditor-toc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 14px 10px 18px;
}
.mditor-toc-title {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-secondary, #6b7280);
}
.mditor-toc-doc {
  margin-top: 3px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1a1d24);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mditor-toc-btn {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid var(--color-border, #dde0e8);
  border-radius: 6px;
  background: var(--color-bg, #fff);
  color: var(--color-text-secondary, #6b7280);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.4;
  cursor: pointer;
}
.mditor-toc-btn:hover { color: var(--color-accent, #2563eb); border-color: var(--color-accent, #2563eb); }
.mditor-toc-search-wrap { padding: 0 14px 10px 18px; }
.mditor-toc-search {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border, #dde0e8);
  border-radius: 7px;
  background: var(--color-bg, #fff);
  color: var(--color-text, #1a1d24);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
}
.mditor-toc-search::placeholder { color: var(--color-text-dim, #adb1bd); }
.mditor-toc-search:focus {
  border-color: var(--color-accent, #2563eb);
  box-shadow: 0 0 0 3px var(--color-accent-glow, rgba(37, 99, 235, 0.1));
}
.mditor-toc-list { flex: 1 1 auto; overflow-y: auto; padding: 2px 10px 28px; }
.mditor-toc-link {
  display: block;
  padding: 5px 10px;
  margin: 1px 0;
  border-left: 2px solid transparent;
  border-radius: 0 5px 5px 0;
  color: var(--color-text, #1a1d24);
  text-decoration: none;
  word-break: break-word;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.mditor-toc-link:hover { background: color-mix(in srgb, var(--color-border, #dde0e8) 45%, transparent); }
.mditor-toc-link.is-active {
  background: var(--color-accent-glow, rgba(37, 99, 235, 0.1));
  border-left-color: var(--color-accent, #2563eb);
  color: var(--color-accent, #2563eb);
  font-weight: 600;
}
.mditor-toc-link[data-level="1"] { font-weight: 600; }
.mditor-toc-empty {
  display: none;
  padding: 10px 8px;
  font-size: 12.5px;
  color: var(--color-text-dim, #adb1bd);
}
.mditor-toc-empty.is-visible { display: block; }
.mditor-toc-toggle {
  display: none;
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 40;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  border: 1px solid var(--color-border, #dde0e8);
  border-radius: 999px;
  background: var(--color-bg, #fff);
  color: var(--color-text, #1a1d24);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.12);
}
.mditor-toc-toggle:hover { color: var(--color-accent, #2563eb); border-color: var(--color-accent, #2563eb); }
.mditor-toc-mask {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 25;
  background: rgba(15, 23, 42, 0.38);
}
html.mditor-toc-hidden .mditor-toc { transform: translateX(-100%); }
html.mditor-toc-hidden .mditor-toc-toggle { display: inline-flex; }
html.mditor-toc-narrow:not(.mditor-toc-hidden) .mditor-toc-mask { display: block; }
html.mditor-toc-narrow .mditor-export-main > .ProseMirror { max-width: none; }
@media print {
  .mditor-toc, .mditor-toc-toggle, .mditor-toc-mask { display: none !important; }
  .mditor-export-main { margin-left: 0 !important; padding: 0 !important; }
}
`

/**
 * 左侧目录的交互脚本（原生 ES5，不依赖任何外部资源，离线可用）：
 * 1. 点击目录项 → 平滑滚动到对应标题（原生 <a href="#id"> 作为无 JS 兜底）；
 * 2. 滚动时高亮「当前章节」，并把高亮项滚进目录可视区；
 * 3. 窄屏（< 1100px）默认收起为抽屉，点目录后自动关闭；
 * 4. 目录筛选框：过滤章节标题，回车跳到第一条命中项。
 */
const TOC_SCRIPT = `
(function () {
  var doc = document;
  var root = doc.documentElement;
  var toc = doc.getElementById('mditor-toc');
  var main = doc.querySelector('.mditor-export-main');
  var list = doc.querySelector('.mditor-toc-list');
  var toggle = doc.querySelector('.mditor-toc-toggle');
  var mask = doc.querySelector('.mditor-toc-mask');
  var closeBtn = doc.querySelector('.mditor-toc-close');
  var search = doc.querySelector('.mditor-toc-search');
  var emptyTip = doc.querySelector('.mditor-toc-empty');
  if (!toc || !main || !list) return;

  var NARROW = 1100;
  var OFFSET = 20;
  var links = [].slice.call(list.querySelectorAll('a.mditor-toc-link'));

  function setHidden(hidden) { root.classList.toggle('mditor-toc-hidden', !!hidden); }
  function isNarrow() { return root.classList.contains('mditor-toc-narrow'); }
  function hrefId(a) {
    var href = a.getAttribute('href') || '';
    var id = href.charAt(0) === '#' ? href.slice(1) : '';
    try { id = decodeURIComponent(id); } catch (e) { /* 保留原值 */ }
    return id;
  }
  function scrollToId(id) {
    var el = doc.getElementById(id);
    if (!el) return false;
    var top = el.getBoundingClientRect().top + (window.pageYOffset || root.scrollTop || 0) - OFFSET;
    if (top < 0) top = 0;
    try { window.scrollTo({ top: top, behavior: 'smooth' }); }
    catch (e) { window.scrollTo(0, top); }
    // file:// 下 Chrome 禁止 pushState/replaceState，失败不影响跳转，静默忽略
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* noop */ }
    return true;
  }

  // 目录点击：优先自己滚动（保留标题上方留白），失败再交回浏览器默认锚点行为
  list.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a.mditor-toc-link') : null;
    if (!a) return;
    var id = hrefId(a);
    if (!id || !scrollToId(id)) return;
    e.preventDefault();
    if (isNarrow()) setHidden(true);
  });

  if (toggle) toggle.addEventListener('click', function () { setHidden(false); });
  if (mask) mask.addEventListener('click', function () { setHidden(true); });
  if (closeBtn) closeBtn.addEventListener('click', function () { setHidden(true); });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !root.classList.contains('mditor-toc-hidden')) setHidden(true);
  });

  // 筛选
  function visibleLinks() {
    return links.filter(function (a) { return a.style.display !== 'none'; });
  }
  if (search) {
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      links.forEach(function (a) {
        var hit = !q || (a.textContent || '').toLowerCase().indexOf(q) !== -1;
        a.style.display = hit ? '' : 'none';
      });
      if (emptyTip) emptyTip.classList.toggle('is-visible', q !== '' && visibleLinks().length === 0);
    });
    search.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var first = visibleLinks()[0];
      if (!first) return;
      if (scrollToId(hrefId(first)) && isNarrow()) setHidden(true);
    });
  }

  // 当前章节高亮：取最后一个「已进入顶部判定线」的标题
  var byId = {};
  links.forEach(function (a) { byId[hrefId(a)] = a; });
  var headings = [].slice.call(main.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .filter(function (h) { return byId[h.id]; });
  var activeLink = null;
  function keepVisible(a) {
    var box = list.getBoundingClientRect();
    var r = a.getBoundingClientRect();
    if (r.top < box.top + 6) list.scrollTop -= box.top + 6 - r.top;
    else if (r.bottom > box.bottom - 6) list.scrollTop += r.bottom - box.bottom + 6;
  }
  function updateActive() {
    if (!headings.length) return;
    var atBottom = (window.pageYOffset || root.scrollTop) + window.innerHeight >= root.scrollHeight - 4;
    var best = headings[0];
    if (!atBottom) {
      var probe = OFFSET + 72;
      for (var i = 0; i < headings.length; i++) {
        if (headings[i].getBoundingClientRect().top <= probe) best = headings[i];
        else break;
      }
    } else {
      best = headings[headings.length - 1];
    }
    var link = byId[best.id];
    if (link === activeLink) return;
    if (activeLink) activeLink.classList.remove('is-active');
    activeLink = link;
    activeLink.classList.add('is-active');
    keepVisible(activeLink);
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () { ticking = false; updateActive(); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    root.classList.toggle('mditor-toc-narrow', window.innerWidth < NARROW);
    updateActive();
  });
  window.addEventListener('load', updateActive);

  root.classList.toggle('mditor-toc-narrow', window.innerWidth < NARROW);
  if (window.innerWidth < NARROW) setHidden(true);
  updateActive();
})();
`

/**
 * 生成左侧目录导航的 HTML 外壳（含筛选框 / 抽屉开关 / 交互脚本）。
 * 目录条目按最小层级归一化缩进：从 h2 开始的文档不会出现「整体右移一格」的错位感。
 */
function buildTocChrome(items: TocItem[], docTitle: string): string {
  const minLevel = items.reduce((min, it) => Math.min(min, it.level), 6)
  const links = items
    .map((it) => {
      const depth = Math.min(5, Math.max(0, it.level - minLevel))
      const pad = 10 + depth * 14
      return `      <a class="mditor-toc-link" href="#${escapeHtml(it.id)}" data-level="${it.level}" style="padding-left:${pad}px" title="${escapeHtml(it.text)}">${escapeHtml(it.text)}</a>`
    })
    .join('\n')

  return `<nav class="mditor-toc" id="mditor-toc" aria-label="文档目录">
  <div class="mditor-toc-head">
    <div style="min-width:0">
      <div class="mditor-toc-title">目录</div>
      <div class="mditor-toc-doc" title="${escapeHtml(docTitle)}">${escapeHtml(docTitle)}</div>
    </div>
    <button class="mditor-toc-btn mditor-toc-close" type="button" title="收起目录" aria-label="收起目录">&times;</button>
  </div>
  <div class="mditor-toc-search-wrap">
    <input class="mditor-toc-search" type="search" placeholder="筛选章节…" aria-label="筛选章节" autocomplete="off">
  </div>
  <div class="mditor-toc-list">
${links}
  </div>
  <div class="mditor-toc-empty">没有匹配的章节</div>
</nav>
<button class="mditor-toc-toggle" type="button" aria-label="展开目录">☰ 目录</button>
<div class="mditor-toc-mask"></div>`
}

/**
 * 构建自包含的导出 HTML（样式 + KaTeX 字体 + 图片全部内联），并提取标题大纲
 * @param options.toc 是否注入左侧目录导航（HTML 导出开启；PDF 打印关闭，避免分页被挤压）
 */
async function buildExportHtml(
  editor: Editor,
  docPath: string,
  options?: { toc?: boolean },
): Promise<{ html: string; outline: { level: number; text: string }[] } | null> {
  const built = await buildExportBody(editor, docPath)
  if (!built) return null
  const { proseMirror, outline } = built

  // 左侧目录：先给标题写锚点 id，再据此生成导航（PDF 路径不注入，产物与之前完全一致）
  const docTitle = basenameOf(docPath).replace(/\.md$/i, '')
  const tocItems = options?.toc ? assignHeadingAnchors(proseMirror) : []
  const tocChrome = tocItems.length ? buildTocChrome(tocItems, docTitle) : ''

  // KaTeX 公式字体：优先内联（离线可用）；构建异常时退回 CDN 链接
  let katexCss = ''
  let katexFallbackLink = ''
  const rootStyle = document.documentElement.getAttribute('style') || ''
  // 主题跟随：导出文档沿用编辑器当前主题，导出的配色与软件里看到的完全一致
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark'
  try {
    const { buildKatexCssWithFonts } = await import('./exportFonts')
    katexCss = buildKatexCssWithFonts()
  } catch {
    katexFallbackLink =
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.4/dist/katex.min.css" crossorigin="anonymous">'
  }

  return {
    html: `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${escapeHtml(currentTheme)}"${rootStyle ? ` style="${rootStyle}"` : ''}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(basenameOf(docPath))}</title>
  <style>${await collectAppStyles()}</style>
  ${katexCss ? `<style>${katexCss}</style>` : katexFallbackLink}
  <style>${PRINT_STYLES}</style>
${tocChrome ? `  <style>${TOC_STYLES}</style>\n` : ''}</head>
<body class="mditor-export-body" data-theme="${escapeHtml(currentTheme)}">
${tocChrome ? `  ${tocChrome}\n` : ''}${tocChrome ? '  <main class="mditor-export-main">\n' : ''}  ${proseMirror.outerHTML}${tocChrome ? '\n  </main>\n' : ''}${tocChrome ? `<script>${TOC_SCRIPT}</script>\n` : ''}</body>
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
 * 与 PDF 的差异：HTML 是要长期阅读/分发的网页，额外注入**左侧目录导航**
 * （点击跳转到对应章节 + 滚动高亮当前章节 + 窄屏抽屉）；PDF 走打印分页，不注入。
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

  const built = await buildExportHtml(editor, docPath, { toc: true })
  if (!built) return false

  await writeFile(filePath, built.html)
  await verifyExportedFile(filePath)
  return true
}
