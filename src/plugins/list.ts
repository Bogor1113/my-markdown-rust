import { commandsCtx, CommandsReady } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { wrapInList } from '@milkdown/kit/prose/schema-list'
import type { NodeType } from '@milkdown/kit/prose/model'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'
import {
  orderedListSchema,
  bulletListSchema,
  wrapInOrderedListCommand,
  wrapInBulletListCommand,
} from '@milkdown/kit/preset/commonmark'

/**
 * 尝试 wrapInList，若失败（已在另一种列表中）则转换列表类型。
 *
 * 默认情况下 wrapInList 对"已在不同列表中"的选区会创建嵌套列表
 * （ordered_list > list_item > bullet_list > list_item > paragraph），
 * 而不是替换类型。这里检测到已在另一种列表中时，直接用
 * `setNodeMarkup` 替换列表节点类型。
 */
function wrapInListOrConvert(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  targetType: NodeType,
): boolean {
  // 先尝试 wrapInList（处理非列表内容）
  if (wrapInList(targetType)(state, dispatch)) return true

  // wrapInList 失败 → 检查是否在另一种列表中
  const { $from, $to } = state.selection
  const range = $from.blockRange($to)
  if (!range || range.depth < 2) return false

  // 结构的 depth 是：doc > list > list_item > paragraph
  // 所以列表节点在 depth - 2，list_item 在 depth - 1
  // 但如果选区在空列表项最顶部，range.depth 可能只有 2（doc > list > list_item）
  const listDepth = range.depth >= 3 ? range.depth - 2 : range.depth - 1
  const listNode = range.$from.node(listDepth)
  // 列表节点不存在或不是列表类型 → 无法转换
  if (!listNode || (listNode.type.name !== 'ordered_list' && listNode.type.name !== 'bullet_list')) return false
  // 已经就是目标类型 → 不做任何事
  if (listNode.type === targetType) return false

  // 用 setNodeMarkup 替换列表节点类型，保留原有内容和属性
  const listPos = range.$from.before(listDepth)
  if (dispatch) {
    dispatch(state.tr.setNodeMarkup(listPos, targetType, listNode.attrs).scrollIntoView())
  }
  return true
}

/**
 * Override built-in wrapInOrderedListCommand / wrapInBulletListCommand.
 *
 * 不能用 $command 注册同名命令覆盖，因为：
 *   - Container.get(name) 用 find 匹配第一个同名条目，内置先注册永远被找到
 *   - 也不能 remove + create 新 SliceType，因为 ContextMenu 用
 *     callCommand(command.key, payload) 以 SliceType.id（Symbol）精确查找，
 *     新 Symbol 找不到
 *
 * 方案：用同一个 SliceType（import 自 built-in 的 .key）覆盖命令值。
 * cmdMgr.create(sliceType, value) 会调用 sliceType.create(container) 创建新 Slice
 * 存入 sliceMap，key = sliceType.id（Symbol）。因为 Symbol 相同，旧条目被覆盖。
 * 之后 callCommand(builtinCmdKey, payload) 按 Symbol 查找仍能找到。
 */
export const overrideListCommands = (ctx: Ctx) => async () => {
  await ctx.wait(CommandsReady)

  const cmdMgr = ctx.get(commandsCtx)
  const orderedType = orderedListSchema.type(ctx)
  const bulletType = bulletListSchema.type(ctx)

  // 用同一个 SliceType（Symbol）覆盖命令值
  cmdMgr.create(wrapInOrderedListCommand.key, () => {
    return (state: EditorState, dispatch?: (tr: Transaction) => void) =>
      wrapInListOrConvert(state, dispatch, orderedType)
  })
  cmdMgr.create(wrapInBulletListCommand.key, () => {
    return (state: EditorState, dispatch?: (tr: Transaction) => void) =>
      wrapInListOrConvert(state, dispatch, bulletType)
  })

  return () => {
    // 编辑器销毁时无需清理（覆盖的是内置命令，editor 实例一起销毁）
  }
}