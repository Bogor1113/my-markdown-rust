import { useEffect, useRef, useState } from 'react'
import { editorViewCtx } from '@milkdown/kit/core'
import type { EditorView } from '@milkdown/kit/prose/view'
import {
  SearchQuery,
  setSearchState,
  getMatchHighlights,
  findNext,
  findPrev,
  replaceNext,
  replaceAll,
} from 'prosemirror-search'
import { useAppStore } from '../stores/useAppStore'

type SearchFlags = {
  caseSensitive: boolean
  regexp: boolean
  wholeWord: boolean
}

const FindReplace = () => {
  const findOpen = useAppStore((s) => s.findOpen)
  const closeFind = useAppStore((s) => s.closeFind)
  const activeTabId = useAppStore((s) => s.activeTabId)

  const [query, setQuery] = useState('')
  const [replace, setReplace] = useState('')
  const [info, setInfo] = useState('')
  const [flags, setFlags] = useState<SearchFlags>({
    caseSensitive: false,
    regexp: false,
    wholeWord: false,
  })
  const queryRef = useRef<HTMLInputElement>(null)
  /** 搜索派发防抖计时器：连续输入时合并，避免大文档每次按键都全量扫描 */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 最新替换文本：防抖回调可能晚于 replace 输入执行，需读取最新值 */
  const replaceRef = useRef(replace)
  replaceRef.current = replace
  /** 最新标志位：同样的理由，防抖回调需读取最新值 */
  const flagsRef = useRef(flags)
  flagsRef.current = flags

  // 切换标签（编辑器重载）时关闭查找栏
  useEffect(() => {
    closeFind()
  }, [activeTabId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 打开时聚焦输入框
  useEffect(() => {
    if (findOpen) queryRef.current?.focus()
  }, [findOpen])

  // 关闭时清空输入与编辑器的搜索状态（清除残留高亮；若只清编辑器、保留输入框文字，
  // 重新打开会显示旧文字却无高亮，且 Enter 因无待派发查询而失效）
  useEffect(() => {
    if (findOpen) return
    setQuery('')
    setReplace('')
    setFlags({ caseSensitive: false, regexp: false, wholeWord: false })
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    run((view) => {
      view.dispatch(setSearchState(view.state.tr, new SearchQuery({ search: '' })))
    })
  }, [findOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // 卸载时清理防抖计时器
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // 打开期间全局 Esc 关闭（焦点不在输入框时也可关闭）
  useEffect(() => {
    if (!findOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFind()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [findOpen, closeFind])

  const run = (fn: (view: EditorView) => void) => {
    const { editor } = useAppStore.getState()
    editor?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!view || view.isDestroyed) return false
      fn(view)
      return true
    })
  }

  const refreshInfo = (view: EditorView) => {
    const matches = getMatchHighlights(view.state)
      .find()
      .sort((a, b) => a.from - b.from)
    if (matches.length === 0) {
      setInfo(query.trim() ? '无匹配' : '')
      return
    }
    const from = view.state.selection.from
    // 当前匹配：包含光标的匹配；否则光标之后的第一个匹配；否则显示末尾位置
    let idx = matches.findIndex((m) => m.from <= from && from <= m.to)
    if (idx < 0) idx = matches.findIndex((m) => m.from >= from)
    setInfo(`${idx >= 0 ? idx + 1 : matches.length} / ${matches.length}`)
  }

  /** 按当前关键字/替换/标志位构造查询（正则模式需容错非法表达式） */
  const buildQuery = (q: string, r: string): SearchQuery | null => {
    const f = flagsRef.current
    try {
      // SearchQuery 构造函数对非法正则不抛异常，而是置 valid=false 并退化为
      // 永远查不到结果的 nullQuery——不显式检查的话用户只会看到"无匹配"，
      // 误以为内容里没有，而不知道是正则写错了
      const sq = new SearchQuery({
        search: q,
        replace: r,
        caseSensitive: f.caseSensitive,
        regexp: f.regexp,
        wholeWord: f.wholeWord,
      })
      if (!sq.valid) return null
      return sq
    } catch {
      return null
    }
  }

  /** 把查询真正派发到编辑器（防抖），供输入与 flush 共用 */
  const dispatchSearch = (q: string, r: string) => {
    const sq = buildQuery(q, r)
    if (!sq) {
      setInfo('正则无效')
      return
    }
    run((view) => {
      view.dispatch(setSearchState(view.state.tr, sq))
      refreshInfo(view)
    })
  }

  const applyQuery = (q: string) => {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      dispatchSearch(q, replaceRef.current)
    }, 120)
  }

  /** 立即应用尚未派发的查询（回车/上下切换前调用，保证用最新关键字搜索） */
  const flushSearch = () => {
    if (!debounceRef.current) return
    clearTimeout(debounceRef.current)
    debounceRef.current = null
    dispatchSearch(query, replace)
  }

  const applyReplace = (r: string) => {
    setReplace(r)
    dispatchSearch(query, r)
  }

  /** 切换标志位后，用当前关键字立即重搜 */
  const toggleFlag = (key: keyof SearchFlags) => {
    const next = { ...flags, [key]: !flags[key] }
    setFlags(next)
    flagsRef.current = next
    dispatchSearch(query, replace)
  }

  const doFindNext = () => { flushSearch(); run((view) => { findNext(view.state, view.dispatch); refreshInfo(view) }) }
  const doFindPrev = () => { flushSearch(); run((view) => { findPrev(view.state, view.dispatch); refreshInfo(view) }) }
  const doReplaceNext = () => {
    flushSearch()
    run((view) => { replaceNext(view.state, view.dispatch); refreshInfo(view) })
  }
  const doReplaceAll = () => {
    flushSearch()
    run((view) => { replaceAll(view.state, view.dispatch); refreshInfo(view) })
  }

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    cursor: 'pointer',
    userSelect: 'none',
    padding: '0 6px',
    borderRadius: 4,
    fontSize: 12,
    lineHeight: '22px',
    color: active ? '#fff' : 'var(--color-text-muted, #888)',
    background: active ? '#3b82f6' : 'transparent',
  })

  if (!findOpen) return null

  return (
    <div className="mditor-findbar">
      <input
        ref={queryRef}
        value={query}
        placeholder="查找"
        onChange={(e) => applyQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) doFindPrev()
            else doFindNext()
          } else if (e.key === 'Escape') {
            closeFind()
          }
        }}
      />
      <button onClick={doFindPrev} title="上一个 (Shift+Enter)">
        ↑
      </button>
      <button onClick={doFindNext} title="下一个 (Enter)">
        ↓
      </button>
      <span className="info">{info}</span>
      <input
        value={replace}
        placeholder="替换为"
        onChange={(e) => applyReplace(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            doReplaceNext()
          }
        }}
      />
      <button onClick={doReplaceNext} title="替换当前">
        替换
      </button>
      <button onClick={doReplaceAll} title="全部替换">
        全部
      </button>
      <span className="mditor-findbar-flags">
        <span
          title="区分大小写"
          style={toggleStyle(flags.caseSensitive)}
          onClick={() => toggleFlag('caseSensitive')}
        >
          Aa
        </span>
        <span
          title="正则表达式"
          style={toggleStyle(flags.regexp)}
          onClick={() => toggleFlag('regexp')}
        >
          .*
        </span>
        <span
          title="全词匹配"
          style={toggleStyle(flags.wholeWord)}
          onClick={() => toggleFlag('wholeWord')}
        >
          Ab
        </span>
      </span>
      <button onClick={closeFind} title="关闭 (Esc)">
        ×
      </button>
    </div>
  )
}

export default FindReplace
