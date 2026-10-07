/// 表格增强插件
///
/// 功能：
/// 1. 拖拽列宽 — 使用 prosemirror-tables 官方 columnResizing 插件
/// 2. 单元格对齐 — 提供左/中/右对齐命令，通过工具栏按钮调用
/// 3. 合并/拆分单元格 — 通过 colspan 属性实现

import { $prose } from '@milkdown/kit/utils'
import { columnResizing } from '@milkdown/kit/prose/tables'
import type { EditorView } from '@milkdown/kit/prose/view'
import { Fragment } from '@milkdown/kit/prose/model'

/** 使用 prosemirror-tables 官方的列宽拖拽插件 */
export const tablePlugin = $prose(() =>
  columnResizing({
    handleWidth: 5,
    cellMinWidth: 25,
    defaultCellMinWidth: 100,
    lastColumnResizable: true,
  }),
)

/** 单元格对齐类型 */
type CellAlign = 'left' | 'center' | 'right'

/** 设置当前光标所在表格单元格的对齐方式 */
export function setCellAlignment(view: EditorView, align: CellAlign): boolean {
  const { state, dispatch } = view
  const { $from } = state.selection

  let found = false
  state.doc.nodesBetween($from.pos, $from.pos, (node, pos) => {
    if (found) return false
    if (node.type.name === 'table_cell' || node.type.name === 'table_header') {
      const attrs = { ...node.attrs, alignment: align }
      dispatch!(state.tr.setNodeMarkup(pos, undefined, attrs))
      found = true
      return false
    }
    return true
  })

  return found
}

/** 获取当前光标所在表格单元格的行索引和列索引 */
function getCellIndices(view: EditorView, pos: number): { tablePos: number; rowIdx: number; colIdx: number } | null {
  const $pos = view.state.doc.resolve(pos)
  let tablePos = -1
  let rowIdx = -1
  let colIdx = -1

  for (let d = $pos.depth; d >= 0; d--) {
    const node = d === 0 ? $pos.doc : $pos.node(d)
    if (node.type.name === 'table') {
      tablePos = d === 0 ? 0 : $pos.before(d)
    } else if (node.type.name === 'table_row') {
      rowIdx = $pos.index(d)
    } else if (node.type.name === 'table_cell' || node.type.name === 'table_header') {
      colIdx = $pos.index(d)
    }
  }

  if (tablePos < 0 || rowIdx < 0 || colIdx < 0) return null
  return { tablePos, rowIdx, colIdx }
}

/** 合并单元格：将当前单元格与右侧单元格合并（增加 colspan） */
export function mergeCells(view: EditorView): boolean {
  const { state, dispatch } = view
  const indices = getCellIndices(view, state.selection.$from.pos)
  if (!indices) return false

  const { tablePos, rowIdx, colIdx } = indices
  const table = state.doc.resolve(tablePos).nodeAfter
  if (!table || table.type.name !== 'table') return false

  const row = table.content.content[rowIdx]
  if (!row) return false

  // 右侧没有单元格则无法合并
  if (colIdx >= row.content.content.length - 1) return false

  const leftCell = row.content.content[colIdx]
  const rightCell = row.content.content[colIdx + 1]
  if (!leftCell || !rightCell) return false

  const leftColspan = leftCell.attrs.colspan || 1
  const rightColspan = rightCell.attrs.colspan || 1
  const newColspan = leftColspan + rightColspan

  // 合并内容：将右侧单元格内容追加到左侧
  const newContent = leftCell.content.append(rightCell.content)
  const newCell = leftCell.type.create({ ...leftCell.attrs, colspan: newColspan }, newContent)

  // 重建行
  const cells = row.content.content.slice()
  cells.splice(colIdx, 2, newCell)
  const newRow = row.type.create(row.attrs, cells)

  // 重建表格
  const rows = table.content.content.slice()
  rows.splice(rowIdx, 1, newRow)
  const newTable = table.type.create(table.attrs, rows)

  dispatch(state.tr.replaceWith(tablePos, tablePos + table.nodeSize, newTable))
  return true
}

/** 拆分单元格：将 colspan > 1 的单元格拆分为单个单元格 */
export function splitCell(view: EditorView): boolean {
  const { state, dispatch } = view
  const indices = getCellIndices(view, state.selection.$from.pos)
  if (!indices) return false

  const { tablePos, rowIdx, colIdx } = indices
  const table = state.doc.resolve(tablePos).nodeAfter
  if (!table || table.type.name !== 'table') return false

  const row = table.content.content[rowIdx]
  if (!row) return false

  const cell = row.content.content[colIdx]
  if (!cell) return false

  const colspan = cell.attrs.colspan || 1
  if (colspan <= 1) return false

  // 拆分：创建多个 colspan=1 的副本
  const childCount = cell.content.childCount
  const newCells: import('@milkdown/kit/prose/model').Node[] = []
  for (let i = 0; i < colspan; i++) {
    const startIdx = Math.floor((i * childCount) / colspan)
    const endIdx = Math.floor(((i + 1) * childCount) / colspan)
    const children: import('@milkdown/kit/prose/model').Node[] = []
    for (let j = startIdx; j < endIdx; j++) {
      children.push(cell.content.child(j))
    }
    const frag = Fragment.from(children)
    newCells.push(cell.type.create({ ...cell.attrs, colspan: 1 }, frag))
  }

  // 重建行
  const allCells = row.content.content.slice()
  allCells.splice(colIdx, 1, ...newCells)
  const newRow = row.type.create(row.attrs, allCells)

  // 重建表格
  const rows = table.content.content.slice()
  rows.splice(rowIdx, 1, newRow)
  const newTable = table.type.create(table.attrs, rows)

  dispatch(state.tr.replaceWith(tablePos, tablePos + table.nodeSize, newTable))
  return true
}
