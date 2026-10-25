/// 专注模式 / 打字机模式插件
///
/// 这是 Typora 里两个**独立**的写作辅助，本插件把它们的共同部分（标记「光标所在块」）
/// 合并处理，再按各自的开关分别生效：
///
/// | 模式 | 按键 | 效果 | 实现 |
/// |---|---|---|---|
/// | 专注模式 | F8 | 淡化非当前段落 | `.focus-mode` 类 + `.typewriter-active` 标记 |
/// | 打字机模式 | F9 | 当前段落固定垂直居中 | 滚动容器 scrollTop 校正 |
///
/// 两者可以单独开、也可以同时开。早先版本把「居中」硬绑在 focusMode 上，
/// 导致 F8 同时做了两件事、无法只淡化；现在拆开互不干扰。
///
/// 性能约定：两个开关都关时必须**零成本返回**——每敲一个字符都会走 update，
/// 不能在这个路径上做 `querySelectorAll`（大文档上等于每键白扫一遍整棵 DOM）。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { useAppStore } from '../stores/useAppStore'

const typewriterKey = new PluginKey('MDITOR_TYPEWRITER')

export const typewriterPlugin = $prose(() => {
  let raf = 0
  let unsubFocus: (() => void) | null = null
  let unsubTypewriter: (() => void) | null = null
  let viewRef: EditorView | null = null
  /** 当前 DOM 上是否挂着 .typewriter-active。用它让「关闭态」跳过 DOM 查询 */
  let marked = false

  function clearActiveMarks() {
    if (!marked) return
    marked = false
    viewRef?.dom.querySelectorAll('.typewriter-active').forEach((n) => n.classList.remove('typewriter-active'))
  }

  /** 两种模式只要有一个开着，就需要标记当前块（淡化/居中都以它为目标） */
  const needMark = () => {
    const s = useAppStore.getState()
    return s.focusMode || s.typewriterMode
  }

  function apply() {
    const view = viewRef
    if (!view || view.isDestroyed) return
    if (!needMark()) {
      clearActiveMarks()
      return
    }
    const container = view.dom.parentElement
    if (!container) return

    clearActiveMarks()

    // 查找选区所在块（.ProseMirror 的直接子元素）
    let el: HTMLElement | null = null
    try {
      const { node } = view.domAtPos(view.state.selection.head)
      el = node.nodeType === Node.TEXT_NODE ? (node as Text).parentElement : (node as HTMLElement)
      while (el && el.parentElement !== view.dom) el = el.parentElement
    } catch {
      // 选区越界（空文档边缘）
    }
    if (!el) return
    el.classList.add('typewriter-active')
    marked = true

    // 只有打字机模式才滚动居中；专注模式只淡化了事，绝不改动滚动位置
    // （用户开着专注模式翻看其它段落时，被强行拉回光标处会非常难受）。
    if (!useAppStore.getState().typewriterMode) return
    const target = el
    requestAnimationFrame(() => {
      if (!view || view.isDestroyed) return
      const cRect = container.getBoundingClientRect()
      const eRect = target.getBoundingClientRect()
      const delta = eRect.top + eRect.height / 2 - (cRect.top + cRect.height / 2)
      container.scrollTop = Math.max(
        0,
        Math.min(container.scrollTop + delta, container.scrollHeight - container.clientHeight),
      )
    })
  }

  /** 开关变化：同步 <html> 上的状态类，再重算一次 */
  function sync() {
    const s = useAppStore.getState()
    document.documentElement.classList.toggle('focus-mode', s.focusMode)
    document.documentElement.classList.toggle('typewriter-mode', s.typewriterMode)
    apply()
  }

  return new Plugin({
    key: typewriterKey,
    view: (v) => {
      viewRef = v

      // 用 selector 形式的 subscribe：裸 subscribe 会对**每次 store 变更**
      // （含每个字符输入触发的 tabs 更新）都调用一次 listener，等于每键白跑一次。
      unsubFocus = useAppStore.subscribe(
        (s) => s.focusMode,
        (_next, prev) => {
          if (_next === prev) return
          sync()
        },
      )
      unsubTypewriter = useAppStore.subscribe(
        (s) => s.typewriterMode,
        (_next, prev) => {
          if (_next === prev) return
          sync()
        },
      )

      // 编辑器挂载时若已有模式是开着的（切标签回来、热重载），立即补上状态类
      if (needMark()) {
        const s = useAppStore.getState()
        document.documentElement.classList.toggle('focus-mode', s.focusMode)
        document.documentElement.classList.toggle('typewriter-mode', s.typewriterMode)
        requestAnimationFrame(() => apply())
      }

      return {
        update: (nv, prev) => {
          if (nv.state.selection.eq(prev.selection)) return
          // 两个模式都关时连 rAF 都不排
          if (!needMark()) return
          cancelAnimationFrame(raf)
          raf = requestAnimationFrame(() => apply())
        },
        destroy: () => {
          cancelAnimationFrame(raf)
          unsubFocus?.()
          unsubTypewriter?.()
          unsubFocus = null
          unsubTypewriter = null
          viewRef = null
          document.documentElement.classList.remove('focus-mode')
          document.documentElement.classList.remove('typewriter-mode')
        },
      }
    },
  })
})
