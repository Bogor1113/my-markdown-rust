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
import type { Ctx } from '@milkdown/kit/ctx'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { Fragment } from '@milkdown/kit/prose/model'
import { diffTopLevelRanges } from '../utils/incrementalDecorations'

const key = new PluginKey('MILKDOWN_HEADING_ID')

/// 打字停顿多久后才重算标题 id。要大于连续击键间隔，保证热路径上一次都不跑。
const DEBOUNCE_MS = 400

/** 已经由 withHeadingIds 填好 id 的文档（按引用记）。
 *
 *  这些文档的标题 id 在**载入时**就算准了，插件 view 初始化不必再全量重算一遍。
 *  别小看这一次：616KB / 1125 个标题实测 343ms，而它发生在「打开文件 / 切标签」
 *  最敏感的时刻，且结果一定与已有 id 完全相同（纯浪费）。
 *  WeakSet 用引用作键，快照缓存里的 state 天然命中（payload doc 就是同一个对象）。 */
const preparedDocs = new WeakSet<PMNode>()

/** 与上游 sync-heading-id-plugin 一致的 id 计算（含同 slug 去重 `-#N`） */
function makeIdResolver(ctx: Ctx) {
  const getId = ctx.get(headingIdGenerator.key)
  const idMap: Record<string, number> = {}
  return (node: PMNode): string => {
    let id = getId(node)
    if (idMap[id]) {
      idMap[id] += 1
      id += `-#${idMap[id]}`
    } else idMap[id] = 1
    return id
  }
}

/**
 * 载入文档时**一次性**把所有标题 id 写进 doc（纯函数式重建，不发事务）。
 *
 * 为什么必须这样做：解析器产出的标题 `id` 是空的，若留给 headingId 插件在载入后
 * 用一个事务去补，那个事务里会有 N 个 `setNodeMarkup` 步骤（616KB / 1125 个标题）。
 * ProseMirror 每执行一步都要复制一次文档顶层的 4345 个子节点数组，于是整件事退化
 * 成 O(N²)：实测单次 dispatch 916ms，表现为「大文件刚打开、敲第一个字必卡一秒」。
 *
 * 这里改为在 `EditorState.create` 之前用一次 O(n) 的树重建把 id 填好：结构共享
 * 让未改动的子树原样复用，成本约 10ms，且不产生任何事务与视图更新。
 */
export function withHeadingIds(ctx: Ctx, doc: PMNode): PMNode {
  const hType = headingSchema.type(ctx)
  const nextId = makeIdResolver(ctx)
  const walk = (node: PMNode): PMNode => {
    if (node.type === hType) {
      // 与插件原逻辑一致：空标题不写 id
      if (node.textContent.trim().length === 0) return node
      const id = nextId(node)
      const attrs = node.attrs as { id?: string }
      if (attrs.id === id) return node
      return node.type.create({ ...attrs, id }, node.content, node.marks)
    }
    if (node.isLeaf) return node
    let modified = false
    const kids: PMNode[] = []
    node.forEach((child) => {
      const next = walk(child)
      if (next !== child) modified = true
      kids.push(next)
    })
    return modified ? node.copy(Fragment.fromArray(kids)) : node
  }
  const out = walk(doc)
  preparedDocs.add(out)
  return out
}

export const headingIdPlugin = $prose((ctx) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  /** 正在派发自己产生的事务（改 id → 又触发 update），避免自激重算 */
  let selfDispatch = false

  // 与上游 sync-heading-id-plugin 完全一致的 id 计算逻辑（含去重）。
  const updateId = (view: EditorView) => {
    if (view.composing) return
    const tr = view.state.tr.setMeta('addToHistory', false)
    let found = false
    const nextId = makeIdResolver(ctx)
    const hType = headingSchema.type(ctx)
    view.state.doc.descendants((node: PMNode, pos: number) => {
      if (node.type === hType) {
        if (node.textContent.trim().length === 0) return
        const attrs = node.attrs as { id?: string }
        const id = nextId(node)
        if (attrs.id !== id) {
          found = true
          tr.setMeta(key, true).setNodeMarkup(pos, undefined, { ...attrs, id })
        }
      }
    })
    if (found) {
      selfDispatch = true
      try {
        view.dispatch(tr)
      } finally {
        selfDispatch = false
      }
    }
  }

  /**
   * 这次改动是否可能影响标题 id。
   *
   * 全量重算要遍历 1125 个标题、逐个算 slug，616KB 文档实测 343ms —— 而它原本
   * 挂在「任何改动停顿 400ms」之后，于是在正文里打了个字、发个呆，也会莫名其妙
   * 卡一下。id 只会因为**标题自身的文本**变化而变，所以先看变化区间里有没有
   * heading：没有就整轮跳过，有才排队重算。
   */
  const mayAffectHeading = (prevDoc: PMNode, nextDoc: PMNode): boolean => {
    const ranges = diffTopLevelRanges(prevDoc, nextDoc)
    if (!ranges) return false
    if (ranges.some((r) => r.full)) return true
    const hType = headingSchema.type(ctx)
    for (const r of ranges) {
      if (r.oldTo > r.oldFrom) {
        let hit = false
        prevDoc.nodesBetween(r.oldFrom, r.oldTo, (node) => {
          if (node.type === hType) {
            hit = true
            return false
          }
        })
        if (hit) return true
      }
      if (r.newTo > r.newFrom) {
        let hit = false
        nextDoc.nodesBetween(r.newFrom, r.newTo, (node) => {
          if (node.type === hType) {
            hit = true
            return false
          }
        })
        if (hit) return true
      }
    }
    return false
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
      // 载入路径已经用 withHeadingIds 写好了全部 id，这里不必再算一遍
      if (!preparedDocs.has(view.state.doc)) updateId(view)
      return {
        update: (view: EditorView, prevState: any) => {
          if (selfDispatch) return
          if (view.state.doc === prevState.doc) return
          // 刚载入的文档：withHeadingIds 已写准 id，跳过
          if (preparedDocs.has(view.state.doc)) return
          if (!mayAffectHeading(prevState.doc, view.state.doc)) return
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
