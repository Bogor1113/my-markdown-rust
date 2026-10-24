import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { codeBlockToStyledHtml, writeRichClipboard } from '../utils/clipboard'
import { updateDecorations } from '../utils/incrementalDecorations'

const key = new PluginKey('mditor-code-copy')

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
 * 代码块一键复制按钮插件：
 * 为每个非空 code_block 在末尾位置挂一个「复制」按钮（右上角，GitHub 风格）。
 * - 点击 → 把整个代码块以「带语法高亮颜色的 HTML + 纯文本」双格式写入剪贴板
 *   （粘到 Word / 富文本编辑器保留配色；粘到终端等普通输入框自动用纯文本），
 *   按钮短暂显示「已复制」反馈；
 * - mousedown 不冒泡不默认：不移动当前光标/选区，也不拿走焦点；
 * - 空代码块不渲染：widget 落在 pos + nodeSize - 1 = pos + 1，正好是空块唯一可放
 *   光标的位置，widget 会占住该位置导致光标进不去（与语言徽章同一约束）。
 *
 * 性能：旧实现每次文档变化都全量 descendants 重建整套 DecorationSet（60 万字符
 * 文档约 42ms/键）。现在只重扫发生变化的顶层块，其余 widget 由 ProseMirror
 * 按位置平移复用，单键成本降到 ~0.1ms（见 utils/incrementalDecorations.ts）。
 */
export const copyButtonPlugin = $prose(() => {
  let viewRef: EditorView | null = null

  const createButton = (block: Node): HTMLElement => {
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
      const view = viewRef
      if (!view || view.isDestroyed) return
      // 节点对象未变（改别的块不会重建本按钮），位置在点击时现查
      const pos = findNodePos(view.state.doc, block)
      const text = block.textContent
      if (!text) return
      // 富文本复制：带语法高亮颜色的 HTML + 纯文本兜底（见 utils/clipboard.ts）
      const html = pos >= 0 ? (codeBlockToStyledHtml(view, pos) ?? '') : ''
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

  const build = (doc: Node, from: number, to: number): Decoration[] => {
    const decos: Decoration[] = []
    doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'code_block') return
      // 空块不渲染（见文件头注释：widget 会阻断光标进入唯一可插入位）
      if (node.content.size === 0) return
      decos.push(Decoration.widget(pos + node.nodeSize - 1, createButton(node), { side: 1 }))
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
    view: (view) => {
      viewRef = view
      return {
        destroy: () => {
          viewRef = null
        },
      }
    },
  })
})
