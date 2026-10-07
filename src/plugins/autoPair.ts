/// Markdown 符号自动配对插件
///
/// 输入 * _ ` ~ 等符号时自动配对，选中文本时包裹选区。
/// 删除配对符号的前半部分时自动删除后半部分。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'

const key = new PluginKey('auto-pair')

const PAIRS: Record<string, string> = {
  '*': '*',
  '_': '_',
  '`': '`',
  '~': '~',
  '【': '】',
  '「': '」',
  '（': '）',
  '"': '"',
  "'": "'",
}

// 前一个字符是这些时，认为是新符号的开始，自动配对
const SEPARATORS = /[\s\n\r\(\[\{【「（「"'"-—,.;:!?。！？、，。；：]/

export const autoPairPlugin = $prose(() =>
  new Plugin({
    key,
    props: {
      handleTextInput(_view, _from, _to, text) {
        if (text.length !== 1) return false

        const pair = PAIRS[text]
        if (!pair) return false

        const { state } = _view
        const { selection } = state

        // 有选区时：包裹选区
        if (!selection.empty) {
          const selected = state.doc.textBetween(selection.from, selection.to)
          const tr = state.tr.insertText(text + selected + pair)
          _view.dispatch(tr)
          return true
        }

        // 光标在行首或前一个字符是空白/标点时：直接插入配对
        const $from = state.selection.$from
        const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
        const lastChar = textBefore.slice(-1)

        const shouldAutoPair =
          textBefore.length === 0 ||
          SEPARATORS.test(lastChar)

        if (shouldAutoPair) {
          const tr = state.tr.insertText(text + pair)
          tr.setSelection(TextSelection.near(tr.doc.resolve(state.selection.$from.pos + 1)))
          _view.dispatch(tr)
          return true
        }

        return false
      },

      handleKeyDown(_view, event) {
        if (event.key === 'Backspace') {
          const { state } = _view
          const { selection } = state
          if (!selection.empty) return false

          const $pos = state.selection.$from
          const textAfter = $pos.parent.textContent.slice($pos.parentOffset)
          const textBefore = $pos.parent.textContent.slice(0, $pos.parentOffset)

          const lastChar = textBefore.slice(-1)
          const nextChar = textAfter.slice(0, 1)

          if (lastChar && PAIRS[lastChar] === nextChar) {
            event.preventDefault()
            const tr = state.tr.delete($pos.pos - 1, $pos.pos + 1)
            _view.dispatch(tr)
            return true
          }
        }

        if (event.key === 'Delete') {
          const { state } = _view
          const { selection } = state
          if (!selection.empty) return false

          const $pos = state.selection.$from
          const textAfter = $pos.parent.textContent.slice($pos.parentOffset)
          const textBefore = $pos.parent.textContent.slice(0, $pos.parentOffset)

          const lastChar = textBefore.slice(-1)
          const nextChar = textAfter.slice(0, 1)

          if (lastChar && PAIRS[lastChar] === nextChar) {
            event.preventDefault()
            const tr = state.tr.delete($pos.pos - 1, $pos.pos + 1)
            _view.dispatch(tr)
            return true
          }
        }

        return false
      },
    },
  })
)
