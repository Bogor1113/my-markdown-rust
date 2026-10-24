/// 增量版有序列表编号同步插件。
///
/// 替换 `@milkdown/preset-commonmark` 自带的 `syncListOrderPlugin`：
/// 那个插件的 `appendTransaction` **每次事务**都对整篇文档 `descendants`，
/// 并逐个有序列表项比较 `label`。60 万字符的文档里实测约 14ms/键，
/// 即使光标在普通段落里打字也要付这笔钱。
///
/// 列表项的 `label` 只取决于「它在列表中的下标」和「列表的 order 起始值」，
/// 因此只有**变化区间里包含列表**时才可能变。这里先按顶层块引用差异定位变化区间，
/// 区间里没有列表就直接返回（普通输入的最快路径），有列表才扫描这几个列表。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'
import { diffTopLevelRange } from '../utils/incrementalDecorations'

const key = new PluginKey('mditor-list-order')

/** 把 label 修正为期望值；返回是否真的改动了 */
function relabel(attrs: { label?: string }, index: number, order: number): boolean {
  const expected = `${index + order}.`
  if (attrs.label === expected) return false
  attrs.label = expected
  return true
}

function syncOrder(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  // 与上游实现保持一致：非普通事务（如撤销/外部加载）不处理
  if (!newState.selection) return null
  for (const tr of transactions) {
    if (tr.getMeta('addToHistory') === false || !tr.isGeneric) return null
  }

  const diff = diffTopLevelRange(oldState.doc, newState.doc)
  // 新文档侧没有内容可扫描（纯删除整段列表）→ 无需重排
  if (!diff || diff.newFrom === diff.newTo) return null

  const {
    bullet_list: bulletList,
    ordered_list: orderedList,
    list_item: listItem,
  } = newState.schema.nodes
  if (!bulletList || !orderedList || !listItem) return null

  // 变化区间里没有列表 → 列表标签不可能变（普通段落输入走这条快路径）
  let hasList = false
  newState.doc.nodesBetween(diff.newFrom, diff.newTo, (node) => {
    if (node.type === bulletList || node.type === orderedList) {
      hasList = true
      return false
    }
    return true
  })
  if (!hasList) return null

  let tr = newState.tr
  let needDispatch = false

  newState.doc.nodesBetween(diff.newFrom, diff.newTo, (node, pos, parent, index) => {
    // bullet_list 的首项被标成 ordered（例如从有序列表粘贴/转换而来）→ 整个列表转有序
    if (node.type === bulletList) {
      const base = node.maybeChild(0)
      if (base?.type === listItem && base.attrs.listType === 'ordered') {
        needDispatch = true
        tr = tr.setNodeMarkup(pos, orderedList, { spread: true })
        // 只重排这一层的直接子项；嵌套列表会作为独立节点在本次遍历中被处理
        node.forEach((child, offset, childIndex) => {
          if (child.type !== listItem) return
          const attrs = { ...child.attrs }
          if (relabel(attrs, childIndex, 1)) {
            tr = tr.setNodeMarkup(pos + 1 + offset, undefined, attrs)
          }
        })
      }
      return true
    }

    if (node.type === listItem && parent?.type === orderedList) {
      const attrs = { ...node.attrs }
      let changed = false
      if (attrs.listType !== 'ordered') {
        attrs.listType = 'ordered'
        changed = true
      }
      if (relabel(attrs, index, (parent.attrs.order as number) ?? 1)) changed = true
      if (changed) {
        tr = tr.setNodeMarkup(pos, undefined, attrs)
        needDispatch = true
      }
    }
    return true
  })

  // 追加事务不进撤销栈（编号修正不是用户操作）
  return needDispatch ? tr.setMeta('addToHistory', false) : null
}

export const listOrderPlugin = $prose(
  () =>
    new Plugin({
      key,
      appendTransaction: (transactions, oldState, newState) =>
        syncOrder(transactions, oldState, newState),
    }),
)
