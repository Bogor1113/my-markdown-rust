/// 表格行/列拖拽排序插件
///
/// 在表格左侧添加行拖拽手柄，顶部添加列拖拽手柄。
/// 拖拽手柄时高亮目标位置，松开后交换行/列。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node } from '@milkdown/kit/prose/model'
import { updateDecorations } from '../utils/incrementalDecorations'

const key = new PluginKey('table-drag-reorder')

type DragType = 'row' | 'col' | null

interface DragState {
  type: DragType
  fromIndex: number
  toIndex: number
  tablePos: number
  active: boolean
}

interface ReplaceResult {
  from: number
  to: number
  content: Node
}

function moveRow(doc: Node, schema: Node['type']['schema'], tablePos: number, from: number, to: number): ReplaceResult | null {
  const $table = doc.resolve(tablePos)
  const tableNode = $table.nodeAfter
  if (!tableNode || tableNode.type.name !== 'table') return null

  const rows = tableNode.content.content.slice()
  const [moved] = rows.splice(from, 1)
  rows.splice(to, 0, moved)

  const newTableContent = schema.nodes.table.create(null, rows)
  return { from: tablePos, to: tablePos + tableNode.nodeSize, content: newTableContent }
}

function moveCol(doc: Node, schema: Node['type']['schema'], tablePos: number, from: number, to: number): ReplaceResult | null {
  const $table = doc.resolve(tablePos)
  const tableNode = $table.nodeAfter
  if (!tableNode || tableNode.type.name !== 'table') return null

  const rows = tableNode.content.content.slice()
  const newRows = rows.map((row) => {
    const cells = row.content.content.slice()
    const [moved] = cells.splice(from, 1)
    cells.splice(to, 0, moved)
    return row.type.create(null, cells)
  })

  const newTableContent = schema.nodes.table.create(null, newRows)
  return { from: tablePos, to: tablePos + tableNode.nodeSize, content: newTableContent }
}

function createDecorations(
  doc: Node,
  from: number,
  to: number,
  setDragState: (s: DragState | null) => void,
): Decoration[] {
  const decorations: Decoration[] = []

  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'table') return

    const rows = node.content.content
    const colCount = rows[0]?.content.content.length ?? 0
    const tablePos = pos

    // 行拖拽手柄（左侧）
    rows.forEach((_row, rowIdx) => {
      let offset = 0
      for (let i = 0; i < rowIdx; i++) {
        offset += rows[i].nodeSize
      }
      const handlePos = pos + 1 + offset

      const el = document.createElement('div')
      el.className = 'table-row-drag-handle'
      el.dataset.row = String(rowIdx)
      el.draggable = true
      el.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragState({ type: 'row', fromIndex: rowIdx, toIndex: -1, tablePos, active: false })
      })

      decorations.push(
        Decoration.widget(handlePos, el, {
          side: -1,
          key: `row-handle-${tablePos}-${rowIdx}`,
        }),
      )
    })

    // 列拖拽手柄（顶部）
    if (colCount > 0 && rows[0]) {
      for (let colIdx = 0; colIdx < colCount; colIdx++) {
        let offset = 0
        for (let i = 0; i < colIdx; i++) {
          offset += rows[0].content.content[i].nodeSize
        }
        // cell[i] 内容起点 = table(pos) +1 进入行 +1 进入第一行内容 +1 进入 cell 内容，
        // 再加前面 cell 的 nodeSize 之和。widget 必须落在 cell **内部**开头，
        // 才会以该 cell（position:relative）为定位祖先：top:-14px 出现在本列正上方。
        // 旧实现少算了进入 cell 的 +1，widget 落进前一个 cell 的末尾，
        // 表现为「手柄显示在第 i 列上方，拖动的却是第 i-1 列」的错位。
        const el = document.createElement('div')
        el.className = 'table-col-drag-handle'
        el.dataset.col = String(colIdx)
        el.draggable = true
        el.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragState({ type: 'col', fromIndex: colIdx, toIndex: -1, tablePos, active: false })
        })

        decorations.push(
          Decoration.widget(pos + 3 + offset, el, {
            side: -1,
            key: `col-handle-${tablePos}-${colIdx}`,
          }),
        )
      }
    }
  })

  return decorations
}

export const tableDragReorderPlugin = $prose(() => {
  let dragState: DragState | null = null
  const setDragState = (s: DragState | null) => { dragState = s }

  // 增量 decoration：只重扫发生变化的顶层块（表格结构变化时自然落在变化区间内），
  // 其余手柄按位置平移复用。旧实现每个字符都做一次全文档指纹遍历（大文档 ~3ms/键），
  // 并且每次重建全部手柄 DOM。
  const build = (doc: Node, from: number, to: number) =>
    createDecorations(doc, from, to, setDragState)

  return new Plugin({
    key,
    state: {
      init: (_config, state) => ({
        doc: state.doc,
        set: DecorationSet.create(state.doc, build(state.doc, 0, state.doc.content.size)),
      }),
      apply: (tr, value) =>
        tr.docChanged
          ? { doc: tr.doc, set: updateDecorations(value.doc, tr.doc, value.set, build) }
          : value,
    },
    props: {
      decorations(state) {
        return key.getState(state)!.set
      },
      handleDOMEvents: {
        mousemove(_view, e) {
          if (!dragState) return false
          const target = e.target as HTMLElement
          const table = target.closest('table')
          if (!table) return false

          const trEl = target.closest('tr')
          const td = target.closest('td, th')
          if (!trEl || !td) return false

          const tbody = table.querySelector('tbody') || table
          const rows = Array.from(tbody.querySelectorAll('tr'))
          const row = rows.indexOf(trEl)
          const cells = Array.from(trEl.querySelectorAll('td, th'))
          const col = cells.indexOf(td)

          if (row < 0 || col < 0) return false

          dragState.active = true
          dragState.toIndex = dragState.type === 'row' ? row : col

          const highlightClass =
            dragState.type === 'row' ? 'table-row-drag-highlight' : 'table-col-drag-highlight'
          document.querySelectorAll(`.${highlightClass}`).forEach((el) => el.classList.remove(highlightClass))
          if (dragState.toIndex >= 0 && dragState.toIndex !== dragState.fromIndex) {
            // 旧实现把列选择器写成 `td, th:nth-child(n)`：逗号后的 nth-child 只限定 th，
            // 前半段的 td 会匹配**所有**单元格，整表全部被高亮。
            const selector =
              dragState.type === 'row'
                ? `tr:nth-child(${dragState.toIndex + 1})`
                : `td:nth-child(${dragState.toIndex + 1}), th:nth-child(${dragState.toIndex + 1})`
            table.querySelectorAll(selector).forEach((el) => el.classList.add(highlightClass))
          }
          return false
        },
        mouseup(_view, _e) {
          if (!dragState || !dragState.active) {
            dragState = null
            return false
          }
          // 表头行（index 0）是 table_header_row，schema 要求它固定在第一行；
          // 把它拖走或把其它行拖到 0 位都会产生非法文档，dispatch 时直接抛错。
          if (
            dragState.type === 'row' &&
            dragState.toIndex >= 0 &&
            dragState.toIndex !== dragState.fromIndex &&
            dragState.fromIndex !== 0 &&
            dragState.toIndex !== 0
          ) {
            const result = moveRow(_view.state.doc, _view.state.schema, dragState.tablePos, dragState.fromIndex, dragState.toIndex)
            if (result) _view.dispatch(_view.state.tr.replaceWith(result.from, result.to, result.content))
          } else if (dragState.type === 'col' && dragState.toIndex >= 0 && dragState.toIndex !== dragState.fromIndex) {
            const result = moveCol(_view.state.doc, _view.state.schema, dragState.tablePos, dragState.fromIndex, dragState.toIndex)
            if (result) _view.dispatch(_view.state.tr.replaceWith(result.from, result.to, result.content))
          }
          document.querySelectorAll('.table-row-drag-highlight, .table-col-drag-highlight').forEach((el) => {
            el.classList.remove('table-row-drag-highlight', 'table-col-drag-highlight')
          })
          dragState = null
          return false
        },
      },
    },
  })
})
