/// ProseMirror 视图层的定点性能补丁（不改库源码，运行期替换一个方法）。
///
/// 问题：`DecorationSet.forChild()` 用线性扫描在 children 数组里找「当前子节点
/// 对应的 decoration 组」。而 `NodeViewDesc.updateChildren` 在**每次文档变化**
/// 时都会对父节点的**每一个**子节点调用它一次，于是总代价是 O(块数²)。
/// 616KB / 4345 个顶层块的课件实测：每敲一个字符约 430 万次数组比较，
/// 占 7-8ms —— 单看不多，但它和别的每键开销叠加后就是肉眼可见的粘滞。
///
/// 修法：把「第一个 >= offset 的组」从线性扫描换成二分查找（children 数组按
/// 偏移升序排列，stride 为 3）。语义完全等价；只有 `local` 非空（叶子/行内
/// decoration）的少数情况仍然回落到原实现，保证行为一致。

import { DecorationSet } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'

interface DecorationSetInternals {
  local: unknown[]
  children: number[]
  forChild: (offset: number, node: PMNode) => DecorationSet
}

/** 标记是否已打过补丁（模块可能被多次热更新加载） */
let installed = false

/** 在 children（stride=3 的升序偏移表）中找第一个 offset 大于等于目标的组 */
function findChildGroup(children: number[], offset: number): DecorationSet | undefined {
  let lo = 0
  let hi = children.length / 3 - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (children[mid * 3] >= offset) {
      ans = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  if (ans < 0) return undefined
  return children[ans * 3] === offset ? (children[ans * 3 + 2] as unknown as DecorationSet) : undefined
}

/**
 * 安装补丁。幂等，可安全地在模块顶层调用。
 *
 * 快速路径只覆盖「本级没有行内 decoration」这一种情况，此时原实现的返回值
 * 必然就是 `child || empty`，与原语义完全等价；其余情况直接调用原实现。
 */
export function installPmPerfPatches() {
  if (installed) return
  installed = true
  const proto = DecorationSet.prototype as unknown as DecorationSetInternals
  const original = proto.forChild
  if (typeof original !== 'function') return

  proto.forChild = function patchedForChild(this: DecorationSetInternals, offset: number, node: PMNode) {
    if ((this as unknown) === (DecorationSet.empty as unknown)) return this as unknown as DecorationSet
    if (node.isLeaf) return DecorationSet.empty
    if (this.local.length > 0) return original.call(this, offset, node)
    return findChildGroup(this.children, offset) || DecorationSet.empty
  }
}
