/// 增量 decoration 更新工具。
///
/// 背景：编辑器里有多个插件用 `props.decorations` 给代码块/表格/脚注等挂
/// decoration。ProseMirror 在**每次文档变化**（也就是每敲一个字符）都会调用
/// 这些函数。若每个插件都 `doc.descendants` 全量遍历并重建整套 DecorationSet，
/// 一篇 60 万字符、近 900 个代码块的文档每键要花 120ms 以上（实测 copy 42ms +
/// badge 42ms + 行号 39ms + 其它），输入直接卡死。
///
/// 这里利用 ProseMirror 的结构共享：一次编辑后，未改动的顶层块是**同一个 Node
/// 对象**。于是：
///   1. 比较前后文档的顶层子节点引用，找出真正变化的顶层块区间（O(块数) 指针比较，
///      8812 块约 0.1ms）；
///   2. 变化区间内的旧 decoration 删掉，只重扫这几个块；
///   3. 其余 decoration 用 StepMap 平移位置后原样复用（widget DOM 不重建）。
///
/// 这样每键只处理一个块，成本与文档大小基本无关。

import type { Node } from '@milkdown/kit/prose/model'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { Mapping, StepMap } from '@milkdown/kit/prose/transform'

/** 扫描 [from, to) 区间内的节点，返回新 decoration。区间按顶层块边界给出。 */
export type DecorationBuilder = (doc: Node, from: number, to: number) => Decoration[]

/** 供插件 state 使用的缓存结构 */
export interface DecorationState {
  doc: Node
  set: DecorationSet
}

/** 顶层块差异：oldFrom/oldTo 在旧文档中，newFrom/newTo 在新文档中 */
export interface TopLevelDiff {
  oldFrom: number
  oldTo: number
  newFrom: number
  newTo: number
  /** 前后没有公共顶层块（整篇替换） */
  full: boolean
}

/**
 * 比较前后文档的顶层子节点引用，返回真正变化的顶层块区间。
 * 未改动的块在 ProseMirror 结构共享下是同一个 Node 对象，因此只需 O(块数) 指针比较。
 * 文档未变化时返回 null。
 */
export function diffTopLevelRange(prevDoc: Node, nextDoc: Node): TopLevelDiff | null {
  if (prevDoc === nextDoc) return null

  const pc = prevDoc.childCount
  const nc = nextDoc.childCount
  const max = Math.min(pc, nc)
  let prefix = 0
  while (prefix < max && prevDoc.child(prefix) === nextDoc.child(prefix)) prefix++
  let suffix = 0
  while (
    suffix < pc - prefix &&
    suffix < nc - prefix &&
    prevDoc.child(pc - 1 - suffix) === nextDoc.child(nc - 1 - suffix)
  ) {
    suffix++
  }

  // 前后完全没有公共块 → 视为整篇替换
  if (prefix === 0 && suffix === 0 && (pc !== nc || pc === 0)) {
    return {
      oldFrom: 0,
      oldTo: prevDoc.content.size,
      newFrom: 0,
      newTo: nextDoc.content.size,
      full: true,
    }
  }

  let oldFrom = 0
  let newFrom = 0
  for (let i = 0; i < prefix; i++) {
    oldFrom += prevDoc.child(i).nodeSize
    newFrom += nextDoc.child(i).nodeSize
  }
  let oldTo = prevDoc.content.size
  let newTo = nextDoc.content.size
  for (let i = 0; i < suffix; i++) {
    oldTo -= prevDoc.child(pc - 1 - i).nodeSize
    newTo -= nextDoc.child(nc - 1 - i).nodeSize
  }
  return { oldFrom, oldTo, newFrom, newTo, full: false }
}

/**
 * 根据文档差异增量更新 decoration。
 *
 * - 文档整体被替换（打开新文件、全选粘贴等）→ 全量重建；
 * - 普通输入 → 只重扫发生变化的顶层块，其余位置平移复用。
 */
export function updateDecorations(
  prevDoc: Node,
  nextDoc: Node,
  prevSet: DecorationSet,
  build: DecorationBuilder,
): DecorationSet {
  const diff = diffTopLevelRange(prevDoc, nextDoc)
  if (!diff) return prevSet
  if (diff.full) {
    return DecorationSet.create(nextDoc, build(nextDoc, 0, nextDoc.content.size))
  }
  const { oldFrom, oldTo, newFrom, newTo } = diff

  // 没有块级变化（理论上不会走到：doc 不同必然有块不同）→ 原样返回
  if (oldFrom === oldTo && newFrom === newTo) return prevSet

  let kept = prevSet
  if (oldTo > oldFrom) {
    // find 的区间是**闭区间**（起止边界上的 decoration 都算命中）。这里必须用
    // oldTo - 1 作为右端：oldTo 是「下一个未改动块」的起始位置，落在该位置的
    // widget（如 mermaid 图挂在块首）属于下一个块，误删后不会在本次 build 里重建。
    const inside = kept.find(oldFrom, oldTo - 1)
    if (inside.length) kept = kept.remove(inside)
  }
  const mapped = kept.map(
    new Mapping([new StepMap([oldFrom, oldTo - oldFrom, newTo - newFrom])]),
    nextDoc,
  )
  const added = build(nextDoc, newFrom, newTo)
  return added.length ? mapped.add(nextDoc, added) : mapped
}
