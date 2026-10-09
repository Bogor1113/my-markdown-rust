/// 表格剪贴板增强：把单元格矩形选区 / 整张表格复制为 TSV。
///
/// 背景（实测确认）：
/// - `prosemirror-tables@1.8` 的 `tableEditing()` 只提供 `handlePaste`，
///   已不再导出 `clipboardParser` / `clipboardSerializer`；
/// - 于是复制时的纯文本走 prosemirror-view 的默认兜底
///   `slice.content.textBetween(0, size, "\n\n")` —— 单元格之间、行之间全部退化成空行，
///   也没有任何 Tab 分隔，粘到 Excel / WPS / 记事本里无法还原成表格。
///
/// 这里补一个 `clipboardTextSerializer`：
/// - 选区是**纯表格行**（拖选单元格产生的 CellSelection）→ 输出 TSV；
/// - 选区是**单张表格**（选中整个表格节点）→ 输出其全部行的 TSV；
/// - 其余情况返回空串，交回 prosemirror-view 默认实现
///   （`EditorView.someProp` 只采纳 truthy 的返回值，空串会被视为未命中）。
///
/// 顺带形成闭环：导出的 TSV 粘回本编辑器时，会被 excelPaste 插件重新识别成表格。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { Node, Slice } from '@milkdown/kit/prose/model'

/** 表格行节点名（Milkdown GFM schema）。 */
const ROW_TYPES = new Set(['table_row', 'table_header_row'])

/** 单元格 → 单行文本：多段落折叠为空格，避免破坏 TSV 的行结构。 */
function cellToText(cell: Node): string {
  return cell
    .textBetween(0, cell.content.size, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 表格行 → Tab 分隔的一行。 */
function rowToTsvLine(row: Node): string {
  const cells: string[] = []
  row.forEach((cell) => cells.push(cellToText(cell)))
  return cells.join('\t')
}

/** 表格节点的全部行 → TSV 行数组。 */
function tableToRows(table: Node): string[] {
  const rows: string[] = []
  table.forEach((row) => {
    if (ROW_TYPES.has(row.type.name)) rows.push(rowToTsvLine(row))
  })
  return rows
}

/** Slice → TSV；内容不是"表格选区"时返回 null。 */
function sliceToTsv(slice: Slice): string | null {
  const top: Node[] = []
  slice.content.forEach((node) => top.push(node))
  if (top.length === 0) return null

  // 拖选单元格：顶层全是表格行
  if (top.every((node) => ROW_TYPES.has(node.type.name))) {
    return top.map(rowToTsvLine).join('\n')
  }

  // 选中整张表格：顶层是单个 table 节点
  if (top.length === 1 && top[0].type.name === 'table') {
    const rows = tableToRows(top[0])
    return rows.length > 0 ? rows.join('\n') : null
  }

  // 正文与表格混排（例如全选整篇文档）：不接管，保持原生行为
  return null
}

export const tableClipboardPlugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey('MDITOR_TABLE_CLIPBOARD'),
      props: {
        clipboardTextSerializer: (slice) => sliceToTsv(slice) ?? '',
      },
    }),
)
