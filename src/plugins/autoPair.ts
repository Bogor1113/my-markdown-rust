/// 自动配对插件
///
/// 分两类，行为与 Typora 保持一致：
/// 1. **括号/引号**（() 【】 「」 "" ''）—— 敲一个就补一个闭合符，光标停在中间，
///    再敲同一个闭合符则「越过」而不是打重复（见 handleTextInput 末段）。
/// 2. **Markdown 符号**（* _ ` ~）—— **不做裸输入配对**。
///    Typora 默认也只配对括号与引号，把 * _ 交给「自动配对 Markdown 符号」这个
///    单独开关（默认关）。裸配对会破坏 Markdown 语法的自然输入：
///    敲 `**加粗**` 时第一个 `*` 被补成 `**`，后面再敲两个 `*` 就多出一个，
///    结果是 `**加粗***`，残留的 `*` 会原样写进文件；
///    敲 ``` ``` ``` 时光标停在两个反引号之间，围栏永远凑不齐三个。
///    只有在**有选区**时仍保留配对能力（选中文字再敲 `*` = 包一层斜体），
///    因为这是明确的「包起来」意图，不存在歧义。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'

const key = new PluginKey('auto-pair')

/** 「越过闭合符」事务的标记：这类事务不改文档，但确实完成了一次输入。
 *  typoraInput.ts 的收尾转换靠它判断「这一帧有输入」，否则
 *  `[文字](地址)` 的最后一个 `)` 被越过之后没有任何 docChanged 事务，
 *  转换逻辑永远不会被触发。 */
export const PAIR_SKIP_META = 'mditor-pair-skip'

/** 裸输入即配对的字符（Typora 默认行为：只配对括号与引号） */
const PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '【': '】',
  '「': '」',
  '（': '）',
  '"': '"',
  "'": "'",
}

/** 仅在有选区时用于包裹选区的 Markdown 符号 */
const WRAP_PAIRS: Record<string, string> = {
  '*': '*',
  _: '_',
  '`': '`',
  '~': '~',
  '=': '=',
}

/** 闭合符 → 开符，用于「敲闭合符直接越过」 */
const CLOSERS: Record<string, string> = Object.fromEntries(
  Object.entries(PAIRS).map(([o, c]) => [c, o])
)

// 前一个字符是这些时，认为是新符号的开始，自动配对。
// 注意：`-` 必须转义或放在字符类末尾，否则与相邻字符构成范围
// （历史上 `"'` 后的 `"-—` 曾形成 U+0022–U+2014 的范围，把所有英文/数字
// 都当成分隔符，导致 `**加粗**` 语法完全无法正常键入）。
const SEPARATORS = /[\s\n\r()[\]{}【「（"'“‘’\-—,.;:!?。！？、，。；：]/

export const autoPairPlugin = $prose(() =>
  new Plugin({
    key,
    props: {
      handleTextInput(_view, _from, _to, text) {
        if (text.length !== 1) return false

        const { state } = _view
        const { selection } = state

        // 有选区时：把选区用符号包起来（Markdown 符号也只在这种明确意图下生效）
        if (!selection.empty) {
          const pair = PAIRS[text] ?? WRAP_PAIRS[text]
          if (!pair) return false
          // `**`/`~~` 这类需要成对出现的符号，包裹时补齐两侧
          const open = text
          const close = pair
          const selected = state.doc.textBetween(selection.from, selection.to)
          const tr = state.tr.insertText(open + selected + close)
          tr.setSelection(
            TextSelection.create(tr.doc, selection.from + open.length, selection.from + open.length + selected.length)
          )
          _view.dispatch(tr)
          return true
        }

        // 敲的是闭合符、且下一个字符正好是同一个闭合符 —— 直接「越过」，
        // 否则 `(a)` 这类输入会变成 `()` 后再手动删掉多余的括号。
        if (CLOSERS[text]) {
          const at = selection.$from
          const nextChar = at.parent.textContent.slice(at.parentOffset, at.parentOffset + 1)
          // 后面正好是同一个闭合符 → 说明这是自动配出来的那一半，直接越过。
          // 只在「后面确实还有闭合符」时才越过，所以真实的 `))` 输入不受影响。
          if (nextChar === text) {
            const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(at.pos + 1)))
            tr.setMeta(PAIR_SKIP_META, true)
            _view.dispatch(tr)
            return true
          }
          return false
        }

        const pair = PAIRS[text]
        if (!pair) return false

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
