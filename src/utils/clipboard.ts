import type { EditorView } from '@milkdown/kit/prose/view'

/** 复制时跳过我们自己挂的 widget（复制按钮 / 语言徽章），避免混进拷贝出的 HTML */
const WIDGET_SEL = '.code-copy-btn, .code-lang-badge'

interface StyleInfo {
  color: string
  bg: string
  bold: boolean
  italic: boolean
}

function captureStyle(el: HTMLElement): StyleInfo {
  const cs = getComputedStyle(el)
  const bg = cs.backgroundColor
  return {
    color: cs.color === 'rgb(0, 0, 0)' ? '' : cs.color,
    bg: bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)' ? bg : '',
    bold: cs.fontWeight !== '400' && cs.fontWeight !== 'normal',
    italic: cs.fontStyle === 'italic',
  }
}

function applyStyle(el: HTMLElement, info: StyleInfo) {
  const s = el.style
  if (info.color) s.color = info.color
  if (info.bg) s.backgroundColor = info.bg
  if (info.bold) s.fontWeight = 'bold'
  if (info.italic) s.fontStyle = 'italic'
}

/** 深度优先收集元素（跳过 widget），返回文档序列表 */
function dfs(root: Element): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const el of Array.from(root.children)) {
    if (!(el instanceof HTMLElement)) continue
    if (el.matches(WIDGET_SEL)) continue
    out.push(el, ...dfs(el))
  }
  return out
}

/**
 * 把代码块的渲染 DOM（含语法高亮）序列化为带内联样式的 HTML。
 * 直接从已渲染节点取计算样式（getComputedStyle），保证颜色与编辑器所见一致；
 * 根元素（pre）的背景色一并内联——深色主题下浅色 token 粘到白底文档依然可读。
 * @returns 序列化 HTML；取不到渲染 DOM 时返回 null
 */
export function codeBlockToStyledHtml(view: EditorView, pos: number): string | null {
  const dom = view.nodeDOM(pos)
  if (!(dom instanceof HTMLElement)) return null

  const liveEls = [dom, ...dfs(dom)]
  const infos = liveEls.map(captureStyle)

  // 克隆时不改线上 DOM；剥掉 widget 后结构与 liveEls（已跳过 widget）逐一对齐
  const clone = dom.cloneNode(true) as HTMLElement
  clone.querySelectorAll(WIDGET_SEL).forEach((el) => el.remove())
  const cloneEls = [clone, ...dfs(clone)]
  cloneEls.forEach((el, i) => applyStyle(el, infos[i]))

  return clone.outerHTML
}

/**
 * 富文本复制：同时写入 text/html（Word / Google Docs 等保留颜色格式）与
 * text/plain（纯文本目标兜底）。优先 ClipboardItem 双格式；不支持或权限不足时
 * 退化为仅写纯文本。
 * @returns 是否至少成功了纯文本级别
 */
export async function writeRichClipboard(html: string, plain: string): Promise<boolean> {
  try {
    if (html) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
      return true
    }
    await navigator.clipboard.writeText(plain)
    return true
  } catch {
    try {
      await navigator.clipboard.writeText(plain)
      return true
    } catch {
      return false
    }
  }
}