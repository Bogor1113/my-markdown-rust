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
///      4345 块约 0.2ms）；
///   2. 变化区间内的旧 decoration 删掉，只重扫这几个块；
///   3. 其余 decoration 用 StepMap 平移位置后原样复用（widget DOM 不重建）。
///
/// 这样每键只处理一个块，成本与文档大小基本无关。
///
/// 多区间：区间是**复数**。曾经只取「公共前缀之后的第一个不同块」到「公共后缀
/// 之前的最后一个不同块」当作单一区间，一旦一次事务改了分散在文档各处的几个块
/// （典型：标题 id 插件一次修正 3 个标题），这个区间会横跨大半个文档，等于退化成
/// 全量重建——实测 577ms 的输入停顿就是这么来的。现在改为逐块比对、只收口真正
/// 变动的小区间。

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

/** 新文档坐标下的一段变化区间（闭开区间，按顶层块边界对齐） */
export interface ChangedRange {
  from: number
  to: number
}

/** 增量更新的结果：新 decoration 集合 + 本次真正变化的顶层块区间（新文档坐标） */
export interface DecorationUpdate {
  set: DecorationSet
  /** 文档未变化时为空数组 */
  ranges: ChangedRange[]
  changed: boolean
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

/** 区间数量上限：超过它就别再拼 StepMap 了，直接全量重建更划算 */
const MAX_RANGES = 12

/**
 * 比较前后文档的顶层子节点引用，返回**所有**真正变化的顶层块区间。
 * 未改动的块在 ProseMirror 结构共享下是同一个 Node 对象，因此只需 O(块数) 指针比较。
 * 文档未变化时返回 null。
 */
export function diffTopLevelRanges(prevDoc: Node, nextDoc: Node): TopLevelDiff[] | null {
  if (prevDoc === nextDoc) return null

  const pc = prevDoc.childCount
  const nc = nextDoc.childCount
  // 前后完全没有公共块 → 视为整篇替换
  if (pc === 0 || nc === 0) {
    if (pc === nc) return null
    return [{ oldFrom: 0, oldTo: prevDoc.content.size, newFrom: 0, newTo: nextDoc.content.size, full: true }]
  }

  // 公共前缀 / 后缀（引用相等）
  const maxPrefix = Math.min(pc, nc)
  let prefix = 0
  while (prefix < maxPrefix && prevDoc.child(prefix) === nextDoc.child(prefix)) prefix++
  let suffix = 0
  while (
    suffix < pc - prefix &&
    suffix < nc - prefix &&
    prevDoc.child(pc - 1 - suffix) === nextDoc.child(nc - 1 - suffix)
  ) {
    suffix++
  }
  if (prefix === pc && prefix === nc) return null

  // 中间区间的起止偏移
  let oldFrom = 0
  let newFrom = 0
  for (let i = 0; i < prefix; i++) {
    oldFrom += prevDoc.child(i).nodeSize
    newFrom += nextDoc.child(i).nodeSize
  }
  let oldEnd = prevDoc.content.size
  let newEnd = nextDoc.content.size
  for (let i = 0; i < suffix; i++) {
    oldEnd -= prevDoc.child(pc - 1 - i).nodeSize
    newEnd -= nextDoc.child(nc - 1 - i).nodeSize
  }
  if (oldFrom === oldEnd && newFrom === newEnd) return null

  // 整个文档都没有公共块 → 全量
  if (prefix === 0 && suffix === 0) {
    return [{ oldFrom: 0, oldTo: prevDoc.content.size, newFrom: 0, newTo: nextDoc.content.size, full: true }]
  }

  // 中间区间内做「保留块」匹配：同一 Node 引用 = 未改动
  const prevStarts = new Map<Node, number>()
  let off = oldFrom
  for (let i = prefix; i < pc - suffix; i++) {
    const child = prevDoc.child(i)
    prevStarts.set(child, off)
    off += child.nodeSize
  }

  const ranges: TopLevelDiff[] = []
  let curOld = oldFrom
  let curNew = newFrom
  let offNew = newFrom
  for (let j = prefix; j < nc - suffix; j++) {
    const child = nextDoc.child(j)
    const prevStart = prevStarts.get(child)
    if (prevStart !== undefined && prevStart >= curOld) {
      // 该块被原样保留：收口此前的改动区间
      if (offNew > curNew) {
        ranges.push({ oldFrom: curOld, oldTo: prevStart, newFrom: curNew, newTo: offNew, full: false })
      }
      curOld = prevStart + child.nodeSize
      curNew = offNew + child.nodeSize
      prevStarts.delete(child) // 同一 Node 只匹配一次（复制粘贴会产生重复引用）
    }
    offNew += child.nodeSize
  }
  if (oldEnd > curOld || newEnd > curNew) {
    ranges.push({ oldFrom: curOld, oldTo: oldEnd, newFrom: curNew, newTo: newEnd, full: false })
  }
  if (ranges.length === 0) return null
  if (ranges.length > MAX_RANGES) {
    return [{ oldFrom: 0, oldTo: prevDoc.content.size, newFrom: 0, newTo: nextDoc.content.size, full: true }]
  }
  return ranges
}

/**
 * 单个区间的旧接口（保留给只关心「第一个变化区间」的调用方）。
 */
export function diffTopLevelRange(prevDoc: Node, nextDoc: Node): TopLevelDiff | null {
  const all = diffTopLevelRanges(prevDoc, nextDoc)
  if (!all) return null
  if (all.length === 1) return all[0]
  return {
    oldFrom: all[0].oldFrom,
    oldTo: all[all.length - 1].oldTo,
    newFrom: all[0].newFrom,
    newTo: all[all.length - 1].newTo,
    full: all.some((r) => r.full),
  }
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
  return updateDecorationsEx(prevDoc, nextDoc, prevSet, build).set
}

/**
 * 同 updateDecorations，但额外返回「本次变化的顶层块区间」。
 *
 * 需要它的场景：行号这类 decoration 之外还要做**副作用同步**的插件——只有知道
 * 哪个块变了，才能只更新那一个块的 DOM 测量，而不必退化成「每键扫描整个视口」。
 */
export function updateDecorationsEx(
  prevDoc: Node,
  nextDoc: Node,
  prevSet: DecorationSet,
  build: DecorationBuilder,
): DecorationUpdate {
  const ranges = diffTopLevelRanges(prevDoc, nextDoc)
  if (!ranges) return { set: prevSet, ranges: [], changed: false }
  if (ranges.length === 1 && ranges[0].full) {
    return {
      set: DecorationSet.create(nextDoc, build(nextDoc, 0, nextDoc.content.size)),
      ranges: [{ from: 0, to: nextDoc.content.size }],
      changed: true,
    }
  }

  // 1) 删掉旧文档中所有变化区间里的 decoration（位置还是旧文档坐标）
  let kept = prevSet
  const stale: Decoration[] = []
  for (const r of ranges) {
    if (r.oldTo > r.oldFrom) {
      // find 的区间是**闭区间**（起止边界上的 decoration 都算命中）。这里必须用
      // oldTo - 1 作为右端：oldTo 是「下一个未改动块」的起始位置，落在该位置的
      // widget（如 mermaid 图挂在块首）属于下一个块，误删后不会在本次 build 里重建。
      stale.push(...kept.find(r.oldFrom, r.oldTo - 1))
    }
  }
  if (stale.length) kept = kept.remove(stale)

  // 2) 依次平移：StepMap 的位置是「该步执行时」的文档坐标，所以要带上累计位移
  const steps: StepMap[] = []
  let delta = 0
  for (const r of ranges) {
    steps.push(new StepMap([r.oldFrom + delta, r.oldTo - r.oldFrom, r.newTo - r.newFrom]))
    delta += r.newTo - r.newFrom - (r.oldTo - r.oldFrom)
  }
  const mapped = kept.map(new Mapping(steps), nextDoc)

  // 3) 只重建变化区间
  const added: Decoration[] = []
  for (const r of ranges) added.push(...build(nextDoc, r.newFrom, r.newTo))
  return {
    set: added.length ? mapped.add(nextDoc, added) : mapped,
    ranges: ranges.map((r) => ({ from: r.newFrom, to: r.newTo })),
    changed: true,
  }
}
