import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'

let mermaidLib: any = null
let mermaidIdCounter = 0
/** mermaid.initialize 当前生效的主题（init 只需在主题变化时重跑） */
let initializedTheme = ''

function currentMermaidTheme(): string {
  const t = document.documentElement.getAttribute('data-theme')
  return t === 'light' || t === 'paper' ? 'default' : 'dark'
}

async function getMermaid() {
  if (!mermaidLib) {
    const mod = await import('mermaid')
    mermaidLib = (mod as any).default || mod
  }
  // 每次渲染前核对主题：旧实现只在首次 import 时 initialize 一次，
  // 主题被永久固定，切换亮/暗后图表永远是旧配色。
  const theme = currentMermaidTheme()
  if (theme !== initializedTheme) {
    mermaidLib.initialize({
      startOnLoad: false,
      theme,
      securityLevel: 'strict',
    })
    initializedTheme = theme
  }
  return mermaidLib
}

/**
 * 渲染 Mermaid 代码到容器（结果按代码内容缓存）。
 *
 * 关键：`mermaid.render()` 是同步的 SVG 布局计算（20–80ms/图）。
 * 老实现把 widget 的 toDOM 写成「每次调用新建的箭头函数」，
 * 而 ProseMirror 判定 widget 是否相同比较的正是 toDOM 引用——
 * 新函数 ≠ 旧函数，于是每敲一个字符、甚至每移动一次光标，
 * 文档里所有图都会被销毁重建并重跑一遍完整渲染。
 *
 * 现在做两级缓存：
 * 1. `svgCache`：代码文本 → 已渲染 SVG。即使块的文档位置因编辑而漂移，
 *    只要源码没变就直接复用 SVG 字符串，不再触发昂贵的 render。
 * 2. `widgets`：文档位置 → 已构造的容器 DOM。位置未变时把**同一个 DOM 元素**
 *    交给 Decoration.widget（传元素而非函数），ProseMirror 的 eq 判定为相同，
 *    连 DOM 都不会重建。
 */
/** 渲染结果缓存上限。单张 mermaid SVG 字符串可达数十 KB，60 张时最坏可积到
 *  数 MB 的常驻字符串；真实文档同时需要的去重图表很少，24 张已经富余。 */
const SVG_CACHE_LIMIT = 24
const svgCache = new Map<string, string>()
/**
 * 渲染纪元：主题切换时 +1，widget 缓存里旧纪元的 DOM 全部作废重建
 * （仅清 svgCache 不够——同位置同源码的 widget 会直接复用旧主题的容器 DOM）。
 */
let renderEpoch = 0

/** 存活的编辑器视图：主题切换时派发空事务触发 decorations 重算 */
const liveViews = new Set<EditorView>()

/**
 * 主题切换后调用（applyTheme）：旧主题的 SVG 全部失效，
 * 所有存活的 mermaid 图按新主题重新渲染。
 */
export function refreshMermaidTheme() {
  // mermaid 尚未加载（还没渲染过图）：无需处理，首次渲染自动按当前主题
  if (!mermaidLib) return
  if (currentMermaidTheme() === initializedTheme) return
  svgCache.clear()
  renderEpoch++
  for (const view of liveViews) {
    if (view.isDestroyed) continue
    // 空事务（无 doc 变更）驱动 decorations 重算 → build 检测到 epoch 变化重建 widget
    view.dispatch(view.state.tr)
  }
}

function renderInto(container: HTMLElement, code: string, id: string) {
  const cached = svgCache.get(code)
  if (cached !== undefined) {
    container.innerHTML = cached
    container.classList.remove('mermaid-loading')
    container.classList.add('mermaid-rendered')
    return
  }

  getMermaid()
    .then((m: any) => m.render(id, code))
    .then(({ svg }: { svg: string }) => {
      // 缓存（Map 保持插入顺序，超限淘汰最旧的，避免长会话内存无限增长）
      if (svgCache.size >= SVG_CACHE_LIMIT) {
        const oldest = svgCache.keys().next().value
        if (oldest !== undefined) svgCache.delete(oldest)
      }
      svgCache.set(code, svg)

      // 容器可能已被 ProseMirror 销毁（编辑/切换标签）：只缓存，不写 DOM
      if (!container.isConnected) return
      container.innerHTML = svg
      container.classList.remove('mermaid-loading')
      container.classList.add('mermaid-rendered')
    })
    .catch((err: any) => {
      if (!container.isConnected) return
      // 错误信息可能含尖括号，用 textContent 避免把内容当 HTML 解析
      container.textContent = `Mermaid 渲染错误: ${String(err)}`
      container.classList.remove('mermaid-loading')
      container.classList.add('mermaid-error-wrap')
    })
}

const key = new PluginKey('mermaid-render')

export const mermaidPlugin = $prose(() => {
  /** 上一次计算时的 doc 引用（内容未变则完全复用，光标移动零成本） */
  let lastDoc: PMNode | null = null
  let lastEpoch = renderEpoch
  let lastSet: DecorationSet = DecorationSet.empty
  /** 位置 → (源码, 纪元, 容器DOM)，每次重算时重建，天然完成了失效项的回收 */
  let widgets = new Map<number, { code: string; epoch: number; el: HTMLElement }>()

  const build = (state: { doc: PMNode }): DecorationSet => {
    // 快路径：doc 引用未变且主题纪元未变（光标移动、选区变化）→ 直接复用上一份
    if (state.doc === lastDoc && lastEpoch === renderEpoch) return lastSet

    const next = new Map<number, { code: string; epoch: number; el: HTMLElement }>()
    const decos: Decoration[] = []

    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'code_block') return
      if ((node.attrs.language as string) !== 'mermaid') return

      const code = node.textContent
      const prev = widgets.get(pos)
      let el: HTMLElement

      if (prev && prev.code === code && prev.epoch === renderEpoch) {
        // 同一位置 + 同一源码 + 同一主题纪元 → 连 DOM 元素一起复用
        el = prev.el
      } else {
        el = document.createElement('div')
        el.className = 'mermaid-container mermaid-loading'
        el.dataset.mermaidId = `mermaid-${++mermaidIdCounter}`
        renderInto(el, code, el.dataset.mermaidId)
      }
      next.set(pos, { code, epoch: renderEpoch, el })
      // 传 DOM 元素而非函数：位置未变时 ProseMirror 判定 widget 相等，不重建 DOM
      decos.push(Decoration.widget(pos, el, { side: 1 }))
    })

    widgets = next
    lastDoc = state.doc
    lastEpoch = renderEpoch
    lastSet = decos.length === 0 ? DecorationSet.empty : DecorationSet.create(state.doc, decos)
    return lastSet
  }

  return new Plugin({
    key,
    props: {
      decorations: build,
    },
    view: (view) => {
      liveViews.add(view)
      return {
        destroy: () => {
          liveViews.delete(view)
          widgets = new Map()
          lastDoc = null
          lastEpoch = renderEpoch
          lastSet = DecorationSet.empty
          svgCache.clear()
        },
      }
    },
  })
})
