import { $prose } from '@milkdown/kit/utils'
import { editorViewCtx } from '@milkdown/kit/core'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { useAppStore } from '../../stores/useAppStore'
import { updateDecorations } from '../../utils/incrementalDecorations'

const key = new PluginKey('mditor-language-badge')

/**
 * 语言徽章的 toDOM —— 稳定函数引用 + spec.key 携带语言。
 *
 * PM 的 WidgetType.eq（见 prosemirror-view）：
 *   `this.spec.key && this.spec.key == other.spec.key || this.toDOM == other.toDOM && ...`
 * 即：key 相同 → 复用 DOM；key 不同 → 重建。
 *
 * 普通输入：语言不变 → key 相同 → 复用徽章 DOM（不再每键重建，与复制按钮、
 * 行号槽同一模式）。用户通过 LangPicker 改语言：key 变 → 重建出带新语言文本的徽章。
 *
 * 旧实现 `Decoration.widget(pos, createBadge(node))` 每键返回新元素 → eq 永远 false
 * → 每键重建徽章（+ 牵连 PM separator/trailingBreak）。实测 123KB 课件代码块
 * 每键 ~15ms 的一半就来自这个徽章。
 *
 * 点击所需 code_block 用 `getPos()`（widget 当前文档位置）反查，不闭包捕获旧 Node。
 */
const createBadge = (view: EditorView, getPos: () => number | undefined): HTMLElement => {
  const badge = document.createElement('button')
  badge.className = 'code-lang-badge'
  badge.dataset.noContextmenu = 'true'
  // 语言从文档现取（getPos → 向上找 code_block）。徽章只在语言变化时重建，
  // 重建那一刻读到的是新语言，之后 eq true 一直复用，文本保持正确。
  const wpos0 = getPos()
  if (wpos0 != null) {
    const $pos = view.state.doc.resolve(wpos0)
    for (let d = $pos.depth; d > 0; d--) {
      const n = $pos.node(d)
      if (n && n.type.name === 'code_block') {
        badge.textContent = (n.attrs.language as string) || 'text'
        break
      }
    }
  }
  badge.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (view.isDestroyed) return
    const rect = badge.getBoundingClientRect()
    const { showLangPicker, editor } = useAppStore.getState()
    if (!editor) return
    const v = editor.action((ctx) => ctx.get(editorViewCtx))
    if (!v || v.isDestroyed) return
    // getPos() 给 widget 当前文档位置，向上找 code_block
    const wpos = getPos()
    if (wpos == null) return
    const $pos = v.state.doc.resolve(wpos)
    for (let d = $pos.depth; d > 0; d--) {
      const n = $pos.node(d)
      if (n && n.type.name === 'code_block') {
        showLangPicker({
          visible: true,
          x: rect.left,
          y: rect.bottom + 4,
          pos: $pos.before(d),
          language: (n.attrs.language as string) || '',
        })
        break
      }
    }
  })
  return badge
}

/**
 * 代码块语言徽章插件：为每个 code_block 渲染语言徽章（右下角，如 "python"）。
 * 点击徽章弹出 LangPicker（支持搜索过滤）。
 *
 * 性能：toDOM 用稳定函数引用 + key=语言。普通输入语言不变 → 复用徽章 DOM，
 * 不再每键重建；仅语言变化时重建。
 */
export const languageBadgePlugin = $prose(() => {
  const build = (doc: Node, from: number, to: number): Decoration[] => {
    const decos: Decoration[] = []
    doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'code_block') return
      // 空代码块不渲染徽章：徽章 widget 落在 pos + nodeSize - 1 = pos + 1，
      // 而空文本块唯一的可放光标位置正是 pos + 1 —— widget 会占住该位置，
      // 导致光标永远进不了代码块、鼠标点击也进不去。
      // 用户输入第一个字符后块即有内容，徽章随即重新出现。
      if (node.content.size === 0) return
      const lang = (node.attrs.language as string) || ''
      // key 携带语言：语言不变 → eq true 复用；语言变 → 重建出新文本
      decos.push(
        Decoration.widget(pos + node.nodeSize - 1, createBadge, {
          side: 1,
          key: 'code-lang-badge:' + lang,
        }),
      )
    })
    return decos
  }

  return new Plugin({
    key,
    state: {
      init: (_config, state) => ({
        doc: state.doc,
        set: DecorationSet.create(state.doc, build(state.doc, 0, state.doc.content.size)),
      }),
      apply: (tr, value) =>
        tr.docChanged
          ? { doc: tr.doc, set: updateDecorations(value.doc, tr.doc, value.set, build) }
          : value,
    },
    props: {
      decorations: (state) => key.getState(state)!.set,
    },
    view: () => ({
      destroy: () => {
        useAppStore.getState().hideLangPicker()
      },
    }),
  })
})
