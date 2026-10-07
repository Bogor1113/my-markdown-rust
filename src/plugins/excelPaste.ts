/// 从 Excel / 表格软件 / CSV 粘贴生成 Markdown 表格。
///
/// - 剪贴板含 `text/html`（如 Excel 复制的富文本表格）时交给默认粘贴处理；
/// - 仅含 `text/plain` 且呈「多列网格」形态（TSV 优先，兼容 CSV）时，自动构建表格节点插入；
/// - 处于代码块内时不转换（避免代码里的 tab 被误判）；
/// - 单行的网格会补一行空 body 行（Milkdown 表格 schema 要求 header + ≥1 body）。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'

/** 解析 CSV 单行（支持双引号转义与字段内逗号） */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/** 把纯文本解析为字符串网格；不是表格形态则返回 null */
function parseGrid(text: string): string[][] | null {
  const normalized = text.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) return null

  // TSV（Excel / 谷歌表格 / WPS 复制）
  if (lines.every((l) => l.includes('\t'))) {
    const rows = lines.map((l) => l.split('\t').map((c) => c.trim()))
    if (rows[0].length >= 2) return rows
    return null
  }

  // CSV（多行、列数一致、≥2 列）
  if (lines.length >= 2) {
    const rows = lines.map(splitCsvLine)
    const cols = rows[0].length
    if (cols >= 2 && rows.every((r) => r.length === cols)) return rows
  }

  return null
}

export const excelPastePlugin = $prose(() =>
  new Plugin({
    key: new PluginKey('MDITOR_EXCEL_PASTE'),
    props: {
      handlePaste(view, event) {
        const data = event.clipboardData
        if (!data) return false

        const types = Array.from(data.types || [])
        // 富文本（含 HTML 表格）交给默认粘贴流程
        if (types.includes('text/html')) return false

        const text = data.getData('text/plain')
        if (!text) return false

        // 处于代码块内不转换（代码中的 tab 会被误判为表格）
        const $from = view.state.selection.$from
        for (let i = $from.depth; i > 0; i--) {
          if ($from.node(i).type.name === 'code_block') return false
        }

        const grid = parseGrid(text)
        if (!grid) return false

        const schema = view.state.schema
        const { table, table_header_row, table_row, table_header, table_cell, paragraph } =
          schema.nodes
        if (!table || !table_header_row || !table_row || !table_header || !table_cell) {
          return false
        }

        try {
          const makeCell = (type: typeof table_cell, content: string) =>
            type.create(null, paragraph.create(null, schema.text(content || ' ')))

          // 至少需要 header 行 + 1 个 body 行（schema 约束 table_row+）
          const rows = grid.length >= 2 ? grid : [grid[0], grid[0].map(() => '')]
          const headerRow = table_header_row.create(
            null,
            rows[0].map((c) => makeCell(table_header, c)),
          )
          const bodyRows = rows.slice(1).map((row) =>
            table_row.create(null, row.map((c) => makeCell(table_cell, c))),
          )
          const tableNode = table.create(null, [headerRow, ...bodyRows])

          view.dispatch(view.state.tr.replaceSelectionWith(tableNode))
          return true
        } catch (e) {
          console.error('Excel paste → table failed:', e)
          return false
        }
      },
    },
  }),
)
