import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import { callCommand } from '@milkdown/kit/utils'
import type { $Command } from '@milkdown/kit/utils'
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  toggleLinkCommand,
  insertHrCommand,
} from '@milkdown/kit/preset/commonmark'
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/kit/preset/gfm'
import { editorViewCtx } from '@milkdown/kit/core'
import { useAppStore, THEMES, themeLabel } from '../../stores/useAppStore'
import { useSettingsStore } from '../../stores/settings'
import { insertToc, copyMarkdownSource, formatDocument, validateDocument } from '../../plugins/docActions'
import FrontmatterEditor from '../FrontmatterEditor/FrontmatterEditor'
import { insertCodeBlock } from '../../utils/editor'
import { createFile } from '../../services/fs'
import { getDailyNoteFileName, getDailyNoteContent } from '../../lib/templates'
import { checkMdAssociation, setMdAssociation } from '../../services/association'
import type { AssociationStatus } from '../../services/association'
import { isMarkdown, joinPath } from '../../utils/files'
import { exportPdf, exportHtml } from '../../services/export'
import { optimizeTypography } from '../../plugins/typography'
import { useSnippetStore } from '../../stores/snippets'

const Toolbar = () => {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const saveCurrentFile = useAppStore((s) => s.saveCurrentFile)
  const showToast = useAppStore((s) => s.showToast)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const tabs = useAppStore((s) => s.tabs)
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isMdTab = !!activeTab && isMarkdown(activeTab.path)

  // 文件关联状态（启动时后端已自动设置，这里只做展示与手动重设）
  const [assocStatus, setAssocStatus] = useState<AssociationStatus | null>(null)

  // PDF 导出进行中（禁用按钮，避免重复导出）
  const [pdfBusy, setPdfBusy] = useState(false)

  // Word 导出进行中（禁用按钮，避免重复导出）
  const [wordBusy, setWordBusy] = useState(false)

  // HTML 导出进行中（禁用按钮，避免重复导出）
  const [htmlBusy, setHtmlBusy] = useState(false)

  // 导出下拉菜单开关
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportTriggerRef = useRef<HTMLDivElement>(null)
  const exportDropdownRef = useRef<HTMLDivElement>(null)
  const [exportPos, setExportPos] = useState<{ x: number; y: number } | null>(null)

  // 主题下拉菜单开关
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const themeTriggerRef = useRef<HTMLDivElement>(null)
  const themeDropdownRef = useRef<HTMLDivElement>(null)
  const [themePos, setThemePos] = useState<{ x: number; y: number } | null>(null)

  // Front Matter GUI 编辑器开关
  const [frontmatterOpen, setFrontmatterOpen] = useState(false)

  // 启动时后端异步写入关联，先查一次，稍后再查一次确保状态准确
  useEffect(() => {
    let cancelled = false
    const check = () =>
      checkMdAssociation()
        .then((s) => {
          if (!cancelled) setAssocStatus(s)
        })
        .catch(() => {
          if (!cancelled) setAssocStatus(null)
        })
    check()
    const timer = setTimeout(check, 2000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  /** 执行 Milkdown 命令 */
  const runCmd = useCallback(<T,>(command: $Command<T>, payload?: T) => {
    const { editor } = useAppStore.getState()
    editor?.action(callCommand(command.key, payload))
  }, [])

  // 计算下拉菜单位置：右对齐按钮右缘，并限制在视口内（fixed 定位，避免被滚动容器裁剪）
  const calcMenuPos = (ref: React.RefObject<HTMLDivElement | null>, menuW: number) => {
    const el = ref.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const x = Math.max(8, Math.min(r.right - menuW, window.innerWidth - menuW - 8))
    const y = r.bottom + 4
    return { x, y }
  }

  // 切换导出菜单：先算位置再打开，避免菜单破坏布局后 rect 偏移
  const toggleExportMenu = () => {
    if (!exportMenuOpen) setExportPos(calcMenuPos(exportTriggerRef, 176))
    setExportMenuOpen(!exportMenuOpen)
  }

  // 切换主题菜单
  const toggleThemeMenu = () => {
    if (!themeMenuOpen) setThemePos(calcMenuPos(themeTriggerRef, 176))
    setThemeMenuOpen(!themeMenuOpen)
  }

  // 点击导出菜单外部 / 窗口缩放时关闭
  useEffect(() => {
    if (!exportMenuOpen) return
    const onDown = (e: MouseEvent) => {
      // 触发按钮点击（mousedown）不能算「外部」：否则 mousedown 先关菜单、
      // 随后的 click 又 toggle 重新打开，按钮永远无法收起菜单
      if (exportTriggerRef.current?.contains(e.target as Node)) return
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    const onResize = () => setExportMenuOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onResize)
    }
  }, [exportMenuOpen])

  // 点击主题菜单外部 / 窗口缩放时关闭
  useEffect(() => {
    if (!themeMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (themeTriggerRef.current?.contains(e.target as Node)) return
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false)
      }
    }
    const onResize = () => setThemeMenuOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onResize)
    }
  }, [themeMenuOpen])

  /** 按格式导出（PDF / Word / HTML），统一处理进行中状态与提示 */
  const doExport = (kind: 'pdf' | 'word' | 'html') => {
    const { editor } = useAppStore.getState()
    const path = activeTab?.path
    if (!editor || !path) return
    const run = (
      fn: () => Promise<boolean>,
      setBusy: (b: boolean) => void,
      busy: boolean,
      okMsg: string,
    ) => {
      if (busy) return
      setBusy(true)
      fn()
        .then((done) => {
          if (done) showToast(okMsg)
        })
        .catch((e) => showToast(`导出失败：${e}`))
        .finally(() => setBusy(false))
    }
    if (kind === 'pdf') run(() => exportPdf(editor, path), setPdfBusy, pdfBusy, 'PDF 已导出')
    else if (kind === 'word') {
      run(async () => (await import('../../services/exportDocx')).exportDocx(editor, path), setWordBusy, wordBusy, 'Word 已导出')
    } else if (kind === 'html') run(() => exportHtml(editor, path), setHtmlBusy, htmlBusy, 'HTML 已导出')
  }

  const exportItem = (label: string, onClick: () => void) => (
    <button
      className="block w-full rounded px-3 py-1.5 text-left text-[13px] text-[var(--color-text)] transition-colors hover:bg-white/10"
      onClick={() => {
        setExportMenuOpen(false)
        onClick()
      }}
    >
      {label}
    </button>
  )

  const handleInsertCodeBlock = () => {
    const { editor } = useAppStore.getState()
    if (editor) insertCodeBlock(editor)
  }

  const handleAssociate = async () => {
    try {
      const status = await setMdAssociation()
      setAssocStatus(status)
      showToast(status.associated ? '已关联 .md / .markdown 文件到 MyMdEdit' : status.message)
    } catch (e) {
      setAssocStatus(null)
      showToast(`设置文件关联失败：${e}`)
    }
  }

  const handleDailyNote = async () => {
    const root = useAppStore.getState().rootPath
    if (!root) {
      showToast('请先打开文件夹')
      return
    }
    const fileName = getDailyNoteFileName()
    const target = joinPath(root, fileName)
    try {
      await createFile(target, getDailyNoteContent())
      showToast(`已创建每日笔记 ${fileName}`)
      await useAppStore.getState().loadDirectory(root)
      await useAppStore.getState().openFile(target)
    } catch (e) {
      if (String(e).includes('already exists')) {
        // 文件已存在 → 直接打开
        await useAppStore.getState().openFile(target)
      } else {
        showToast(`创建每日笔记失败：${e}`)
      }
    }
  }

  const promptLink = () => {
    useAppStore.getState().openPrompt({
      title: '插入链接',
      fields: [{ id: 'href', label: '链接地址', placeholder: '粘贴网址，如 example.com', defaultValue: '' }],
      confirmLabel: '插入',
      onConfirm: (values) => {
        const raw = values.href?.trim()
        if (!raw) return
        const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
          raw.startsWith('//') ||
          raw.startsWith('#') ||
          raw.startsWith('/') ||
          raw.startsWith('.')
          ? raw
          : `https://${raw}`
        runCmd(toggleLinkCommand, { href, title: '' })
      },
    })
  }

  const promptTable = () => {
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
        runCmd(insertTableCommand, { row: parseInt(values.row, 10), col: parseInt(values.col, 10) })
      },
    })
  }

  const assocDot =
    assocStatus === null
      ? 'bg-[var(--color-text-dim)]'
      : assocStatus.associated
        ? 'bg-[#2f9e44]'
        : 'bg-[#f59f00]'
  const assocTitle =
    assocStatus === null
      ? '文件关联状态未知'
      : assocStatus.associated
        ? '已关联：.md / .markdown 默认用 MyMdEdit 打开'
        : `未关联（当前：${assocStatus.message}），点击设置`

  const fmtBtn = (title: string, label: string, onClick: () => void, style?: CSSProperties) => (
    <button
      className="flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[12px] text-[var(--color-text-secondary)] transition-all hover:bg-white/10 hover:text-[var(--color-text)] active:scale-95"
      title={title}
      onClick={onClick}
      style={style}
    >
      {label}
    </button>
  )

  return (
    <>
    <div className="mditor-toolbar flex flex-1 items-center gap-1 px-2 py-1 select-none min-w-0 overflow-x-auto">
      <button
        className={`flex h-7 items-center justify-center rounded-md px-2 py-1 text-[14px] transition-colors ${
          activeTab?.isDirty
            ? 'text-[var(--color-text)] hover:bg-white/10'
            : 'text-[var(--color-text-dim)]'
        }`}
        onClick={saveCurrentFile}
        disabled={!activeTab?.isDirty}
        title={activeTab?.isDirty ? '保存 (Ctrl+S)' : '无未保存更改'}
      >
        <span>💾</span>
      </button>
      <button
        className="flex h-7 items-center justify-center gap-1 rounded-md px-2 py-1 text-[14px] text-[var(--color-text)] transition-colors hover:bg-white/10"
        onClick={handleAssociate}
        title={assocTitle}
      >
        <span>🔗</span>
        <span
          className={`h-2 w-2 rounded-full ${assocDot} transition-colors`}
          aria-hidden
        />
      </button>
      <button
        className="flex h-7 items-center justify-center gap-1 rounded-md px-2 py-1 text-[14px] text-[var(--color-text)] transition-colors hover:bg-white/10"
        onClick={handleDailyNote}
        title="新建每日笔记"
      >
        <span>📅</span>
      </button>

      {/* Markdown 格式化 */}
        {isMdTab && (
        <div className="ml-1 flex items-center gap-0.5 border-l border-[var(--color-border)] pl-1.5 overflow-hidden shrink-0">
          {fmtBtn('粗体 (Ctrl+B)', 'B', () => runCmd(toggleStrongCommand), { fontWeight: 700 })}
          {fmtBtn('斜体 (Ctrl+I)', 'I', () => runCmd(toggleEmphasisCommand), { fontStyle: 'italic' })}
          {fmtBtn('删除线', 'S', () => runCmd(toggleStrikethroughCommand), {
            textDecoration: 'line-through',
          })}
          <span className="mditor-tb-sep" />
          {fmtBtn('一级标题', 'H1', () => runCmd(wrapInHeadingCommand, 1))}
          {fmtBtn('二级标题', 'H2', () => runCmd(wrapInHeadingCommand, 2))}
          {fmtBtn('三级标题', 'H3', () => runCmd(wrapInHeadingCommand, 3))}
          <span className="mditor-tb-sep" />
          {fmtBtn('无序列表', '•', () => runCmd(wrapInBulletListCommand))}
          {fmtBtn('有序列表', '1.', () => runCmd(wrapInOrderedListCommand))}
          {fmtBtn('任务列表', '☑', () => {
            const { editor } = useAppStore.getState()
            if (!editor) return
            editor.action((ctx) => {
              const view = ctx.get(editorViewCtx)
              if (!view) return false
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
          })}
          {fmtBtn('引用', '❝', () => runCmd(wrapInBlockquoteCommand))}
          {fmtBtn('行内代码', '<>', () => runCmd(toggleInlineCodeCommand), {
            fontFamily: 'monospace',
          })}
          {fmtBtn('代码块', '```', handleInsertCodeBlock, {
            fontFamily: 'monospace',
          })}
          {fmtBtn('链接', '🔗', promptLink)}
          {fmtBtn('表格', '▦', promptTable)}
          {fmtBtn('分割线', '─', () => runCmd(insertHrCommand))}
          {fmtBtn('中文排版优化（补空格/全角标点）', '排', () => {
            const { editor } = useAppStore.getState()
            const ok = optimizeTypography(editor)
            showToast(ok ? '已优化中文排版' : '无需优化')
          })}
          {fmtBtn('片段库', '❖', () => useSnippetStore.getState().openModal())}
          <span className="mditor-tb-sep" />
          {fmtBtn('插入目录', '📑', () => {
            const { editor } = useAppStore.getState()
            const ok = insertToc(editor)
            showToast(ok ? '已插入目录' : '没有可生成的标题')
          })}
          {fmtBtn('复制 Markdown 源码', '📋', async () => {
            const ok = await copyMarkdownSource()
            showToast(ok ? '已复制 Markdown 源码' : '复制失败')
          })}
          {fmtBtn('整理文档格式', '✨', () => {
            const { editor } = useAppStore.getState()
            const changed = formatDocument(editor)
            showToast(changed ? '已整理文档格式' : '无需整理')
          })}
          {fmtBtn('编辑 Front Matter', '📋', () => setFrontmatterOpen(true))}
          <span className="mditor-tb-sep" />
          {fmtBtn('校验链接/图片', '✓', async () => {
            const { editor } = useAppStore.getState()
            const broken = await validateDocument(editor)
            useAppStore.getState().openValidation(broken)
          })}
        </div>
      )}

      <div className="flex-1" data-tauri-drag-region />

      <div className="flex items-center gap-1 mr-2">
        {fmtBtn('全局搜索 (Ctrl+Shift+F)', '🔍', () => {
          useAppStore.getState().openSearch()
        })}
      </div>

      {activeTab && isMdTab && (
        <div className="flex items-center gap-1 mr-2">
          {/* 导出下拉：PDF / Word / HTML 合并为一个按钮 */}
          <div className="relative" ref={exportTriggerRef}>
            <button
              className="flex h-7 items-center gap-1 rounded-md px-2 py-1 text-[14px] text-[var(--color-text)] transition-colors hover:bg-white/10"
              onClick={toggleExportMenu}
              title="导出"
            >
              <span>📥</span>
            </button>
            {exportMenuOpen && exportPos && createPortal(
              <div
                ref={exportDropdownRef}
                className="mditor-glass-menu fixed z-[999] w-44 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-toolbar)] py-1 shadow-lg"
                style={{ left: exportPos.x, top: exportPos.y }}
              >
                {exportItem(pdfBusy ? '正在导出 PDF…' : '导出 PDF', () => doExport('pdf'))}
                {exportItem(wordBusy ? '正在导出 Word…' : '导出 Word', () => doExport('word'))}
                {exportItem(htmlBusy ? '正在导出 HTML…' : '导出 HTML', () => doExport('html'))}
              </div>,
              document.body,
            )}
          </div>
        </div>
      )}

      <button
        className="flex h-7 items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] text-[var(--color-text)] transition-colors hover:bg-white/10"
        onClick={() => useSettingsStore.getState().openSettings()}
        title="设置"
      >
        <span>⚙️</span>
      </button>

      <div className="relative" ref={themeTriggerRef}>
        <button
          className="flex h-7 items-center justify-center rounded-md px-2 py-1 text-[14px] text-[var(--color-text)] transition-colors hover:bg-white/10"
          onClick={toggleThemeMenu}
          title={`主题：${themeLabel(theme)}`}
        >
          <span>{THEMES.find((x) => x.id === theme)?.icon ?? '🎨'}</span>
        </button>
        {themeMenuOpen && themePos && createPortal(
          <div
            ref={themeDropdownRef}
            className="mditor-glass-menu fixed z-[999] w-44 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-toolbar)] py-1 shadow-2xl"
            style={{ left: themePos.x, top: themePos.y }}
          >
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-white/10 ${
                  t.id === theme ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'
                }`}
                onClick={() => {
                  setTheme(t.id)
                  setThemeMenuOpen(false)
                }}
              >
                <span>{t.icon}</span>
                <span className="flex-1">{t.name}</span>
                <span className="text-xs text-[var(--color-text-dim)]">{t.kind === 'light' ? '亮' : '暗'}</span>
                {t.id === theme && <span>✓</span>}
              </button>
            ))}
          </div>,
          document.body,
        )}
      </div>

      </div>
      <FrontmatterEditor open={frontmatterOpen} onClose={() => setFrontmatterOpen(false)} />
    </>
  )
}

export default Toolbar
