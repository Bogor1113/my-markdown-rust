import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node } from '@milkdown/kit/prose/model'
import { useAppStore } from '../../stores/useAppStore'

const key = new PluginKey('mditor-language-badge')

/**
 * 代码块语言徽章插件：
 * 为每个 code_block 渲染一个语言徽章（右下角，如 "python"）。
 * 点击徽章时弹出 LangPicker（支持搜索过滤），由 React 组件 LangPicker 渲染。
 */
export const languageBadgePlugin = $prose(() => {
  const cache = new Map<number, HTMLElement>()
  const langByPos = new Map<number, string>()
  let lastDoc: Node | null = null
  let lastSet: DecorationSet = DecorationSet.empty

  const pruneCache = (doc: Node) => {
    const valid = new Set<number>()
    doc.descendants((node, pos) => {
      if (node.type.name === 'code_block') valid.add(pos)
    })
    for (const pos of [...cache.keys()]) {
      if (!valid.has(pos)) {
        cache.delete(pos)
        langByPos.delete(pos)
      }
    }
  }

  return new Plugin({
    key,
    props: {
      decorations: (state) => {
        if (state.doc === lastDoc) return lastSet

        const decos: Decoration[] = []
        state.doc.descendants((node, pos) => {
          if (node.type.name !== 'code_block') return

          langByPos.set(pos, (node.attrs.language as string) || '')

          // 空代码块不渲染徽章：徽章 widget 落在 pos + nodeSize - 1 = pos + 1，
          // 而空文本块唯一的可放光标位置正是 pos + 1 —— widget 会占住该位置，
          // 导致光标永远进不了代码块、鼠标点击也进不去。
          // 用户输入第一个字符后块即有内容，徽章随即重新出现。
          if (node.content.size === 0) return

          let widget = cache.get(pos)
          if (!widget) {
            widget = document.createElement('button')
            widget.className = 'code-lang-badge'
            widget.dataset.noContextmenu = 'true'
            widget.addEventListener('click', (e) => {
              e.stopPropagation()
              e.preventDefault()
              const rect = widget!.getBoundingClientRect()
              const { showLangPicker, editor } = useAppStore.getState()
              if (!editor) return
              showLangPicker({
                visible: true,
                x: rect.left,
                y: rect.bottom + 4,
                pos,
                language: langByPos.get(pos) ?? '',
              })
            })
            cache.set(pos, widget)
          }
          widget.textContent = langByPos.get(pos) ?? 'text'

          decos.push(Decoration.widget(pos + node.nodeSize - 1, widget, { side: 1 }))
        })

        lastDoc = state.doc
        lastSet = decos.length === 0 ? DecorationSet.empty : DecorationSet.create(state.doc, decos)
        return lastSet
      },
    },
    view: (view) => {
      let lastPrunedDoc: Node | null = null
      const pruneIfNeeded = (doc: Node) => {
        if (doc === lastPrunedDoc) return
        lastPrunedDoc = doc
        pruneCache(doc)
      }
      pruneIfNeeded(view.state.doc)
      return {
        update: (updatedView) => pruneIfNeeded(updatedView.state.doc),
        destroy: () => {
          cache.clear()
          langByPos.clear()
          useAppStore.getState().hideLangPicker()
        },
      }
    },
  })
})