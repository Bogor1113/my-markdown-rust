import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../stores/useAppStore'
import { replaceFiles, readFile } from '../../services/fs'
import type { SearchResult } from '../../types'

function HighlightMatch({ text, start, end }: { text: string; start: number; end: number }) {
  const before = text.slice(0, start)
  const match = text.slice(start, end)
  const after = text.slice(end)
  return (
    <span>
      {before}
      <mark className="search-match-highlight">{match}</mark>
      {after}
    </span>
  )
}

export default function SearchPanel() {
  const {
    searchOpen,
    searchQuery,
    searchResults,
    searchSearching,
    closeSearch,
    setSearchQuery,
    runSearch,
    openFile,
    rootPath,
  } = useAppStore()

  const inputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [showReplace, setShowReplace] = useState(false)
  const [replaceQuery, setReplaceQuery] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [replaceResult, setReplaceResult] = useState<string | null>(null)

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [searchOpen])

  // 打开时重置状态
  useEffect(() => {
    if (searchOpen) {
      setReplaceQuery('')
      setReplaceResult(null)
      setShowReplace(false)
    }
  }, [searchOpen])

  // 卸载时清理 debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [debounceTimer])

  const handleInputChange = useCallback(
    (value: string) => {
      setSearchQuery(value)
      if (debounceTimer) clearTimeout(debounceTimer)
      const timer = setTimeout(() => {
        if (value.trim()) runSearch(value)
        else {
          useAppStore.setState({ searchResults: [] })
        }
      }, 300)
      setDebounceTimer(timer)
    },
    [setSearchQuery, runSearch, debounceTimer],
  )

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      openFile(result.path)
      closeSearch()
    },
    [openFile, closeSearch],
  )

  // 全部替换
  const handleReplaceAll = useCallback(async () => {
    if (!rootPath || !searchQuery.trim() || !replaceQuery) return
    setReplacing(true)
    setReplaceResult(null)
    try {
      // 批量替换直接改写磁盘：必须先把已打开的脏标签保存落盘。
      // 否则替换后用户一次 Ctrl+S 就会把不含替换结果的旧内存内容写回磁盘，
      // 替换被静默回滚，且用户可能在旧内容上继续编辑造成内容分叉。
      const store = useAppStore.getState()
      for (const t of store.tabs.filter((x) => x.isDirty)) {
        try {
          await store.saveTab(t.id)
        } catch (e) {
          setReplaceResult(`替换已中止：「${t.name}」保存失败（${e}），请先处理该文件的未保存修改`)
          return
        }
      }

      const results = await replaceFiles(rootPath, searchQuery.trim(), replaceQuery)
      const totalReplaced = results.reduce((sum, r) => sum + r.count, 0)
      if (totalReplaced > 0) {
        // 已打开且被替换的标签从磁盘重载，保证编辑器内容与磁盘一致
        const replacedPaths = new Set(results.map((r) => r.path))
        const st = useAppStore.getState()
        const openHits = st.tabs.filter((t) => replacedPaths.has(t.path))
        const updates: { id: string; content: string }[] = []
        for (const t of openHits) {
          try {
            updates.push({ id: t.id, content: await readFile(t.path) })
          } catch {
            /* 文件可能刚被外部删除：跳过 */
          }
        }
        let touchActive = false
        const activeId = st.activeTabId
        if (updates.some((u) => u.id === activeId)) touchActive = true
        if (updates.length > 0) {
          useAppStore.setState((s2) => ({
            tabs: s2.tabs.map((t) => {
              const u = updates.find((x) => x.id === t.id)
              return u ? { ...t, content: u.content, savedContent: u.content, isDirty: false } : t
            }),
            externalReload: touchActive ? s2.externalReload + 1 : s2.externalReload,
          }))
        }
        setReplaceResult(
          `已在 ${results.length} 个文件中替换 ${totalReplaced} 处` +
            (updates.length > 0 ? `，已同步 ${updates.length} 个打开的标签` : ''),
        )
        // 刷新搜索结果
        if (searchQuery.trim()) runSearch(searchQuery)
      } else {
        setReplaceResult('没有找到匹配内容')
      }
    } catch (e) {
      setReplaceResult(`替换失败：${e}`)
    } finally {
      setReplacing(false)
    }
  }, [rootPath, searchQuery, replaceQuery, runSearch])

  // Ctrl+Shift+H 切换替换模式
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchOpen) {
        closeSearch()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h' && searchOpen) {
        e.preventDefault()
        setShowReplace((v) => !v)
        setTimeout(() => replaceInputRef.current?.focus(), 50)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchOpen, closeSearch])

  if (!searchOpen) return null

  return (
    <div className="search-panel-overlay" onClick={closeSearch}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="search-panel-header">
          <span className="search-panel-title">全局搜索{showReplace ? ' / 替换' : ''}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="search-panel-close"
              onClick={() => {
                setShowReplace((v) => !v)
                setTimeout(() => replaceInputRef.current?.focus(), 50)
              }}
              title={showReplace ? '隐藏替换 (Ctrl+Shift+H)' : '显示替换 (Ctrl+Shift+H)'}
              style={{ fontSize: 12 }}
            >
              {showReplace ? '收起替换' : '替换'}
            </button>
            <button className="search-panel-close" onClick={closeSearch} title="关闭 (Esc)">
              ✕
            </button>
          </div>
        </div>

        <div className="search-panel-input-wrap">
          <input
            ref={inputRef}
            className="search-panel-input"
            type="text"
            placeholder="搜索文件内容…"
            value={searchQuery}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                runSearch(searchQuery.trim())
              }
            }}
          />
          {searchSearching && <span className="search-panel-spinner" />}
        </div>

        {showReplace && (
          <div className="search-panel-replace-wrap">
            <input
              ref={replaceInputRef}
              className="search-panel-replace-input"
              type="text"
              placeholder="替换为…"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  handleReplaceAll()
                }
              }}
            />
            <div className="search-panel-replace-btns">
              <button
                className="search-panel-replace-btn primary"
                onClick={handleReplaceAll}
                disabled={replacing || !searchQuery.trim()}
                title="替换所有匹配项"
              >
                {replacing ? '替换中...' : '全部替换'}
              </button>
            </div>
          </div>
        )}

        {replaceResult && (
          <div className="search-panel-info" style={{ color: 'var(--color-accent)' }}>
            {replaceResult}
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="search-panel-info">
            找到 {searchResults.length} 个结果
          </div>
        )}

        <div className="search-panel-results">
          {searchResults.length === 0 && searchQuery && !searchSearching && (
            <div className="search-panel-empty">未找到匹配内容</div>
          )}
          {searchResults.map((result, idx) => (
            <div
              key={`${result.path}:${result.line}:${idx}`}
              className="search-panel-result"
              onClick={() => handleResultClick(result)}
            >
              <div className="search-panel-result-header">
                <span className="search-panel-result-file">{result.name}</span>
                <span className="search-panel-result-line">行 {result.line}</span>
              </div>
              <div className="search-panel-result-content">
                <HighlightMatch
                  text={result.content}
                  start={result.matchStart}
                  end={result.matchEnd}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
