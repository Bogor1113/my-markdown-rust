import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { codeBlockToStyledHtml, writeRichClipboard } from '../utils/clipboard'
import { updateDecorations } from '../utils/incrementalDecorations'

const key = new PluginKey('mditor-code-copy')

/**
 * 复制按钮的 toDOM —— 必须是**稳定函数引用**。
 *
 * ProseMirror 判定两个 widget 是否相同（是否需要重建 DOM）的逻辑见
 * prosemirror-view 的 `WidgetType.eq`：
 *   `this.toDOM == other.toDOM && compareObjs(this.spec, other.spec)`
 * 即只要 toDOM 是同一个函数引用、spec 相等，就判为相同 → 复用 DOM、不重建。
 *
 * 旧实现 `Decoration.widget(pos, createButton(node))`：`createButton(node)` 是**调用**，
 * 返回一个全新的 DOM 元素当作 toDOM —— 每次文档变化（每敲一个字符）updateDecorations
 * 重建变化块时都会产生新元素，toDOM 引用不同 → eq 永远 false → 每键销毁重建按钮，
 * 还连带 PM 自己的 separator <img>、trailingBreak <br> 一起重建。实测 123KB 课件
 * 在代码块里每键 ~15ms，绝大部分就在这里。
 *
 * 改成稳定函数引用后：toDOM == toDOM 恒成立 → eq true → 普通输入不再重建按钮，
 * 与 codeBlockLineNumbers 的 createGutter 同一模式（后者一直是稳定函数，从未重建）。
 *
 * 按钮点击所需 code_block 不再闭包捕获旧 Node（旧 Node 每键失效、正是被迫重建的根因），
 * 改用 PM 提供的 `getPos()`（widget 当前文档位置）反查所在 code_block。
 */
const createButton = (view: EditorView, getPos: () => number | undefined): HTMLElement => {
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
    if (view.isDestroyed) return
    // getPos() 给出 widget 的当前文档位置（= code_block 末尾），向上找 code_block。
    // 不依赖闭包 Node：旧实现捕获 block 每键失效，被迫每键重建按钮。
    const wpos = getPos()
    if (wpos == null) return
    const $pos = view.state.doc.resolve(wpos)
    let block: Node | null = null
    let blockPos = -1
    for (let d = $pos.depth; d > 0; d--) {
      const n = $pos.node(d)
      if (n && n.type.name === 'code_block') {
        block = n
        blockPos = $pos.before(d)
        break
      }
    }
    if (!block) return
    const text = block.textContent
    if (!text) return
    // 富文本复制：带语法高亮颜色的 HTML + 纯文本兜底（见 utils/clipboard.ts）
    const html = blockPos >= 0 ? codeBlockToStyledHtml(view, blockPos) ?? '' : ''
    const ok = await writeRichClipboard(html, text)
    if (ok) {
      btn.textContent = '已复制'
      btn.classList.add('copied')
      setTimeout(() => {
        btn.textContent = '复制'
        btn.classList.remove('copied')
      }, 1500)
    } else {
      // 剪贴板写入失败（权限/平台限制）：按钮恢复常态，编辑器体验不因复制中断
      btn.textContent = '复制'
    }
  })
  return btn
}

/**
 * 代码块一键复制按钮插件：为每个非空 code_block 在末尾位置挂一个「复制」按钮
 * （右上角，GitHub 风格）。点击把整个代码块以「带语法高亮颜色的 HTML + 纯文本」
 * 双格式写入剪贴板。
 *
 * 性能：toDOM 用稳定函数引用（createButton），PM 的 WidgetType.eq 判定相同 →
 * 普通输入复用按钮 DOM，不再每键重建。
 */
export const copyButtonPlugin = $prose(() => {
  const build = (doc: Node, from: number, to: number): Decoration[] => {
    const decos: Decoration[] = []
    doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'code_block') return
      // 空块不渲染：widget 落在 pos + nodeSize - 1 = pos + 1，正好是空块唯一可放
      // 光标的位置，widget 会占住该位置导致光标进不去（与语言徽章同一约束）
      if (node.content.size === 0) return
      // 稳定函数引用：toDOM == toDOM → eq true → 普通输入不重建按钮
      decos.push(Decoration.widget(pos + node.nodeSize - 1, createButton, { side: 1 }))
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
  })
})
