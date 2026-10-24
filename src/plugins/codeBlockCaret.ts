import { $prose } from '@milkdown/kit/utils'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'

/**
 * 代码块「末尾空行 / 底部留白」点击修复。
 *
 * 现象：代码块最后那行空行点不进去，光标落不到那里、也没法接着输入；
 * 代码文字下方的那块内边距同样点不动。
 *
 * 根因（ProseMirror 的坐标映射，不是样式问题）：
 *  1. 代码块文本以 `\n` 结尾时，PM 会在内容末尾补一个
 *     <br class="ProseMirror-trailingBreak"> 让末尾空行可见；
 *  2. 点在那一行 / 那一行下方时，浏览器 caretPositionFromPoint 给不出块内的文本位置
 *     （落在 <br> 之后或 <pre> 自身），PM 的 posAtCoords 要么忽略该位置、要么退回
 *     posFromElement，最终解析成「代码块之后」或「最后一个字符之前」——
 *     光标于是被丢到块外，或停在上一行行尾，表现为「点不动 / 打不了字」。
 *  键盘不受影响（ArrowDown 能走到末位），所以只有鼠标失效。
 *
 * 修法：不依赖 posAtCoords 的返回值，直接按几何位置判断——
 * 点击落在最后一行可见文字的**下方**时，把光标放到对应的末尾空行
 * （第 k 个空行 → 最后一个可见字符之后第 k 个位置，超出则夹到块尾）；
 * 点击落在第一行上方（顶部内边距）时放到块首。
 * 其余点击一律 return false，完全交还 ProseMirror，不影响正常点击、拖选、双击选词。
 */

/** 这些元素有自己的交互（语言徽章、复制按钮、行号槽），不要接管它们的点击 */
const SKIP_SELECTOR = '[data-no-contextmenu], .code-gutter, button'

/** 裸 ProseMirror 插件（导出给复现脚本/测试直接使用） */
export function createCodeBlockCaretPlugin() {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, rawEvent) {
          const event = rawEvent as MouseEvent
          // 只处理「普通左键单击」；带修饰键（多选/拖拽）和双击三击不干预
          if (event.button !== 0 || event.detail > 1) return false
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false

          const target = event.target as HTMLElement | null
          if (!target || typeof target.closest !== 'function') return false
          if (target.closest(SKIP_SELECTOR)) return false

          const pre = target.closest('pre')
          if (!pre || !view.dom.contains(pre)) return false

          let blockPos: number
          try {
            blockPos = view.posAtDOM(pre, 0)
          } catch {
            return false
          }

          // 用 ResolvedPos 取块内真实边界：posAtDOM 对 <pre>/<code> 这种
          // 「外层 dom ≠ 内容 dom」的结构可能偏一位，不能直接拿来算 nodeSize。
          let $p
          try {
            $p = view.state.doc.resolve(blockPos + 1)
          } catch {
            return false
          }
          const node = $p.parent
          // 只处理非空代码块：空块只有块首一个位置，PM 自己就能正确定位
          if (node.type.name !== 'code_block' || node.content.size === 0) return false

          const text = node.textContent
          const firstPos = $p.start($p.depth)
          const blockEnd = $p.end($p.depth)

          // 最后一个「可见」字符（跳过末尾连续换行）
          let lastVisible = text.length - 1
          while (lastVisible >= 0 && (text[lastVisible] === '\n' || text[lastVisible] === '\r')) {
            lastVisible--
          }
          if (lastVisible < 0) return false

          const lastVisiblePos = firstPos + lastVisible

          const firstBox = view.coordsAtPos(firstPos)
          const lastBox = view.coordsAtPos(lastVisiblePos)
          if (!firstBox || !lastBox) return false

          let dest: number
          if (event.clientY < firstBox.top - 2) {
            // 第一行上方的内边距 → 块首
            dest = firstPos
          } else if (event.clientY > lastBox.bottom + 2) {
            // 最后一行可见文字下方 → 找第一个「点击点落在其行框内」的末尾位置；
            // 全部在点击点上方（即点在底部内边距里）则落到块尾。
            // 逐个位置用 coordsAtPos 取真实行框，不靠 line-height 估算（行高可能被
            // 字号/主题改掉，估算会错行）。
            dest = blockEnd
            for (let p = lastVisiblePos + 1; p <= blockEnd; p++) {
              const box = view.coordsAtPos(p)
              if (!box) continue
              // 坐标异常（被末尾 widget / 占位 img 挤到块顶部）→ 跳过
              if (box.top < lastBox.bottom - 2) continue
              if (event.clientY <= box.bottom) {
                dest = p
                break
              }
            }
          } else {
            // 点在正文行上 → 交给 ProseMirror
            return false
          }

          event.preventDefault()
          try {
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, dest)))
          } catch {
            // 极端情况下 dest 不是合法文本位置：退回到就近的文本位置
            view.dispatch(
              view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(dest), -1)),
            )
          }
          view.focus()
          return true
        },
      },
    },
  })
}

export const codeBlockCaretPlugin = $prose(() => createCodeBlockCaretPlugin())
