import { $prose } from '@milkdown/kit/utils'
import { editorViewCtx } from '@milkdown/kit/core'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node } from '@milkdown/kit/prose/model'
import { useAppStore } from '../../stores/useAppStore'
import { updateDecorations } from '../../utils/incrementalDecorations'

const key = new PluginKey('mditor-language-badge')

/** 在文档里找某个节点当前的位置（点击时调用，非输入热路径）。 */
function findNodePos(doc: Node, target: Node): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node === target) {
      found = pos
      return false
    }
    return true
  })
  return found
}

/**
 * 代码块语言徽章插件：
 * 为每个 code_block 渲染一个语言徽章（右下角，如 "python"）。
 * 点击徽章时弹出 LangPicker（支持搜索过滤），由 React 组件 LangPicker 渲染。
 *
 * 性能：与复制按钮插件同样改为增量 decoration（见 utils/incrementalDecorations.ts）。
 * 旧实现每次文档变化都全量 descendants 重建整套 DecorationSet（60 万字符文档
 * 约 42ms/键），是输入卡顿的主要来源之一。
 */
export const languageBadgePlugin = $prose(() => {
  const createBadge = (block: Node): HTMLElement => {
    const badge = document.createElement('button')
    badge.className = 'code-lang-badge'
    badge.dataset.noContextmenu = 'true'
    badge.textContent = (block.attrs.language as string) || 'text'
    badge.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      const rect = badge.getBoundingClientRect()
      const { showLangPicker, editor } = useAppStore.getState()
      if (!editor) return
      const view = editor.action((ctx) => ctx.get(editorViewCtx))
      if (!view || view.isDestroyed) return
      // 位置在点击时现查：改别的块不会重建本徽章，块移动后节点对象仍是同一个
      const pos = findNodePos(view.state.doc, block)
      if (pos < 0) return
      showLangPicker({
        visible: true,
        x: rect.left,
        y: rect.bottom + 4,
        pos,
        language: (block.attrs.language as string) || '',
      })
    })
    return badge
  }

  const build = (doc: Node, from: number, to: number): Decoration[] => {
    const decos: Decoration[] = []
    doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'code_block') return
      // 空代码块不渲染徽章：徽章 widget 落在 pos + nodeSize - 1 = pos + 1，
      // 而空文本块唯一的可放光标位置正是 pos + 1 —— widget 会占住该位置，
      // 导致光标永远进不了代码块、鼠标点击也进不去。
      // 用户输入第一个字符后块即有内容，徽章随即重新出现。
      if (node.content.size === 0) return
      decos.push(Decoration.widget(pos + node.nodeSize - 1, createBadge(node), { side: 1 }))
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
