import { useCallback, useEffect, useRef, useState } from 'react'
import { editorViewCtx } from '@milkdown/kit/core'
import {
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  insertHrCommand,
  toggleLinkCommand,
  insertImageCommand,
} from '@milkdown/kit/preset/commonmark'
import {
  toggleStrikethroughCommand,
  insertTableCommand,
  addColBeforeCommand,
  addColAfterCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  deleteSelectedCellsCommand,
  setAlignCommand,
} from '@milkdown/kit/preset/gfm'
import { callCommand, getMarkdown, getHTML } from '@milkdown/kit/utils'
import type { $Command } from '@milkdown/kit/utils'
import { TextSelection } from '@milkdown/kit/prose/state'
import { undo, redo } from '@milkdown/kit/prose/history'
import { deleteColumn } from '@milkdown/kit/prose/tables'
import { selectAll } from '@milkdown/kit/prose/commands'
import { Fragment, Slice, DOMParser as PMDOMParser } from '@milkdown/kit/prose/model'
import type { Node } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { useAppStore } from '../../stores/useAppStore'
import type { ContextMenuState } from '../../types'
import { invoke } from '@tauri-apps/api/core'
import { openUrl, openPath, revealItemInDir } from '@tauri-apps/plugin-opener'
import { insertCodeBlock as insertCodeBlockUtil } from '../../utils/editor'
import { pickImage, readFileBytes, deletePath, writeFileBytes } from '../../services/fs'
import { toLocalAbsPath } from '../../services/imageDisplay'
import { saveImageToAssets, IMAGE_MIME } from '../../services/images'
import { joinPath } from '../../utils/files'
import { codeBlockToStyledHtml, writeRichClipboard } from '../../utils/clipboard'
import { mergeCells, splitCell } from '../../plugins/table'
import { openSvgSourceEditor } from '../../plugins/svgSourceEditor'

export interface MenuEntry {
  label?: string
  shortcut?: string
  /** 菜单项左侧图标（文本或 Unicode 符号） */
  icon?: string
  /** action 会收到当前右键点击的文档位置 pos（用于把操作定位到点击处） */
  action?: (pos?: number) => void
  submenu?: MenuEntry[]
  type?: 'item' | 'sep'
}

type MenuMap = Record<string, MenuEntry[]>

/** 右键菜单结构（模仿 Typora）。
 *
 * 注意：菜单点击时 hideContextMenu() 会先清空 store.contextMenu，
 * 因此图片类操作需要的上下文（src/pos）必须在 build 时捕获进闭包，
 * 不能在 action 执行时再去读 store（否则拿到 null）。 */
const buildMenu = (ctx: ContextMenuState | null): MenuMap => {
  // 图片上下文：右键点击位置 + 图片地址，点击菜单项时闭包捕获使用
  const img = {
    src: ctx?.imageSrc ?? '',
    pos: ctx?.pos,
  }
  return {
  text: [
    { type: 'item', label: '撤销', shortcut: 'Ctrl+Z', action: pmCmd(undo) },
    { type: 'item', label: '重做', shortcut: 'Ctrl+Y', action: pmCmd(redo) },
    { type: 'sep' },
    { type: 'item', label: '全选', shortcut: 'Ctrl+A', action: pmCmd(selectAll) },
    { type: 'sep' },
    {
      type: 'item',
      label: '段落',
      submenu: [
        { type: 'item', label: '一级标题', shortcut: 'Ctrl+1', action: (pos) => runAt(wrapInHeadingCommand, 1, pos) },
        { type: 'item', label: '二级标题', shortcut: 'Ctrl+2', action: (pos) => runAt(wrapInHeadingCommand, 2, pos) },
        { type: 'item', label: '三级标题', shortcut: 'Ctrl+3', action: (pos) => runAt(wrapInHeadingCommand, 3, pos) },
        { type: 'item', label: '四级标题', shortcut: 'Ctrl+4', action: (pos) => runAt(wrapInHeadingCommand, 4, pos) },
        { type: 'item', label: '五级标题', shortcut: 'Ctrl+5', action: (pos) => runAt(wrapInHeadingCommand, 5, pos) },
        { type: 'item', label: '六级标题', shortcut: 'Ctrl+6', action: (pos) => runAt(wrapInHeadingCommand, 6, pos) },
        { type: 'item', label: '段落', shortcut: 'Ctrl+0', action: (pos) => runAt(turnIntoTextCommand, undefined, pos) },
        { type: 'sep' },
        { type: 'item', label: '引用', action: (pos) => runAt(wrapInBlockquoteCommand, undefined, pos) },
        { type: 'item', icon: '1.', label: '有序列表', action: () => run(wrapInOrderedListCommand) },
        { type: 'item', icon: '•', label: '无序列表', action: () => run(wrapInBulletListCommand) },
        { type: 'item', icon: '☑', label: '任务列表', action: (pos) => toggleTaskList(pos) },
        { type: 'sep' },
        { type: 'item', label: '代码块', action: (pos) => insertCodeBlock(pos) },
        { type: 'item', label: '分割线', action: (pos) => runAt(insertHrCommand, undefined, pos) },
        { type: 'item', label: '删除线', action: () => run(toggleStrikethroughCommand) },
      ],
    },
    {
      type: 'item',
      label: '链接',
      action: () =>
        promptHref('链接地址', (href) => {
          run(toggleLinkCommand, { href, title: '' })
        }),
    },
    {
      type: 'item',
      label: '图片',
      submenu: [
        { type: 'item', label: '本地图片…', action: () => void insertLocalImage() },
        { type: 'item', label: '在线图片（URL）…', action: () => promptOnlineImage() },
        { type: 'item', label: '插入 SVG 代码…', action: (pos) => promptInsertSvgCode(pos) },
      ],
    },
    {
      type: 'item',
      label: '表格',
      action: () =>
        promptTable((row, col) => {
          run(insertTableCommand, { row, col })
        }),
    },
    { type: 'sep' },
    { type: 'item', label: '复制为 Markdown', shortcut: 'Ctrl+Shift+C', action: () => copyAs('markdown') },
    { type: 'item', label: '复制为 HTML 代码', action: () => copyAs('html') },
    { type: 'sep' },
    { type: 'item', label: '粘贴', shortcut: 'Ctrl+V', action: (pos) => pasteSmart(pos) },
    {
      type: 'item',
      label: '粘贴为纯文本',
      shortcut: 'Ctrl+Shift+V',
      action: (pos) => void pastePlainText(pos),
    },
  ],
  codeBlock: [
    { type: 'item', label: '选择语言', action: () => openLangPicker() },
    { type: 'item', label: '复制代码', action: () => copyCode() },
    { type: 'sep' },
    { type: 'item', label: '粘贴', shortcut: 'Ctrl+V', action: (pos) => pasteSmart(pos) },
    {
      type: 'item',
      label: '粘贴为纯文本',
      shortcut: 'Ctrl+Shift+V',
      action: (pos) => void pastePlainText(pos),
    },
  ],
  table: [
    // 表格命令都先定位到右键点击处再执行（runAt），避免作用于滞留在别处的旧光标
    { type: 'item', label: '上方插入行', action: (pos) => runAt(addRowBeforeCommand, undefined, pos) },
    { type: 'item', label: '下方插入行', action: (pos) => runAt(addRowAfterCommand, undefined, pos) },
    { type: 'item', label: '左侧插入列', action: (pos) => runAt(addColBeforeCommand, undefined, pos) },
    { type: 'item', label: '右侧插入列', action: (pos) => runAt(addColAfterCommand, undefined, pos) },
    { type: 'sep' },
    { type: 'item', label: '删除选中单元格', action: (pos) => runAt(deleteSelectedCellsCommand, undefined, pos) },
    { type: 'item', label: '删除行', action: (pos) => deleteTableRow(pos) },
    { type: 'item', label: '删除列', action: (pos) => deleteTableCol(pos) },
    { type: 'sep' },
    { type: 'item', label: '删除表格', action: (pos) => deleteTable(pos) },
    { type: 'sep' },
    { type: 'item', label: '合并单元格', action: (pos) => mergeCellsAction(pos) },
    { type: 'item', label: '拆分单元格', action: (pos) => splitCellAction(pos) },
    { type: 'sep' },
    {
      type: 'item',
      label: '对齐',
      submenu: [
        { type: 'item', label: '左对齐', action: (pos) => runAt(setAlignCommand, 'left', pos) },
        { type: 'item', label: '居中', action: (pos) => runAt(setAlignCommand, 'center', pos) },
        { type: 'item', label: '右对齐', action: (pos) => runAt(setAlignCommand, 'right', pos) },
      ],
    },
    ],
  link: [
    { type: 'item', label: '打开链接', action: () => openLink() },
    { type: 'item', label: '复制链接地址', action: () => copyLink() },
  ],
    image: [
      { type: 'item', label: '用系统查看器打开', action: () => void openImage(img) },
      { type: 'item', label: '在文件管理器中显示', action: () => void revealImageInExplorer(img) },
      { type: 'sep' },
      { type: 'item', label: '复制图片到剪贴板', action: () => void copyImageToClipboard(img) },
      { type: 'item', label: '复制图片地址', action: () => copyImage(img) },
      // 更新路径/删除需定位 PM 节点，仅 Markdown 图片可用；HTML 块/行内里的 img 无节点
      ...(ctx?.imageFromHtml
        ? []
        : ([
            { type: 'sep' },
            { type: 'item', label: '更新图片路径…', action: () => updateImagePath(img) },
            { type: 'sep' },
            { type: 'item', label: '删除图片…', action: () => deleteImage(img) },
          ] as MenuEntry[])),
    ],
  }
}

/** 执行 Milkdown 命令：直接接收 $Command 对象，内部取其 key 调用 callCommand */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function run<T = any>(command: $Command<T>, payload?: T) {
  const { editor } = useAppStore.getState()
  editor?.action(callCommand(command.key, payload))
}

/**
 * 在指定文档位置执行 Milkdown 命令：先把光标移到右键点击位置再执行，
 * 确保块级操作（标题/列表/分割线等）作用于点击处，而非可能滞留在别处的旧光标。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runAt<T = any>(command: $Command<T>, payload: T | undefined, pos?: number) {
  const { editor } = useAppStore.getState()
  if (!editor) return
  editor.action((ctx) => {
    if (pos != null) {
      const view = ctx.get(editorViewCtx)
      if (!view) return false
      const target = Math.max(0, Math.min(pos, view.state.doc.content.size))
      const near = TextSelection.near(view.state.doc.resolve(target), 1)
      if (near.$from.parent.isTextblock) {
        view.dispatch(view.state.tr.setSelection(near))
      }
    }
    return callCommand(command.key, payload)(ctx)
  })
}

/** 执行裸 ProseMirror 命令（undo/redo/selectAll 等非 $Command 包装），返回 action 闭包 */
function pmCmd(cmd: (state: any, dispatch?: any) => boolean) {
  return () => {
    const { editor } = useAppStore.getState()
    if (!editor) return
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!view) return false
      return cmd(view.state, view.dispatch)
    })
  }
}

/** 切换任务列表（checked 属性）：找到光标所在的 list_item，切换 checked */
function toggleTaskList(pos?: number) {
  const { editor } = useAppStore.getState()
  if (!editor) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return false
    // 先定位到右键点击处
    if (pos != null) {
      const target = Math.max(0, Math.min(pos, view.state.doc.content.size))
      const near = TextSelection.near(view.state.doc.resolve(target), 1)
      if (near.$from.parent.isTextblock) {
        view.dispatch(view.state.tr.setSelection(near))
      }
    }
    const { $from } = view.state.selection
    // 向上查找 list_item 节点
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d)
      if (node.type.name === 'list_item') {
        const before = $from.before(d)
        const checked = node.attrs.checked as boolean | null
        // 如果已有 checked 属性，切换；否则设置为 false（未选中）
        const next = checked === true ? false : checked === false ? null : false
        view.dispatch(view.state.tr.setNodeAttribute(before, 'checked', next))
        return true
      }
    }
    return false
  })
}

/** 删除右键点击所在的行（自定义实现，替代 prosemirror-tables 的 deleteRow）：
 *
 *  prosemirror-tables 的 deleteRow 用 tr.delete 直接删除行节点，但在 Milkdown 的
 *  schema（`table_header_row table_row+`）下有两个坑：
 *  1. 删除表头行会让表格失去表头 → ProseMirror 拒绝该事务（表现为「删除行无效」）；
 *  2. 删除最后一行时，「行尾 = 表格内容尾」导致替换/删除边界深度不一致 → 产生垃圾文档。
 *
 *  这里改为：普通行直接删行范围；表头行先删第一行数据行再把其单元格提升为新表头；
 *  最后一行则先把上一行的单元格写入最后一行再删除上一行（等效删除）；
 *  仅剩表头 + 一行数据时删除整个表格。 */
function deleteTableRow(pos?: number) {
  const { editor } = useAppStore.getState()
  if (!editor) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return false
    // 先把光标移到右键点击处，确保定位到用户点击的那一行
    if (pos != null) {
      const target = Math.max(0, Math.min(pos, view.state.doc.content.size))
      const near = TextSelection.near(view.state.doc.resolve(target), 1)
      view.dispatch(view.state.tr.setSelection(near))
    }
    const $head = view.state.selection.$head
    // 从光标向上找到所在的行（tableRole === 'row'）
    let rowDepth = 0
    for (let d = $head.depth; d > 0; d--) {
      if ($head.node(d).type.spec.tableRole === 'row') {
        rowDepth = d
        break
      }
    }
    if (!rowDepth) return false
    // 注意：index(d) 返回的是「depth+1 层节点在其父节点中的下标」，行在表格中的序号是 index(rowDepth - 1)
    const rowIndex = $head.index(rowDepth - 1)
    const table = $head.node(rowDepth - 1)
    const tableStart = $head.start(rowDepth - 1)
    const schema = view.state.schema

    /** 表格第 i 行在文档中的起始位置 */
    const rowStartOf = (i: number) => {
      let start = tableStart + 1
      for (let k = 0; k < i; k++) start += table.child(k).nodeSize
      return start
    }

    // 仅剩表头 + 一行数据：删除后表格无法保留合法结构（需至少一行数据）→ 删除整个表格
    if (table.childCount <= 2) {
      view.dispatch(view.state.tr.delete(tableStart - 1, tableStart - 1 + table.nodeSize))
      useAppStore.getState().showToast('表格仅剩表头行，已删除整个表格')
      view.focus()
      return true
    }

    let tr = view.state.tr
    if (rowIndex === 0) {
      // 删除表头行：先删第一行数据行，再把该行的单元格提升为新的表头单元格
      const headerStart = rowStartOf(0)
      const headerEnd = headerStart + table.child(0).nodeSize
      const newHeaderCells: Node[] = []
      table.child(1).forEach((cell) => {
        newHeaderCells.push(schema.nodes.table_header.create(cell.attrs, cell.content))
      })
      tr = tr.delete(rowStartOf(1), rowStartOf(1) + table.child(1).nodeSize)
      tr = tr.replaceWith(headerStart, headerEnd - 1, newHeaderCells)
    } else if (rowIndex === table.childCount - 1) {
      // 删除最后一行：把上一行的单元格写入最后一行，再删除上一行（等效删除最后一行）
      const prevStart = rowStartOf(rowIndex - 1)
      const prevSize = table.child(rowIndex - 1).nodeSize
      const lastStart = prevStart + prevSize
      const lastSize = table.child(rowIndex).nodeSize
      const prevCells: Node[] = []
      table.child(rowIndex - 1).forEach((cell) => {
        prevCells.push(schema.nodes.table_cell.create(cell.attrs, cell.content))
      })
      tr = tr.replaceWith(lastStart, lastStart + lastSize - 1, prevCells)
      tr = tr.delete(prevStart, prevStart + prevSize)
    } else {
      // 普通数据行：直接删除该行范围
      const rowStart = rowStartOf(rowIndex)
      tr = tr.delete(rowStart, rowStart + table.child(rowIndex).nodeSize)
    }
    view.dispatch(tr)
    view.focus()
    return true
  })
}

function deleteTableCol(pos?: number) {
  const { editor } = useAppStore.getState()
  if (!editor) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return false
    if (pos != null) {
      const near = TextSelection.near(view.state.doc.resolve(pos), 1)
      view.dispatch(view.state.tr.setSelection(near))
    }
    deleteColumn(view.state, view.dispatch)
    return true
  })
}

/** 复制当前选区（或全文）为 Markdown / HTML */
async function copyAs(kind: 'markdown' | 'html') {
  const { editor } = useAppStore.getState()
  if (!editor) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return false
    const { from, to } = view.state.selection
    const text = kind === 'markdown' ? getMarkdown({ from, to })(ctx) : getHTML()(ctx)
    navigator.clipboard.writeText(text)
    return true
  })
}

/** 把光标移到右键点击位置（仿照 runAt 的定位逻辑；点击处非文本块则保持原光标） */
function moveSelToPos(view: EditorView, pos?: number): boolean {
  if (pos == null) return false
  const target = Math.max(0, Math.min(pos, view.state.doc.content.size))
  const near = TextSelection.near(view.state.doc.resolve(target), 1)
  if (!near.$from.parent.isTextblock) return false
  view.dispatch(view.state.tr.setSelection(near))
  return true
}

/** 剪贴板 HTML → 纯文本（去标签去实体，解析失败时的兜底） */
function htmlToPlain(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? ''
}

/**
 * 把纯文本插入当前选区/光标处：
 * - 代码块内：多行直接插入（代码块允许换行）；
 * - 单行 / 光标在文本块内：等同打字插入；
 * - 多行：按行切成多个段落整体替换选区（replaceRange 会自动处理所在块的分割）。
 */
function insertPlainText(view: EditorView, plain: string): boolean {
  const { $from, $to } = view.state.selection
  const schema = view.state.schema
  const lines = plain.split('\n')

  let tr = view.state.tr
  if ($from.parent.type.spec.code) {
    // 代码块：换行属于合法内容，直接整体插入
    tr.insertText(plain)
  } else if ($from.sameParent($to) && lines.length === 1) {
    // 单行：等同打字插入（继承光标处的书写 mark）
    tr.insertText(lines[0] ?? '')
  } else {
    // 多行 / 跨块：按行切成段落整片替换；replaceRange 自动处理段落分割与块嵌套
    const paras = lines.map((ln) =>
      ln
        ? schema.nodes.paragraph.create(null, schema.text(ln))
        : schema.nodes.paragraph.create(null),
    )
    tr.replaceRange($from.pos, $to.pos, Slice.maxOpen(Fragment.from(paras)))
    tr.setSelection(TextSelection.near(tr.doc.resolve($from.pos), 1))
  }
  view.dispatch(tr.scrollIntoView())
  view.focus()
  return true
}

/**
 * 原生粘贴（Ctrl+V）：
 * WebView2 中 document.execCommand('paste') 会被浏览器策略静默拦截（程序化粘贴受限），
 * 因此改为直接读剪贴板、自己完成插入：
 * - 剪贴板有 HTML → 用 ProseMirror 原生 DOMParser.fromSchema(schema).parse()
 *   （与真实 Ctrl+V 完全同一管线）把 HTML 解析成富文本节点（表格/列表/加粗等按 schema 还原），整体插入；
 * - 只有纯文本 → 等同 Ctrl+Shift+V 插入原样文本；
 * - 目标在代码块内 → 一律按纯文本插入（不解析结构）。
 * 读取优先 navigator.clipboard.read()，权限受限时退化为 readText()。
 */
async function pasteSmart(pos?: number) {
  const { editor, showToast } = useAppStore.getState()
  if (!editor) return

  let html = ''
  let text = ''
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      if (!html && item.types.includes('text/html')) {
        const blob = await item.getType('text/html')
        html = (await blob.text()).trim()
      } else if (!text && item.types.includes('text/plain')) {
        const blob = await item.getType('text/plain')
        text = (await blob.text()).trim()
      }
    }
  } catch {
    // read() 权限受限 → 退化为 readText()
  }
  if (!html && !text) {
    try {
      text = (await navigator.clipboard.readText()).trim()
    } catch {
      showToast('无法读取剪贴板，请直接使用 Ctrl+V 粘贴')
      return
    }
  }
  if (!html && !text) return

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return false
    // 先定位到右键点击处（有选区时保留原选区，让替换动作作用于用户选中的文字）
    moveSelToPos(view, pos)

    // 代码块内：不解析结构，原样插入纯文本
    if (view.state.selection.$from.parent.type.spec.code) {
      return insertPlainText(view, html ? htmlToPlain(html) : text)
    }

    // 有富文本 → ProseMirror 原生 DOMParser（与真实 Ctrl+V 同一管线）
    if (html) {
      try {
        const wrapper = new DOMParser().parseFromString(html, 'text/html')
        const parsed = PMDOMParser.fromSchema(view.state.schema).parse(wrapper.body)
        if (parsed && parsed.content.size > 0) {
          const from = view.state.selection.from
          const to = view.state.selection.to
          const tr = view.state.tr.replaceRange(from, to, Slice.maxOpen(parsed.content))
          tr.setSelection(TextSelection.near(tr.doc.resolve(from), 1))
          view.dispatch(tr.scrollIntoView())
          view.focus()
          return true
        }
      } catch {
        // 解析异常（如结构不合 schema 的表格）→ 落到纯文本兜底
      }
    }

    // 纯文本兜底（与「粘贴为纯文本」同路径）
    return insertPlainText(view, text || htmlToPlain(html))
  })
}

/**
 * 粘贴为纯文本（Ctrl+Shift+V）：
 * 读取剪贴板纯文本并原样插入（不做 markdown 解析、不带 HTML 格式）。
 */
async function pastePlainText(pos?: number) {
  const { editor, showToast } = useAppStore.getState()
  if (!editor) return
  let text = ''
  try {
    text = await navigator.clipboard.readText()
  } catch {
    showToast('无法读取剪贴板，请直接使用 Ctrl+V 粘贴')
    return
  }
  if (!text) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return false
    // 先定位到右键点击处（有选区时保留原选区，让替换动作作用于用户选中的文字）
    moveSelToPos(view, pos)
    return insertPlainText(view, text)
  })
}

/** 插入代码块：在右键点击位置（或当前光标处）插入并把光标定位到块内（见 utils/editor.ts） */
function insertCodeBlock(pos?: number) {
  const { editor } = useAppStore.getState()
  if (editor) insertCodeBlockUtil(editor, pos)
}

/** 删除整个表格 */
function deleteTable(pos?: number) {
  const { editor } = useAppStore.getState()
  if (!editor || pos == null) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return false
    const $pos = view.state.doc.resolve(pos)
    for (let d = $pos.depth; d >= 0; d--) {
      const node = d === 0 ? $pos.doc : $pos.node(d)
      if (node.type.name === 'table') {
        const tablePos = d === 0 ? 0 : $pos.before(d)
        const tableEnd = d === 0 ? node.nodeSize : tablePos + node.nodeSize
        const tr = view.state.tr.delete(tablePos, tableEnd)
        view.dispatch(tr)
        return true
      }
    }
    // 兜底：pos 恰好落在表格节点本身（nodeAfter 为 table，非祖先）
    const nodeAtPos = view.state.doc.nodeAt(pos)
    if (nodeAtPos?.type.name === 'table') {
      const tr = view.state.tr.delete(pos, pos + nodeAtPos.nodeSize)
      view.dispatch(tr)
      return true
    }
    return false
  })
}

/** 合并单元格上下文菜单动作 */
function mergeCellsAction(pos?: number) {
  const { editor } = useAppStore.getState()
  if (!editor) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return false
    if (pos != null) {
      const target = Math.max(0, Math.min(pos, view.state.doc.content.size))
      const near = TextSelection.near(view.state.doc.resolve(target), 1)
      if (near.$from.parent.isTextblock) {
        view.dispatch(view.state.tr.setSelection(near))
      }
    }
    return mergeCells(view)
  })
}

/** 拆分单元格上下文菜单动作 */
function splitCellAction(pos?: number) {
  const { editor } = useAppStore.getState()
  if (!editor) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return false
    if (pos != null) {
      const target = Math.max(0, Math.min(pos, view.state.doc.content.size))
      const near = TextSelection.near(view.state.doc.resolve(target), 1)
      if (near.$from.parent.isTextblock) {
        view.dispatch(view.state.tr.setSelection(near))
      }
    }
    return splitCell(view)
  })
}

/**
 * 选择本地图片 → 复制到当前文档的 <文件名>.assets → 插入相对路径引用
 */
async function insertLocalImage() {
  const file = await pickImage()
  if (!file) return
  try {
    const bytes = await readFileBytes(file)
    const name = file.split('\\').pop()?.split('/').pop() || 'image.png'
    const ext = (name.split('.').pop() || '').toLowerCase()
    const mime = IMAGE_MIME[ext] || 'application/octet-stream'
    const src = await saveImageToAssets(name, mime, bytes)
    if (src) run(insertImageCommand, { src, alt: name, title: '' })
  } catch (e) {
    console.error('Failed to insert local image:', e)
  }
}

/** 复制整个代码块：带语法高亮颜色的 HTML + 纯文本兜底（与代码块复制按钮一致） */
function copyCode() {
  const { editor, contextMenu } = useAppStore.getState()
  if (!editor || contextMenu?.codeBlockPos == null) return
  const blockPos = contextMenu.codeBlockPos
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return false
    const node = view.state.doc.nodeAt(blockPos)
    if (node) void writeRichClipboard(codeBlockToStyledHtml(view, blockPos) ?? '', node.textContent)
    return true
  })
}

/**
 * 打开链接/图片的目标：
 * - URL（http/https/mailto/data 等）→ openUrl 交给系统默认浏览器
 * - 本地路径（相对/绝对）→ openPath 用系统默认程序打开
 * 失败（权限/文件不存在等）时给出提示，避免静默无效。
 */
async function openHrefOrPath(target: string) {
  const t = target.trim()
  if (!t) return
  try {
    const local = toLocalAbsPath(t)
    if (local) {
      await openPath(local)
      return
    }
    await openUrl(t)
  } catch {
    useAppStore.getState().showToast('打开失败：无法访问该路径或文件不存在')
  }
}

/** 在系统文件管理器中定位图片（仅本地图片可用） */
async function revealImageInExplorer(img: { src: string }) {
  const { showToast } = useAppStore.getState()
  const local = toLocalAbsPath(img.src)
  if (!local) {
    showToast('仅本地图片支持在文件管理器中显示')
    return
  }
  try {
    await revealItemInDir(local)
  } catch {
    showToast('无法在文件管理器中定位该文件')
  }
}

function openLink() {
  const { contextMenu } = useAppStore.getState()
  if (contextMenu?.href) void openHrefOrPath(contextMenu.href)
}

function copyLink() {
  const { contextMenu } = useAppStore.getState()
  if (contextMenu?.href) navigator.clipboard.writeText(contextMenu.href)
}

/** 远程/asset/data 图片 → 下载到系统临时目录，返回本地路径；失败返回 null */
async function downloadImageToTemp(src: string): Promise<string | null> {
  try {
    const blob = await imageSrcToBlob(src)
    if (!blob) return null
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const ext = (blob.type.split('/')[1] || 'png').toLowerCase().replace('+xml', '')
    const tmpDir = await invoke<string>('temp_dir')
    const filePath = joinPath(tmpDir, `mymdedit-open-${Date.now()}.${ext}`)
    await writeFileBytes(filePath, bytes)
    return filePath
  } catch {
    return null
  }
}

/**
 * 用系统默认查看器打开图片：
 * - 本地路径 → openPath 直接打开
 * - 远程/data 地址 → 先下载到临时目录再打开（比丢给浏览器更可靠，
 *   网络不可达时也能给出明确的失败提示，而不是浏览器里一片空白）
 */
async function openImage(img: { src: string }) {
  const { showToast } = useAppStore.getState()
  if (!img.src) return
  const local = toLocalAbsPath(img.src)
  if (local) {
    try {
      await openPath(local)
    } catch {
      showToast('打开失败：文件不存在或已被移动')
    }
    return
  }
  const tmp = await downloadImageToTemp(img.src)
  if (!tmp) {
    showToast('打开失败：图片下载失败（网络无法访问该地址）')
    return
  }
  try {
    await openPath(tmp)
  } catch {
    showToast('打开失败：无法打开图片')
  }
}

/** 复制图片地址（Markdown 里保存的原始 src 字符串） */
function copyImage(img: { src: string }) {
  if (img.src) navigator.clipboard.writeText(img.src)
}

// ── 图片操作：复制到剪贴板 / 更新路径 ──

/** 把图片 src 解析成 Blob：本地路径读字节，远程/asset URL fetch */
async function imageSrcToBlob(src: string): Promise<Blob | null> {
  if (/^https?:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('asset:')) {
    try {
      const resp = await fetch(src)
      if (!resp.ok) return null
      return await resp.blob()
    } catch {
      return null
    }
  }
  const abs = toLocalAbsPath(src)
  if (!abs) return null
  try {
    const bytes = await readFileBytes(abs)
    const ext = (abs.split('.').pop() || '').toLowerCase()
    const mime = IMAGE_MIME[ext] || 'image/png'
    // readFileBytes 返回的是完整 buffer（无偏移），可直接作 BlobPart
    return new Blob([bytes.buffer as ArrayBuffer], { type: mime })
  } catch {
    return null
  }
}

/** SVG → PNG（画布重绘），让 Word 等富文本目标能粘贴位图 */
function svgToPngBlob(blob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || 800
      canvas.height = img.naturalHeight || 600
      canvas.getContext('2d')?.drawImage(img, 0, 0)
      canvas.toBlob((b) => {
        URL.revokeObjectURL(url)
        resolve(b)
      }, 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

/** 复制图片本体到系统剪贴板（可粘贴进 Word / 微信 / 画图等） */
async function copyImageToClipboard(img: { src: string }) {
  const { showToast } = useAppStore.getState()
  if (!img.src) return
  try {
    let blob = await imageSrcToBlob(img.src)
    if (!blob) throw new Error('image unavailable')
    // SVG 转 PNG 提高粘贴兼容性
    if (blob.type === 'image/svg+xml') {
      const png = await svgToPngBlob(blob)
      if (png) blob = png
    }
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    showToast('图片已复制到剪贴板')
  } catch {
    showToast('复制图片失败：无法写入剪贴板')
  }
}

/**
 * 在右键点击位置附近查找图片节点（pos 处 / 前一个节点：inline atom 点击后
 * pos 常落在节点之后 / 后一个节点）。找不到返回 null。
 */
function findImageAt(view: EditorView, pos: number | undefined): { p: number; node: Node } | null {
  if (pos == null || view.isDestroyed) return null
  const doc = view.state.doc
  const max = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(max)

  const at = doc.nodeAt(max)
  if (at?.type.name === 'image') return { p: max, node: at }
  if ($pos.nodeBefore?.type.name === 'image') {
    const p = max - $pos.nodeBefore.nodeSize
    const n = doc.nodeAt(p)
    if (n?.type.name === 'image') return { p, node: n }
  }
  if ($pos.nodeAfter?.type.name === 'image') {
    const p = max + 1
    const n = doc.nodeAt(p)
    if (n?.type.name === 'image') return { p, node: n }
  }
  return null
}

/**
 * 更新右键点击处图片节点的 src（findSelectedNodeOfType 依赖选区，
 * 右键点击不一定选中图片，这里用 findImageAt 在指定位置查找并 setNodeMarkup）。
 */
function updateImageAt(pos: number | undefined, src: string) {
  const { editor } = useAppStore.getState()
  if (!editor || pos == null) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view) return false
    const target = findImageAt(view, pos)
    if (!target) return false
    view.dispatch(
      view.state.tr.setNodeMarkup(target.p, undefined, { ...target.node.attrs, src }),
    )
    view.focus()
    return true
  })
}

/** 从文档中删除右键点击处的图片节点；找不到返回 false */
function deleteImageAt(pos: number | undefined): boolean {
  const { editor } = useAppStore.getState()
  if (!editor) return false
  let removed = false
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return false
    const target = findImageAt(view, pos)
    if (!target) return false
    view.dispatch(view.state.tr.delete(target.p, target.p + target.node.nodeSize))
    view.focus()
    removed = true
    return true
  })
  return removed
}

/**
 * 删除图片：从文档移除节点；本地图片经确认后同时删除磁盘文件。
 * 非本地（URL/data）只移除节点（可撤销，无需确认）。
 */
function deleteImage(img: { src: string; pos?: number }) {
  const { showToast } = useAppStore.getState()
  const local = toLocalAbsPath(img.src)
  // 网络/数据源图片：仅从文档移除（Ctrl+Z 可撤销），无需弹窗
  if (!local) {
    if (deleteImageAt(img.pos)) showToast('图片已从文档移除')
    return
  }
  useAppStore.getState().openPrompt({
    title: '删除图片',
    message: `将从文档移除该图片，并把本地文件移入系统回收站：\n${local}\n\n如需彻底找回，可从回收站恢复。`,
    fields: [],
    confirmLabel: '删除',
    danger: true,
    onConfirm: () => {
      const removed = deleteImageAt(img.pos)
      void deletePath(local)
        .then(({ recycled }) => {
          showToast(
            removed
              ? recycled
                ? '图片已移除，本地文件已移入回收站'
                : '图片已移除，本地文件已删除（回收站不可用）'
              : recycled
                ? '本地文件已移入回收站'
                : '本地文件已删除（回收站不可用）',
          )
        })
        .catch((e) => {
          showToast(
            removed
              ? `图片已从文档移除，但本地文件删除失败：${String(e)}`
              : `本地文件删除失败：${String(e)}`,
          )
        })
    },
  })
}

/** 更新图片路径：可输入路径/URL，也可「浏览…」选本地图片（自动复制到 .assets） */
function updateImagePath(img: { src: string; pos?: number }) {
  useAppStore.getState().openPrompt({
    title: '更新图片路径',
    message: '输入新的路径或 URL；或点击「浏览…」选择本地图片（自动复制到文档的 .assets 目录）。',
    fields: [
      {
        id: 'src',
        label: '图片路径或 URL',
        defaultValue: img.src,
        validate: (v) => (v.trim() ? null : '请输入图片路径或 URL'),
        browse: {
          label: '浏览…',
          pick: async () => {
            const file = await pickImage()
            if (!file) return ''
            const bytes = await readFileBytes(file)
            const name = file.split('\\').pop()?.split('/').pop() || 'image.png'
            const ext = (name.split('.').pop() || '').toLowerCase()
            const mime = IMAGE_MIME[ext] || 'application/octet-stream'
            return (await saveImageToAssets(name, mime, bytes)) ?? ''
          },
        },
      },
    ],
    confirmLabel: '更新',
    onConfirm: (values) => {
      const src = values.src?.trim()
      if (src) updateImageAt(img.pos, src)
    },
  })
}

/** 打开代码块语言选择器（LangPicker 由 Editor 外层渲染） */
function openLangPicker() {
  const { contextMenu, showLangPicker } = useAppStore.getState()
  if (!contextMenu?.codeBlockPos) return
  showLangPicker({
    visible: true,
    x: contextMenu.x,
    y: contextMenu.y,
    pos: contextMenu.codeBlockPos,
    language: contextMenu.codeLang ?? '',
  })
}

// ── 输入提示（自绘弹窗，替换原生 prompt） ──

function promptHref(title: string, onOk: (href: string) => void) {
  useAppStore.getState().openPrompt({
    title,
    fields: [{ id: 'href', label: '链接地址', defaultValue: 'https://' }],
    confirmLabel: '插入',
    onConfirm: (values) => {
      const href = values.href?.trim()
      if (href) onOk(href)
    },
  })
}

function promptTable(onOk: (row: number, col: number) => void) {
  const numValidate = (name: string) => (value: string) => {
    const n = parseInt(value, 10)
    return Number.isInteger(n) && n >= 1 && n <= 20 ? null : `${name}须为 1-20 的整数`
  }
  useAppStore.getState().openPrompt({
    title: '插入表格',
    fields: [
      { id: 'row', label: '行数', defaultValue: '3', validate: numValidate('行数') },
      { id: 'col', label: '列数', defaultValue: '3', validate: numValidate('列数') },
    ],
    confirmLabel: '插入',
    onConfirm: (values) => {
      onOk(parseInt(values.row, 10), parseInt(values.col, 10))
      // row/col 已通过 validate，这里直接转为 number 传给命令
    },
  })
}

/** 插入在线图片：弹窗输入 URL，用 insertImageCommand 插入到光标处 */
function promptOnlineImage() {
  useAppStore.getState().openPrompt({
    title: '插入在线图片',
    fields: [{ id: 'src', label: '图片 URL', placeholder: '粘贴图片地址，如 img.example.com/a.png', defaultValue: '' }],
    confirmLabel: '插入',
    onConfirm: (values) => {
      const raw = values.src?.trim()
      if (!raw) return
      const src =
        /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
        raw.startsWith('//') ||
        raw.startsWith('#') ||
        raw.startsWith('/') ||
        raw.startsWith('.')
          ? raw
          : `https://${raw}`
      run(insertImageCommand, { src, alt: '', title: '' })
    },
  })
}

/** 默认 SVG 模板：插入时给用户一个可编辑的起点（带实时预览） */
const DEFAULT_SVG_TEMPLATE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="80" fill="#4dabf7" stroke="#1864ab" stroke-width="4"/>
  <text x="100" y="115" font-size="40" text-anchor="middle" fill="#fff">SVG</text>
</svg>`

/**
 * 插入 SVG 代码：复用 SVG 源码编辑条（textarea + 实时预览 + XML 校验），
 * 应用后把源码作为 htmlBlock 节点插入到光标/右键点击处。
 * - 空段落 → 替换为 htmlBlock；非空段落 → 在其后插入 htmlBlock + 空段落；
 * - 插入后单击该 SVG 即可再次编辑源码（htmlSvgEdit 插件已实现）。
 */
function promptInsertSvgCode(pos?: number) {
  const { editor } = useAppStore.getState()
  if (!editor) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return false

    const htmlBlock = view.state.schema.nodes.htmlBlock
    if (!htmlBlock) {
      useAppStore.getState().showToast('不支持插入 SVG 代码')
      return false
    }
    const paragraph = view.state.schema.nodes.paragraph

    let target = pos ?? view.state.selection.from
    target = Math.max(0, Math.min(target, view.state.doc.content.size))

    openSvgSourceEditor(view, {
      pos: target,
      source: DEFAULT_SVG_TEMPLATE,
      onApply: (newSource) => {
        if (view.isDestroyed) return false
        const src = newSource.trim()
        if (!src) {
          useAppStore.getState().showToast('SVG 源码为空')
          return false
        }
        if (!/<svg[\s>]/i.test(src)) {
          useAppStore.getState().showToast('源码未包含 <svg> 标签')
          return false
        }
        // 自动补 </svg>：未闭合时浏览器虽能渲染，但写回文件需保证闭合
        let value = src
        if (!/<\/svg>\s*$/i.test(src) && !/\/>\s*$/i.test(src)) {
          value = `${src}</svg>`
        }

        const node = htmlBlock.create({ value })
        let $t = view.state.doc.resolve(target)
        // 非 textblock（块间隙）→ 就近落入相邻文本块
        if (!$t.parent.isTextblock) {
          let found = -1
          if ($t.nodeAfter?.isTextblock) found = $t.pos + 1
          else if ($t.nodeBefore?.isTextblock) found = $t.pos - 1
          if (found >= 0) {
            target = found
            $t = view.state.doc.resolve(target)
          }
        }

        let tr
        if ($t.parent.isTextblock && $t.parent.content.size === 0) {
          // 空段落：替换为 htmlBlock
          tr = view.state.tr.replaceWith($t.before($t.depth), $t.after($t.depth), node)
        } else if ($t.parent.isTextblock) {
          // 非空段落：在其后插入 htmlBlock + 空段落（供光标继续）
          const blockEnd = $t.after($t.depth)
          const nodes = [node]
          if (paragraph) nodes.push(paragraph.create())
          tr = view.state.tr.insert(blockEnd, nodes)
          if (paragraph) {
            const caret = blockEnd + node.nodeSize + 1
            try {
              tr.setSelection(TextSelection.near(tr.doc.resolve(caret)))
            } catch {
              // 定位失败不阻塞插入
            }
          }
        } else {
          // 兜底：直接在 target 插入
          tr = view.state.tr.insert(target, node)
        }
        view.dispatch(tr.scrollIntoView())
        useAppStore.getState().showToast('SVG 已插入，单击可编辑源码')
        return true
      },
    })
    return false
  })
}

// ── React 组件 ──

const ContextMenu = () => {
  const contextMenu = useAppStore((s) => s.contextMenu)
  const hideContextMenu = useAppStore((s) => s.hideContextMenu)
  const menuRef = useRef<HTMLDivElement>(null)
  const [adjustedPos, setAdjustedPos] = useState({ x: 0, y: 0 })

  // 点击菜单外 / Esc / 滚动 / 失焦 → 关闭
  const handleGlobal = useCallback(
    (e: Event) => {
      if (e.type === 'mousedown') {
        const ev = e as MouseEvent
        // 注意：本文件导入了 prosemirror 的 Node 类型，这里必须用 DOM 的 globalThis.Node
        if (menuRef.current && !menuRef.current.contains(ev.target as globalThis.Node)) hideContextMenu()
      } else if (e.type === 'keydown') {
        if ((e as KeyboardEvent).key === 'Escape') hideContextMenu()
      } else {
        hideContextMenu()
      }
    },
    [hideContextMenu],
  )

  useEffect(() => {
    if (!contextMenu) return
    document.addEventListener('mousedown', handleGlobal)
    document.addEventListener('keydown', handleGlobal)
    window.addEventListener('scroll', handleGlobal, true)
    window.addEventListener('blur', handleGlobal)
    return () => {
      document.removeEventListener('mousedown', handleGlobal)
      document.removeEventListener('keydown', handleGlobal)
      window.removeEventListener('scroll', handleGlobal, true)
      window.removeEventListener('blur', handleGlobal)
    }
  }, [contextMenu, handleGlobal])

  // 菜单显式后调整位置，避免超出视口
  useEffect(() => {
    if (!contextMenu) return
    // 使用 requestAnimationFrame 确保菜单已渲染
    const raf = requestAnimationFrame(() => {
      if (!menuRef.current) return
      const menuRect = menuRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      let x = contextMenu.x
      let y = contextMenu.y

      // 右侧超出 → 左移
      if (x + menuRect.width > vw) {
        x = vw - menuRect.width - 8
      }
      // 底部超出 → 上移
      if (y + menuRect.height > vh) {
        y = vh - menuRect.height - 8
      }
      // 不得小于 0
      x = Math.max(4, x)
      y = Math.max(4, y)

      setAdjustedPos({ x, y })
    })
    return () => cancelAnimationFrame(raf)
  }, [contextMenu])

  if (!contextMenu) return null

  const menu = buildMenu(contextMenu)
  const items = menu[contextMenu.type] ?? menu.text

  return (
    <div
      ref={menuRef}
      className="mditor-context-menu"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.type === 'sep' ? (
          <div key={i} className="mditor-menu-sep" />
        ) : (
          <div
            key={i}
            className="mditor-menu-item"
            onClick={() => {
              if (item.submenu?.length) return
              // 先捕获点击位置再隐藏菜单（隐藏后 store 中 contextMenu 已被清空）
              const menuPos = contextMenu?.pos
              hideContextMenu()
              item.action?.(menuPos)
            }}
          >
            {item.icon && <span className="mditor-menu-icon">{item.icon}</span>}
            <span className="mditor-menu-label">{item.label}</span>
            {item.shortcut && <span className="mditor-menu-shortcut">{item.shortcut}</span>}
            {item.submenu?.length ? <span className="mditor-menu-arrow">›</span> : null}
            {item.submenu?.length ? (
              <div className="mditor-submenu">
                {item.submenu.map((sub, j) =>
                  sub.type === 'sep' ? (
                    <div key={j} className="mditor-menu-sep" />
                  ) : (
                    <div
                      key={j}
                      className="mditor-menu-item"
                      onClick={() => {
                        // 先捕获点击位置再隐藏菜单（隐藏后 store 中 contextMenu 已被清空）
                        const menuPos = contextMenu?.pos
                        hideContextMenu()
                        sub.action?.(menuPos)
                      }}
                    >
                      {sub.icon && <span className="mditor-menu-icon">{sub.icon}</span>}
                      <span className="mditor-menu-label">{sub.label}</span>
                      {sub.shortcut && <span className="mditor-menu-shortcut">{sub.shortcut}</span>}
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </div>
        ),
      )}
    </div>
  )
}

export default ContextMenu