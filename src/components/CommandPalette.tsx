import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore, THEMES } from '../stores/useAppStore'
import { useSettingsStore } from '../stores/settings'
import { fuzzySearchFiles } from '../utils/fuzzySearch'
import {
  insertToc,
  copyMarkdownSource,
  formatDocument,
  validateDocument,
} from '../plugins/docActions'
import { exportPdf, exportHtml } from '../services/export'

interface CommandItem {
  id: string
  title: string
  run: () => void | Promise<void>
}

function buildCommands(): CommandItem[] {
  const s = useAppStore.getState()
  const ed = s.editor
  const tab = s.tabs.find((t) => t.id === s.activeTabId)
  const toast = (msg: string) => s.showToast(msg)
  const runExport =
    (load: () => Promise<(e: typeof ed, p: string) => Promise<boolean>>, name: string) => async () => {
      if (!tab) {
        toast('没有打开的文件')
        return
      }
      const fn = await load()
      toast((await fn(ed, tab.path)) ? `已导出 ${name}` : `导出 ${name} 失败`)
    }
  const themeCommands = THEMES.map((t) => ({
    id: `theme-${t.id}`,
    title: `切换主题：${t.name} ${t.icon}`,
    run: () => s.setTheme(t.id),
  }))
  return [
    ...themeCommands,
    { id: 'focus', title: '切换专注模式', run: () => s.toggleFocusMode() },
    {
      id: 'copymd',
      title: '复制 Markdown 源码',
      run: async () => toast((await copyMarkdownSource()) ? '已复制 Markdown 源码' : '复制失败'),
    },
    // 编辑类命令依赖 Milkdown 编辑器实例；源码模式下 editor 为 null，
    // 执行只会得到「导出失败/无需整理」等误导性反馈，直接从列表隐去
    ...(ed
      ? [
          { id: 'toc', title: '插入目录', run: () => toast(insertToc(ed) ? '已插入目录' : '没有可生成的标题') },
          { id: 'format', title: '整理文档格式', run: () => toast(formatDocument(ed) ? '已整理文档格式' : '无需整理') },
          {
            id: 'validate',
            title: '校验链接 / 图片路径',
            run: async () => {
              const broken = await validateDocument(ed)
              s.openValidation(broken)
            },
          },
          { id: 'export-pdf', title: '导出 PDF', run: runExport(async () => exportPdf, 'PDF') },
          { id: 'export-docx', title: '导出 Word', run: runExport(() => import('../services/exportDocx').then((m) => m.exportDocx), 'Word') },
          { id: 'export-html', title: '导出 HTML', run: runExport(async () => exportHtml, 'HTML') },
        ]
      : []),
    { id: 'search', title: '全局搜索', run: () => s.openSearch() },
    { id: 'save', title: '保存当前文件', run: () => s.saveCurrentFile() },
    { id: 'settings', title: '打开设置', run: () => useSettingsStore.getState().openSettings() },
    { id: 'settings-shortcuts', title: '快捷键设置', run: () => useSettingsStore.getState().openSettings('shortcuts') },
  ]
}

export const CommandPalette = () => {
  const open = useAppStore((s) => s.paletteOpen)
  const mode = useAppStore((s) => s.paletteMode)
  const close = useAppStore((s) => s.closePalette)
  const openFile = useAppStore((s) => s.openFile)
  const recentFiles = useAppStore((s) => s.recentFiles)
  const rootPath = useAppStore((s) => s.rootPath)
  const fileTree = useAppStore((s) => s.fileTree)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open, mode])

  const files = useMemo(() => {
    if (mode !== 'files') return []
    return fuzzySearchFiles(query, rootPath, fileTree, recentFiles)
  }, [query, mode, rootPath, fileTree, recentFiles])

  const filteredCmds = useMemo(() => {
    if (mode !== 'commands') return []
    const q = query.trim().toLowerCase()
    return buildCommands().filter((c) => c.title.toLowerCase().includes(q))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode])

  const listLength = mode === 'files' ? files.length : filteredCmds.length

  /** 高亮匹配字符 */
  const highlightMatches = (text: string, matches: number[]) => {
    if (matches.length === 0) return <>{text}</>
    const parts: React.ReactNode[] = []
    let lastIdx = 0
    for (const idx of matches) {
      if (idx > lastIdx) parts.push(<span key={`t${lastIdx}`}>{text.slice(lastIdx, idx)}</span>)
      parts.push(<span key={`m${idx}`} style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{text[idx]}</span>)
      lastIdx = idx + 1
    }
    if (lastIdx < text.length) parts.push(<span key={`e${lastIdx}`}>{text.slice(lastIdx)}</span>)
    return <>{parts}</>
  }

  const execute = (i: number) => {
    if (mode === 'files') {
      const item = files?.[i]
      if (!item) return
      close()
      openFile(item.path)
    } else {
      const c = filteredCmds[i]
      if (!c) return
      close()
      Promise.resolve(c.run()).catch((e) => {
        // 命令失败不能静默：导出 PDF/Word 等失败时用户会误以为成功
        useAppStore.getState().showToast(`命令执行失败：${e instanceof Error ? e.message : String(e)}`)
      })
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[12vh]"
      onMouseDown={close}
    >
      <div
        className="mditor-palette w-[560px] max-w-[92vw] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
          <span className="text-xs text-[var(--color-text-dim)]">
            {mode === 'files' ? 'Ctrl+P · 快速打开文件' : 'Ctrl+K · 命令'}
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(i + 1, Math.max(listLength - 1, 0)))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                execute(index)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
            placeholder={mode === 'files' ? '搜索文件名…' : '搜索命令…'}
            className="flex-1 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]"
          />
        </div>
        <div className="max-h-[50vh] overflow-auto py-1">
          {mode === 'files' ? (
            files.length === 0 ? (
              <div className="px-3 py-2 text-sm text-[var(--color-text-dim)]">
                {query.trim() ? '未找到匹配文件' : '输入以搜索文件…'}
              </div>
            ) : (
              files.map((f, i) => (
                <button
                  key={f.path}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => execute(i)}
                  className={`mditor-palette-item flex w-full flex-col items-start px-3 py-1.5 text-left text-sm ${
                    i === index ? 'mditor-palette-item-active' : ''
                  }`}
                >
                  <span className="text-[var(--color-text)]">
                    {highlightMatches(f.name, f.matches)}
                  </span>
                  <span className="truncate text-xs text-[var(--color-text-dim)]">{f.path}</span>
                </button>
              ))
            )
          ) : filteredCmds.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[var(--color-text-dim)]">未找到命令</div>
          ) : (
            filteredCmds.map((c, i) => (
              <button
                key={c.id}
                onMouseEnter={() => setIndex(i)}
                onClick={() => execute(i)}
                className={`mditor-palette-item w-full px-3 py-1.5 text-left text-sm ${
                  i === index ? 'mditor-palette-item-active' : ''
                }`}
              >
                {c.title}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
