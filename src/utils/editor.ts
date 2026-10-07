import { editorViewCtx, type Editor } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import { getMarkdown } from '@milkdown/kit/utils'

/**
 * 把当前文档序列化回 Markdown 源码字符串。
 * 用于"进入源码模式前兜底"：当 store 中的内容被清空/覆盖成空白时，
 * 从 WYSIWYG 编辑器当前文档取回真实内容。
 */
export async function serializeEditorMarkdown(editor: Editor): Promise<string> {
  return editor.action((ctx) => getMarkdown()(ctx))
}

/**
 * 把目标位置的文本块转换为代码块，并把光标精确放到代码块内部（文本末尾），可直接输入。
 *
 * @param editor Milkdown 编辑器实例
 * @param pos 目标文档位置（右键菜单传入右键点击位置；不传则用当前光标）
 *
 * 实现说明（不依赖 Milkdown 命令的选区行为，避免不同版本 setBlockType 的差异）：
 *   1. 确定目标位置：右键点击位置优先，否则当前光标。
 *   2. 若目标已在代码块内 → 直接把光标移到块内文本末尾。
 *   3. 若目标落在块间隙（如点在两段之间的空白）→ 就近落入相邻文本块。
 *   4. 手动用 replaceWith 把该文本块替换为 code_block（保留纯文本内容，
 *      自动剥离与代码块不兼容的行内 mark，如加粗/斜体/链接）。
 *   5. 光标定位到 blockStart + 1 + 文本长度 —— 该位置必然在代码块内部
 *      （空代码块时是块内唯一位置），随后 scrollIntoView + focus。
 */
export function insertCodeBlock(editor: Editor, pos?: number) {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return false
    const codeBlock = view.state.schema.nodes.code_block
    if (!codeBlock) return false
    const { state, dispatch } = view

    // 0. 有实际选区（选中了多行/多段文字）→ 把整个选区合并成一个代码块
    if (state.selection.from < state.selection.to) {
      let selFrom = Math.max(0, Math.min(state.selection.from, state.doc.content.size))
      let selTo = Math.max(selFrom + 1, Math.min(state.selection.to, state.doc.content.size))
      // 若选区落在同一代码块内，仅视为“定位到代码块”
      const $s = state.doc.resolve(selFrom)
      const $e = state.doc.resolve(selTo)
      if ($s.parent.type === codeBlock && $e.parent.type === codeBlock && $s.parent === $e.parent) {
        const end = $s.start() + $s.parent.content.size
        dispatch(state.tr.setSelection(TextSelection.create(state.doc, end)).scrollIntoView())
        view.focus()
        return true
      }
      const text = state.doc.textBetween(selFrom, selTo, '\n')
      const content = text ? state.schema.text(text) : undefined
      const tr = state.tr.replaceRangeWith(selFrom, selTo, codeBlock.create({ language: 'text' }, content))
      // 光标落到新代码块内文本末尾
      const caret = selFrom + 1 + (text ? text.length : 0)
      tr.setSelection(TextSelection.create(tr.doc, caret))
      dispatch(tr.scrollIntoView())
      view.focus()
      return true
    }

    // 1. 目标位置
    let target = pos ?? state.selection.from
    target = Math.max(0, Math.min(target, state.doc.content.size))
    let $t = state.doc.resolve(target)

    // 2. 已在代码块内：光标移到块内文本末尾
    if ($t.parent.type === codeBlock) {
      const end = $t.start() + $t.parent.content.size
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, end)).scrollIntoView())
      view.focus()
      return true
    }

    // 3. 目标不在文本块内（块间隙）→ 就近落入相邻文本块
    if (!$t.parent.isTextblock) {
      let found = -1
      if ($t.nodeAfter?.isTextblock) found = $t.pos + 1
      else if ($t.nodeBefore?.isTextblock) found = $t.pos - 1
      if (found < 0) return false
      target = found
      $t = state.doc.resolve(target)
    }

    // 4. 手动转换：目标文本块 → 代码块（保留纯文本）
    const depth = $t.depth
    const blockStart = $t.before(depth) // 文本块节点起点
    const blockEnd = $t.after(depth) // 文本块节点终点
    const text = $t.parent.textContent
    const content = text ? state.schema.text(text) : undefined
    const tr = state.tr.replaceWith(blockStart, blockEnd, codeBlock.create({ language: 'text' }, content))

    // 5. 光标精确落到代码块内（文本末尾；空块为块内唯一位置）
    const caret = blockStart + 1 + text.length
    tr.setSelection(TextSelection.create(tr.doc, caret))
    dispatch(tr.scrollIntoView())
    view.focus()
    return true
  })
}
