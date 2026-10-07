import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { codeBlockToStyledHtml, writeRichClipboard } from '../utils/clipboard'

const key = new PluginKey('mditor-code-copy')

/**
 * 代码块一键复制按钮插件：
 * 为每个非空 code_block 在末尾位置挂一个「复制」按钮（右上角，GitHub 风格）。
 * - 点击 → 把整个代码块以「带语法高亮颜色的 HTML + 纯文本」双格式写入剪贴板
 *   （粘到 Word / 富文本编辑器保留配色；粘到终端等普通输入框自动用纯文本），
 *   按钮短暂显示「已复制」反馈；
 * - mousedown 不冒泡不默认：不移动当前光标/选区，也不拿走焦点；
 * - 空代码块不渲染：widget 落在 pos + nodeSize - 1 = pos + 1，正好是空块唯一可放
 *   光标的位置，widget 会占住该位置导致光标进不去（与语言徽章同一约束）。
 */
export const copyButtonPlugin = $prose(() => {
  const cache = new Map<number, HTMLElement>()
  /** 每次装饰重建时刷新：代码块内容变化后按钮仍复制到最新文本 */
  const textByPos = new Map<number, string>()
  let curDoc: Node | null = null
  let curView: EditorView | null = null
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
        textByPos.delete(pos)
      }
    }
  }

  const createButton = (pos: number): HTMLElement => {
    const btn = document.createElement('button')
    btn.className = 'code-copy-btn'
    btn.textContent = '复制'
    btn.title = '复制代码'
    // 右键菜单插件放行自我处理（与语言徽章一致）
    btn.dataset.noContextmenu = 'true'

    // 阻止 mousedown：按钮点击不应改变编辑器光标/选区，也不抢焦点
    btn.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      e.preventDefault()
    })
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      e.preventDefault()
      const node = curDoc?.nodeAt(pos)
      const text = node ? node.textContent : (textByPos.get(pos) ?? '')
      if (!text) return
      // 富文本复制：带语法高亮颜色的 HTML + 纯文本兜底（见 utils/clipboard.ts）
      const html = curView ? (codeBlockToStyledHtml(curView, pos) ?? '') : ''
      const ok = await writeRichClipboard(html, text)
      if (ok) {
        btn.textContent = '已复制'
        btn.classList.add('copied')
        setTimeout(() => {
          btn.textContent = '复制'
          btn.classList.remove('copied')
        }, 1500)
      } else {
        // 剪贴板写入失败（权限/平台限制）：按钮恢复常态即可，编辑器体验不因复制中断
        btn.textContent = '复制'
      }
    })
    return btn
  }

  return new Plugin({
    key,
    props: {
      decorations: (state) => {
        if (state.doc === lastDoc) return lastSet
        curDoc = state.doc

        const decos: Decoration[] = []
        state.doc.descendants((node, pos) => {
          if (node.type.name !== 'code_block') return

          textByPos.set(pos, node.textContent)
          // 空块不渲染（见文件头注释：widget 会阻断光标进入唯一可插入位）
          if (node.content.size === 0) return

          let widget = cache.get(pos)
          if (!widget) {
            widget = createButton(pos)
            cache.set(pos, widget)
          }
          decos.push(Decoration.widget(pos + node.nodeSize - 1, widget, { side: 1 }))
        })

        lastDoc = state.doc
        lastSet = decos.length === 0 ? DecorationSet.empty : DecorationSet.create(state.doc, decos)
        return lastSet
      },
    },
    view: (view) => {
      curView = view
      let lastPrunedDoc: Node | null = null
      const pruneIfNeeded = (doc: Node) => {
        if (doc === lastPrunedDoc) return
        lastPrunedDoc = doc
        pruneCache(doc)
      }
      pruneIfNeeded(view.state.doc)
      return {
        update: (updatedView) => {
          curView = updatedView
          pruneIfNeeded(updatedView.state.doc)
        },
        destroy: () => {
          curView = null
          cache.clear()
          textByPos.clear()
          curDoc = null
        },
      }
    },
  })
})