/// 代码块行号插件（装饰器实现）
///
/// 修复说明：旧实现通过 MutationObserver 观察 ProseMirror 的 DOM，并把 gutter
/// 直接 insertBefore 进 PM 托管的 <pre>。PM 的 DOMObserver 会把这种“外来变更”
/// 当作文档被外部修改而重排/重建节点，重建后本插件又往新 <pre> 里塞 gutter，
/// 两者同步互触发 → 无限 DOM 变更风暴 → 主线程 100% 忙死（界面卡死）。
///
/// 新实现完全基于 ProseMirror decorations：gutter 作为 node widget 由 PM 自己
/// 挂载/卸载，不对 PM DOM 做任何手写插入，也不监听 DOM。
///
/// 代码块采用 pre-wrap 折行布局（随容器宽度自适应、无横向滚动条），行号不能按
/// 文本行数静态渲染（长行折行后视觉行数 > 文本行数，底部会缺行号）。因此在 PM
/// view.update 后通过 requestAnimationFrame 测量 code 实际渲染高度，按“视觉行”
/// 数量重建行号（等量等高的 line-num，与内容严格逐行对齐）。重建只发生在
/// widget 自身内部（span 子元素），不触碰 PM 托管的节点边界，安全无风暴。
///
/// 额外约束：空代码块不渲染 gutter —— 空块唯一的可放光标位置是 pos + 1，
/// 若在此处挂 widget 会占住该位置导致光标永远进不去（与复制按钮/语言徽章同一约束）。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { Node as PMNode } from '@milkdown/kit/prose/model'

const key = new PluginKey('code-block-line-numbers')

let lastDoc: PMNode | null = null
let lastSet: DecorationSet = DecorationSet.empty

function createGutter(): HTMLDivElement {
  const gutter = document.createElement('div')
  gutter.className = 'code-gutter'
  return gutter
}

/**
 * 统计 code 元素的视觉行数。
 *
 * 主路径：用 Range 选中 code 全部内容后 getClientRects()，每个 line box 对应
 * 一个 rect、top 各异；按 top 去重即得视觉行数。此法直接枚举浏览器实际渲染出的
 * line box，对 pre-wrap 折行、hljs 行内 span、亚像素误差、字体度量差异全部鲁棒。
 *
 * 兜底：若 getClientRects 返回空（如 layout 尚未稳定 / Range 不可用），用
 * max(文本行数, ceil(height/lh - ε)) 估算。文本行数是无折行时的下界、防止
 * 高度法在边界处少算；ceil + ε 容差防止亚像素累积误差把整行抹掉。
 */
function countVisualLines(code: HTMLElement, lh: number): number {
  let visualRows = 0
  try {
    const range = document.createRange()
    range.selectNodeContents(code)
    const rects = range.getClientRects()
    const tops = new Set<number>()
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      if (r.height <= 0) continue
      // 整像素容差：同一 line box 内的多个 rect（来自 hljs span 等）会落到同一整数 top
      tops.add(Math.round(r.top))
    }
    visualRows = tops.size
  } catch {
    /* fallthrough to 兜底 */
  }

  const text = code.textContent ?? ''
  // 文本行数：无折行时 = 视觉行数；有折行时为下界。trailing \n 不计入（空行无内容）
  const textLines = text === '' ? 1 : text.replace(/\n+$/, '').split('\n').length

  if (visualRows > 0) return Math.max(visualRows, textLines)

  // 兜底：高度估算。ceil + ε 容差防亚像素累积误差把整行抹掉
  const heightRows = Math.max(1, Math.ceil(code.getBoundingClientRect().height / lh - 0.4))
  return Math.max(textLines, heightRows, 1)
}

/** 按视觉行数重建行号 span（等量等高，逐行对齐折行后的代码） */
function syncGutterRows(gutter: HTMLElement, code: HTMLElement, lh: number) {
  const rows = countVisualLines(code, lh)
  const cur = gutter.querySelectorAll('.line-num')
  if (cur.length === rows) return
  gutter.textContent = ''
  const frag = document.createDocumentFragment()
  for (let i = 1; i <= rows; i++) {
    const span = document.createElement('span')
    span.className = 'line-num'
    span.textContent = String(i)
    frag.appendChild(span)
  }
  gutter.appendChild(frag)
}

function build(state: EditorState): DecorationSet {
  if (state.doc === lastDoc) return lastSet

  const decos: Decoration[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return
    // 空块不渲染：widget 会占住块内唯一可插入光标的位置
    if (node.content.size === 0) return
    // side: -2 → widget 渲染在代码块首字符之前（pre 内部、内容左侧）
    decos.push(Decoration.widget(pos + 1, createGutter, { side: -2 }))
  })

  lastDoc = state.doc
  lastSet = decos.length === 0 ? DecorationSet.empty : DecorationSet.create(state.doc, decos)
  return lastSet
}

export const codeBlockLineNumbers = $prose(() =>
  new Plugin({
    key,
    props: {
      decorations: (state) => build(state),
    },
    view: (view) => {
      let raf = 0
      let scrollRaf = 0
      // view.scrollDOM 是 ProseMirror 的滚动元素（运行时存在，此版本类型未导出），
      // Milkdown 下它是包裹 .ProseMirror 的滚动容器。取不到时回退到 view.dom。
      const scrollRoot: HTMLElement =
        (view as unknown as { scrollDOM?: HTMLElement }).scrollDOM ?? view.dom
      const sync = () => {
        raf = 0
        if (view.isDestroyed) return
        // 只同步视口内的代码块：大文档可能含数百个 code 块，对全部做
        // getBoundingClientRect + getClientRects 会强制整页重排（layout
        // thrash），是滚动/编辑卡死的主因之一。视口外的块由
        // content-visibility 跳过渲染，滚入视口后由 scroll 监听补同步。
        const rootRect = scrollRoot.getBoundingClientRect()
        const pres = view.dom.querySelectorAll('.ProseMirror pre')
        for (const pre of pres) {
          if (!(pre instanceof HTMLElement)) continue
          const gutter = pre.querySelector<HTMLElement>('.code-gutter')
          const code = pre.querySelector<HTMLElement>('code')
          if (!gutter || !code) continue
          // 跳过明显在视口外的代码块（含 content-visibility 未渲染的占位块）
          const preRect = pre.getBoundingClientRect()
          const inView =
            preRect.bottom >= rootRect.top - 200 && preRect.top <= rootRect.bottom + 200
          if (!inView) continue
          const style = getComputedStyle(pre)
          const lh = parseFloat(style.lineHeight)
          if (!lh || !isFinite(lh)) continue
          syncGutterRows(gutter, code, lh)
        }
      }
      const schedule = () => {
        if (raf) return
        raf = requestAnimationFrame(sync)
      }
      // 滚动时补充同步滚入视口的代码块行号（content-visibility 让屏幕外块
      // 不渲染，行号需在可见时才补算）。节流到每帧一次。
      const onScroll = () => {
        if (scrollRaf) return
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = 0
          if (raf) return
          raf = requestAnimationFrame(sync)
        })
      }
      scrollRoot.addEventListener('scroll', onScroll, { passive: true })
      // 窗口/容器宽度变化 → 折行数变化 → 行号错位，需重新同步。
      // 旧实现只监听 doc 变化和 scroll，resize 后要等下一次编辑/滚动才恢复对齐。
      let resizeObserver: ResizeObserver | null = null
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => schedule())
        resizeObserver.observe(scrollRoot)
      }
      return {
        // 仅文档内容变化时才同步行号；纯光标移动/选区变化不触发（避免
        // 每按一次方向键都对全部 code 块强制重排）。
        update: (updatedView, prevState) => {
          if (updatedView.state.doc === prevState.doc) return
          schedule()
        },
        destroy: () => {
          if (raf) cancelAnimationFrame(raf)
          if (scrollRaf) cancelAnimationFrame(scrollRaf)
          scrollRoot.removeEventListener('scroll', onScroll)
          resizeObserver?.disconnect()
          lastDoc = null
          lastSet = DecorationSet.empty
        },
      }
    },
  })
)