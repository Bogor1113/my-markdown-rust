/// Typora 快捷键（Windows / Linux 键位）
///
/// 全部按 Typora 官方 Shortcut Keys 页面的「Paragraph / Format」两栏对齐：
///
/// | 功能 | 按键 |
/// |---|---|
/// | 一级~六级标题 | Ctrl+1 ~ Ctrl+6 |
/// | 正文段落 | Ctrl+0 |
/// | 提升 / 降低标题级别 | Ctrl+= / Ctrl+- |
/// | 代码块 | Ctrl+Shift+K |
/// | 公式块 | Ctrl+Shift+M |
/// | 引用 | Ctrl+Shift+Q |
/// | 有序 / 无序列表 | Ctrl+Shift+[ / Ctrl+Shift+] |
/// | 表格 | Ctrl+T |
/// | 行内代码 | Ctrl+Shift+` |
/// | 删除线 | Alt+Shift+5 |
/// | 清除格式 | Ctrl+\ |
///
/// 已有的 Milkdown 默认键位（Ctrl+B 粗体、Ctrl+I 斜体、Ctrl+Alt+1..6 标题、
/// Ctrl+Alt+7/8 列表）全部保留，Typora 键位是**并列新增**而不是覆盖，
/// 这样两边肌肉记忆都能用。

import type { Ctx } from '@milkdown/kit/ctx'
import { $useKeymap } from '@milkdown/kit/utils'
import { commandsCtx, editorViewCtx, schemaCtx } from '@milkdown/kit/core'
import { setBlockType, splitBlock } from '@milkdown/kit/prose/commands'
import type { Command } from '@milkdown/kit/prose/state'
import {
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  createCodeBlockCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
} from '@milkdown/kit/preset/commonmark'
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/kit/preset/gfm'
import { toggleUnderlineCommand } from './underline'
import { useAppStore } from '../stores/useAppStore'

/**
 * 把 Milkdown 命令包装成 keymap 需要的 `command(ctx) => Command`。
 *
 * 参数类型写成 unknown 是有意的：`$command()` 的导出在 TS 里被声明成 CmdKey，
 * 但运行时是「带 .key 的插件对象」，两边对不上。取 .key 才是 commandsCtx
 * 真正认识的键（上游 preset 内部也是这么用的）。
 */
const call =
  (command: unknown, payload?: unknown) =>
  (ctx: Ctx): Command => {
    const commands = ctx.get(commandsCtx)
    const key = (command as { key: unknown }).key
    // keymap 只关心「有没有消费这次按键」，忽略传入的 state/dispatch
    return (() => commands.call(key as never, payload as never)) as unknown as Command
  }

/**
 * 标题级别升降（Ctrl+= / Ctrl+-）。
 *
 * 与上游 `downgradeHeadingCommand` 的差别：那条命令只在「光标在行首且选区为空」
 * 时生效（它是给 Backspace 用的）；Typora 的升/降级在任意位置都能用。
 */
const changeHeadingLevel = (delta: number) => (ctx: Ctx): Command => (state, dispatch) => {
  const schema = ctx.get(schemaCtx)
  const { $from } = state.selection
  const node = $from.parent
  if (node.type === schema.nodes.heading) {
    const next = Number(node.attrs.level) + delta
    if (next < 1) return setBlockType(schema.nodes.paragraph)(state, dispatch)
    if (next > 6) return false
    dispatch?.(
      state.tr.setNodeMarkup($from.before(), undefined, { ...node.attrs, level: next }),
    )
    return true
  }
  // 普通段落上按 Ctrl+= → 变成一级标题（Typora 同款）
  if (delta > 0) return setBlockType(schema.nodes.heading, { level: 1 })(state, dispatch)
  return false
}

/** 公式块（Ctrl+Shift+M）：把当前文本块换成 math_block */
const toMathBlock = (ctx: Ctx): Command => (state, dispatch) => {
  const schema = ctx.get(schemaCtx)
  const type = schema.nodes.math_block
  if (!type) return false
  return setBlockType(type)(state, dispatch)
}

/**
 * 插入表格（Ctrl+T）：3×3。
 *
 * 不能直接调用 insertTableCommand：它用 `replaceSelectionWith` 插入块级表格，
 * 当光标停在**有文字**的段落里时这次替换是不合法的，命令会静默失败。
 * Typora 的行为是在光标处把段落切开再插表，这里先 splitBlock 腾出空段落。
 */
const insertTable = (ctx: Ctx): Command => (state, dispatch, view) => {
  const run = call(insertTableCommand, { row: 3, col: 3 })(ctx)
  const { $from } = state.selection
  if ($from.parent.isTextblock && $from.parent.content.size > 0 && view) {
    if (!splitBlock(state, dispatch, view)) return false
    return run(view.state, view.dispatch, view)
  }
  return run(state, dispatch, view)
}

/**
 * 清除格式（Ctrl+\）：去掉选区内所有行内 mark。
 * Typora 的「Clear Format」只清行内样式，不动块级结构，这里保持一致。
 */
const clearFormat = (): Command => (state, dispatch) => {
  const { from, to, empty } = state.selection
  if (empty) return false
  dispatch?.(state.tr.removeMark(from, to))
  return true
}

/**
 * 插入链接（Ctrl+K）：先弹地址输入框，再套用 toggleLinkCommand。
 * 与工具栏「链接」按钮走同一条链路，避免两处行为不一致。
 */
const promptLink = (_ctx: Ctx): Command => (state) => {
  const { from, to, empty } = state.selection
  const selected = empty ? '' : state.doc.textBetween(from, to)
  useAppStore.getState().openPrompt({
    title: '插入链接',
    fields: [
      { id: 'href', label: '链接地址', placeholder: '粘贴网址，如 example.com', defaultValue: '' },
    ],
    confirmLabel: '插入',
    onConfirm: (values: Record<string, string>) => {
      const raw = values.href?.trim()
      if (!raw) return
      const href =
        /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
        raw.startsWith('//') ||
        raw.startsWith('#') ||
        raw.startsWith('/') ||
        raw.startsWith('.')
          ? raw
          : `https://${raw}`
      // 有选中文字时用选中的文字当链接文字，否则插入空链接文本（Typora 行为）
      const editor = useAppStore.getState().editor
      editor?.action((c: Ctx) => {
        const commands = c.get(commandsCtx)
        if (selected) {
          const v = c.get(editorViewCtx)
          const tr = v.state.tr
          tr.addMark(from, to, v.state.schema.marks.link.create({ href, title: '' }))
          v.dispatch(tr)
        } else {
          commands.call(toggleLinkCommand.key, { href, title: '' })
        }
      })
    },
  })
  return true
}

export const typoraKeymap = $useKeymap('typoraKeymap', {
  H1: { shortcuts: 'Mod-1', command: call(wrapInHeadingCommand, 1) },
  H2: { shortcuts: 'Mod-2', command: call(wrapInHeadingCommand, 2) },
  H3: { shortcuts: 'Mod-3', command: call(wrapInHeadingCommand, 3) },
  H4: { shortcuts: 'Mod-4', command: call(wrapInHeadingCommand, 4) },
  H5: { shortcuts: 'Mod-5', command: call(wrapInHeadingCommand, 5) },
  H6: { shortcuts: 'Mod-6', command: call(wrapInHeadingCommand, 6) },
  Paragraph: { shortcuts: 'Mod-0', command: call(turnIntoTextCommand) },
  HeadingUp: { shortcuts: 'Mod-=', command: changeHeadingLevel(1) },
  HeadingDown: { shortcuts: 'Mod--', command: changeHeadingLevel(-1) },
  CodeFence: { shortcuts: 'Mod-Shift-k', command: call(createCodeBlockCommand) },
  MathBlock: { shortcuts: 'Mod-Shift-m', command: toMathBlock },
  Quote: { shortcuts: 'Mod-Shift-q', command: call(wrapInBlockquoteCommand) },
  BulletList: { shortcuts: 'Mod-Shift-]', command: call(wrapInBulletListCommand) },
  OrderedList: { shortcuts: 'Mod-Shift-[', command: call(wrapInOrderedListCommand) },
  Table: { shortcuts: 'Mod-t', command: insertTable },
  InlineCode: { shortcuts: 'Mod-Shift-`', command: call(toggleInlineCodeCommand) },
  Strike: { shortcuts: 'Alt-Shift-5', command: call(toggleStrikethroughCommand) },
  Underline: { shortcuts: 'Mod-u', command: call(toggleUnderlineCommand) },
  ClearFormat: { shortcuts: 'Mod-\\', command: clearFormat },
  Link: { shortcuts: 'Mod-k', command: promptLink },
})
