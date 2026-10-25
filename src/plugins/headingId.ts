/// 防抖版标题 id 同步插件。
///
/// 替换 `@milkdown/preset-commonmark` 自带的 `syncHeadingIdPlugin`：
/// 那个插件的 `view.update` **每次文档变化**都遍历所有标题、按文本重算 slug，
/// 一旦 id 变了就 `view.dispatch(setNodeMarkup)` 改 attr。打字时标题文本每键都在变，
/// 于是每键都触发一次「改 attr → 下一状态 `!sameMarkup` → ProseMirror 重建整个 `<h4>`」，
/// 实测约 25-34ms/键。文档里标题越多，遍历开销也越大。
///
/// 标题 id 是**纯运行时属性**：`heading.toMarkdown` 只写 `depth`，不写 id；
/// 导出 HTML 时 `services/export.ts` 用 `slugifyHeading` 重新算 id，不依赖编辑器实时 id；
/// 它只用于编辑器内的锚链接跳转。因此把重算推迟到打字停顿后完全安全。
///
/// 这里照搬上游的 id 计算与去重逻辑（`getId` + `idMap` 的 `-#N` 后缀），
/// 只把 `view.update` 里的 `updateId` 改成防抖 400ms：连续打字时定时器不断重置，
/// 一次都不触发；停顿 400ms 后统一重算一次。初始化仍立即算一次，保证加载即正确。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { headingIdGenerator, headingSchema } from '@milkdown/kit/preset/commonmark'

const key = new PluginKey('MILKDOWN_HEADING_ID')

/// 打字停顿多久后才重算标题 id。要大于连续击键间隔，保证热路径上一次都不跑。
const DEBOUNCE_MS = 400

export const headingIdPlugin = $prose((ctx) => {
  let timer: ReturnType<typeof setTimeout> | null = null

  // 与上游 sync-heading-id-plugin 完全一致的 id 计算逻辑（含去重）。
  const updateId = (view: EditorView) => {
    if (view.composing) return
    const getId = ctx.get(headingIdGenerator.key)
    const tr = view.state.tr.setMeta('addToHistory', false)
    let found = false
    const idMap: Record<string, number> = {}
    view.state.doc.descendants((node: any, pos: number) => {
      if (node.type === headingSchema.type(ctx)) {
        if (node.textContent.trim().length === 0) return
        const attrs = node.attrs as { id?: string }
        let id = getId(node)
        if (idMap[id]) {
          idMap[id] += 1
          id += `-#${idMap[id]}`
        } else idMap[id] = 1
        if (attrs.id !== id) {
          found = true
          tr.setMeta(key, true).setNodeMarkup(pos, undefined, { ...attrs, id })
        }
      }
    })
    if (found) view.dispatch(tr)
  }

  // 防抖：连续打字时不断重置定时器，热路径上一次 updateId 都不跑；
  // 停顿 DEBOUNCE_MS 后跑一次。init 不防抖，加载即正确。
  const schedule = (view: EditorView) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (view.isDestroyed) return
      updateId(view)
    }, DEBOUNCE_MS)
  }

  return new Plugin({
    key,
    view: (view: EditorView) => {
      // 初始化立即算一次（与上游一致），保证文档加载后 id 即时正确。
      updateId(view)
      return {
        update: (view: EditorView, prevState: any) => {
          if (view.state.doc.eq(prevState.doc)) return
          schedule(view)
        },
        destroy: () => {
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
        },
      }
    },
  })
})
