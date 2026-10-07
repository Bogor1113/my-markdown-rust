/// 一键复制为「公众号 / 知乎 / CSDN」带样式 HTML。
///
/// 直接复制 Markdown 渲染后的内容到剪贴板会丢失样式（这些平台只接受内联样式）。
/// 这里遍历实时编辑器 DOM，把关键计算样式内联进每个元素，生成可直接粘贴的富文本 HTML。

import { editorViewCtx } from '@milkdown/kit/core'
import type { Editor } from '@milkdown/kit/core'
import { writeRichClipboard } from '../utils/clipboard'

const STYLE_PROPS = [
  'color',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'textDecoration',
  'fontFamily',
  'lineHeight',
  'textAlign',
  'backgroundColor',
  'borderLeft',
  'marginTop',
  'marginBottom',
  'paddingLeft',
  'listStyleType',
  'borderCollapse',
]

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function pickStyle(cs: CSSStyleDeclaration): string {
  return STYLE_PROPS.map((p) => {
    const v = (cs as unknown as Record<string, string>)[p]
    return v && v !== 'none' && v !== 'normal' ? `${p}:${v}` : ''
  })
    .filter(Boolean)
    .join(';')
}

function serialize(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || '')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const cls = typeof el.className === 'string' ? el.className : ''
  if (
    /(code-lang-badge|code-copy-btn|mditor-table-resize-handle|mditor-resize-handle|is-editor-empty|mditor-html-block|ProseMirror-trailingBreak)/.test(
      cls,
    )
  ) {
    return ''
  }
  const tag = el.tagName.toLowerCase()
  if (tag === 'br') return '<br>'
  if (tag === 'img') {
    const src = el.getAttribute('src') || ''
    const alt = el.getAttribute('alt') || ''
    return `<img src="${src}" alt="${escapeHtml(alt)}" style="max-width:100%;">`
  }

  const cs = getComputedStyle(el)
  const style = pickStyle(cs)
  const inner = Array.from(el.childNodes).map(serialize).join('')
  return `<${tag}${style ? ` style="${style}"` : ''}>${inner}</${tag}>`
}

/**
 * 把当前文档渲染为带内联样式的 HTML 并写入剪贴板（text/html）。
 * @returns 是否成功复制
 */
export async function copyWechatHtml(editor: Editor | null): Promise<boolean> {
  if (!editor) return false
  let html = ''
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return
    const root = view.dom as HTMLElement
    const inner = Array.from(root.childNodes).map(serialize).join('')
    html = `<section style="font-size:15px;line-height:1.75;color:#2f2f2f;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;word-break:break-word;">${inner}</section>`
  })
  if (!html) return false
  await writeRichClipboard(html, html)
  return true
}
