import type { Editor } from '@milkdown/kit/core'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { replaceAll } from '@milkdown/kit/utils'
import { useAppStore } from '../stores/useAppStore'
import { writeRichClipboard } from '../utils/clipboard'
import { fileSize } from '../services/fs'
import { parentDirOf } from '../utils/files'

/** 校验文档中链接/图片的本地相对路径是否真实存在，返回失效项 */
export interface BrokenRef {
  kind: 'link' | 'image'
  target: string
  pos: number
}

export async function validateDocument(editor: Editor | null): Promise<BrokenRef[]> {
  if (!editor) return []
  const { tabs, activeTabId } = useAppStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  const baseDir = tab ? parentDirOf(tab.path) : null

  const found: BrokenRef[] = []
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return
    view.state.doc.descendants((node, pos) => {
      const isLink = node.type.name === 'link'
      const isImage = node.type.name === 'image'
      if (!isLink && !isImage) return
      const target = (node.attrs.href ?? node.attrs.src) as string | undefined
      if (!target) return
      // 跳过外链、锚点、协议相对链接
      if (/^(https?:|mailto:|#|\/\/)/i.test(target)) return
      // 跳过绝对路径（盘符或根路径），它们跨目录、无法用 baseDir 可靠解析
      if (/^[a-zA-Z]:[\\/]/.test(target) || target.startsWith('/')) return
      found.push({ kind: isLink ? 'link' : 'image', target, pos })
    })
  })

  // 同一目标只校验一次
  const uniq = Array.from(new Map(found.map((b) => [b.target, b])).values())
  const broken: BrokenRef[] = []
  for (const b of uniq) {
    if (!baseDir) {
      broken.push(b)
      continue
    }
    const sep = baseDir.includes('\\') ? '\\' : '/'
    const resolved = baseDir.endsWith(sep) ? baseDir + b.target : baseDir + sep + b.target
    try {
      await fileSize(resolved)
    } catch {
      broken.push(b)
    }
  }
  return broken
}

/** 从文档中收集标题，生成嵌套目录（缩进列表）并插入到光标处 */
export function insertToc(editor: Editor | null): boolean {
  if (!editor) return false
  let ok = false
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return
    const headings: { level: number; text: string }[] = []
    view.state.doc.descendants((node) => {
      if (node.type.name === 'heading') {
        const level = (node.attrs.level as number) || 1
        const text = node.textContent.trim()
        if (text) headings.push({ level, text })
      }
    })
    if (headings.length === 0) return
    const slug = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    const md = headings
      .map((h) => {
        const indent = '  '.repeat(Math.max(0, h.level - 1))
        const link = `[${h.text}](#${slug(h.text)})`
        return `${indent}- ${link}`
      })
      .join('\n') + '\n'
    const parser = ctx.get(parserCtx)
    const doc = parser(md)
    view.dispatch(view.state.tr.replaceSelection(doc.slice(0)))
    ok = true
  })
  return ok
}

/** 将当前文档的 Markdown 源码复制到剪贴板。
 *  读活动标签的 content（store 真源）：旧实现读 store.markdown——它只在
 *  Milkdown 挂载期间维护，源码模式下停留在旧值/别的文件，复制出错误内容 */
export async function copyMarkdownSource(): Promise<boolean> {
  const { tabs, activeTabId } = useAppStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  const md = tab?.content ?? ''
  if (!md) return false
  try {
    await writeRichClipboard(md, md)
    return true
  } catch {
    try {
      await navigator.clipboard.writeText(md)
      return true
    } catch {
      return false
    }
  }
}

/** 保守地规范化 Markdown：去行尾空白、统一列表符号、补全标题空格、压缩空行 */
function formatMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  let inFence = false
  let fenceMarker = ''
  const out: string[] = []
  for (let raw of lines) {
    let line = raw.replace(/[ \t]+$/g, '')
    const fenceMatch = /^(\s*)(```|~~~)/.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[2]
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (marker === fenceMarker) {
        inFence = false
        fenceMarker = ''
      }
      out.push(line)
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }
    line = line.replace(/^(\s*)([*+])\s+/, '$1- ')
    line = line.replace(/^(#{1,6})([^#\s])/, '$1 $2')
    out.push(line)
  }
  let text = out.join('\n')
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/^\n+/, '').replace(/\n+$/, '')
  if (text.length > 0 && !text.endsWith('\n')) text += '\n'
  return text
}

/** 整理当前文档格式（Markdown 往返 + 规范化规则） */
export function formatDocument(editor: Editor | null): boolean {
  if (!editor) return false
  const md = useAppStore.getState().markdown
  if (!md) return false
  const formatted = formatMarkdown(md)
  if (formatted === md) return false
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return
    replaceAll(formatted)(ctx)
  })
  return true
}

