/// 专注模式（打字机居中）插件
///
/// 功能：启用时，编辑器自动将当前光标所在块垂直居中，并淡化非活跃区块。
/// 通过 ProseMirror Plugin 监听选区变化，以 requestAnimationFrame 驱动
/// 滚轮居中，避免频繁操作与布局抖动。同时监听 zustand store 的 focusMode
/// 字段，切换时同步更新 `document.documentElement` 的 `.typewriter-mode` 类。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { useAppStore } from '../stores/useAppStore'

const typewriterKey = new PluginKey('MDITOR_TYPEWRITER')

export const typewriterPlugin = $prose(() => {
  let raf = 0
  let unsub: (() => void) | null = null
  let viewRef: EditorView | null = null

  function clearActiveMarks() {
    viewRef?.dom.querySelectorAll('.typewriter-active').forEach((n) => n.classList.remove('typewriter-active'))
  }

  function apply() {
    const view = viewRef
    if (!view || view.isDestroyed) return
    const store = useAppStore.getState()
    // 击键高频路径：专注模式关闭时零成本返回。
    // 旧实现在这里先做一次全文档 querySelectorAll 再判断，等于每个字符
    // 都白扫一遍 DOM 树。
    if (!store.focusMode) return
    const rootEl = view.dom
    const container = rootEl.parentElement
    if (!container) return

    // 清除旧 active 标记
    rootEl.querySelectorAll('.typewriter-active').forEach((n) => n.classList.remove('typewriter-active'))

    // 查找选区所在块（.ProseMirror 的直接子元素）
    let el: HTMLElement | null = null
    try {
      const { node } = view.domAtPos(view.state.selection.head)
      el = node.nodeType === Node.TEXT_NODE ? (node as Text).parentElement : (node as HTMLElement)
      while (el && el.parentElement !== rootEl) el = el.parentElement
    } catch {
      // 选区越界（空文档边缘）
    }

    if (el) {
      el.classList.add('typewriter-active')
      // 推迟到下一帧确保 DOM 布局已更新
      requestAnimationFrame(() => {
        if (!view || view.isDestroyed) return
        const cRect = container.getBoundingClientRect()
        const eRect = el!.getBoundingClientRect()
        const delta = eRect.top + eRect.height / 2 - (cRect.top + cRect.height / 2)
        container.scrollTop = Math.max(
          0,
          Math.min(
            container.scrollTop + delta,
            container.scrollHeight - container.clientHeight,
          ),
        )
      })
    }
  }

  return new Plugin({
    key: typewriterKey,
    view: (v) => {
      viewRef = v

      // 订阅 store 的 focusMode 变化，切换 CSS 类 + 重新居中
      unsub = useAppStore.subscribe((s, prev) => {
        if (s.focusMode !== prev.focusMode) {
          document.documentElement.classList.toggle('typewriter-mode', s.focusMode)
          // 关闭时清掉残留的段落高亮（apply 现在在关闭态直接返回，不再负责清理）
          if (!s.focusMode) clearActiveMarks()
          apply()
        }
      })

      // 若编辑器挂载时已开启专注模式，立即应用（例如从另一标签切换回来）
      if (useAppStore.getState().focusMode) {
        document.documentElement.classList.add('typewriter-mode')
        requestAnimationFrame(() => apply())
      }

      return {
        update: (v, prev) => {
          if (v.state.selection.eq(prev.selection)) return
          // 专注模式关闭时连 rAF 都不用排——apply 只会立刻返回
          if (!useAppStore.getState().focusMode) return
          cancelAnimationFrame(raf)
          raf = requestAnimationFrame(() => apply())
        },
        destroy: () => {
          cancelAnimationFrame(raf)
          unsub?.()
          unsub = null
          viewRef = null
          document.documentElement.classList.remove('typewriter-mode')
        },
      }
    },
  })
})