import { useEffect, useRef, useState, Fragment } from 'react'
import { editorViewCtx } from '@milkdown/kit/core'
import { useAppStore } from '../../stores/useAppStore'

/**
 * 代码块语言选择器：点击语言徽章后弹出的下拉列表，支持搜索过滤。
 *
 * 排序规则：sql, bash, shell, python, 其余按字母序。
 * 语言列表通过动态 import 获取：避免在启动主包中对 lowlight（语法高亮，
 * 与 katex 同属 markdown-render chunk）形成静态依赖，保证冷启动不解析该 chunk。
 */
const PRIORITY = ['sql', 'bash', 'shell', 'python']

const LangPicker = () => {
  const langPicker = useAppStore((s) => s.langPicker)
  const hideLangPicker = useAppStore((s) => s.hideLangPicker)
  const pickerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [adjustedPos, setAdjustedPos] = useState({ x: 0, y: 0 })
  // 语言列表懒加载：弹出时动态 import lowlight（编辑器挂载后走缓存，瞬时可用）
  const [languages, setLanguages] = useState<string[] | null>(null)

  useEffect(() => {
    if (!langPicker) return
    let cancelled = false
    void import('../../config/lowlight').then((m) => {
      if (!cancelled) setLanguages(m.CODE_LANGUAGES)
    })
    return () => {
      cancelled = true
    }
  }, [langPicker])

  // 点击外部 / Esc → 关闭
  useEffect(() => {
    if (!langPicker) return
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) hideLangPicker()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        hideLangPicker()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [langPicker, hideLangPicker])

  // 弹出时自动聚焦搜索框 + 调整位置避免超出视口
  useEffect(() => {
    if (!langPicker) return
    setQuery('')
    setActiveIdx(0)
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus()
      if (!pickerRef.current) return
      const rect = pickerRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      let x = langPicker.x
      let y = langPicker.y
      // 右侧超出 → 左移
      if (x + rect.width > vw) {
        x = vw - rect.width - 8
      }
      // 底部超出 → 上移
      if (y + rect.height > vh) {
        y = vh - rect.height - 8
      }
      x = Math.max(4, x)
      y = Math.max(4, y)
      setAdjustedPos({ x, y })
    })
    return () => cancelAnimationFrame(raf)
  }, [langPicker])

  // 构建排序列表
  const langs = languages ?? []
  const sorted = [...langs].sort((a, b) => {
    const ia = PRIORITY.indexOf(a)
    const ib = PRIORITY.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a < b ? -1 : a > b ? 1 : 0
  })

  // 搜索过滤
  const filtered = query
    ? sorted.filter((l) => l.toLowerCase().includes(query.toLowerCase()))
    : sorted

  // 最近使用语言（仅在无搜索时显示，排除不存在的语言）
  const recent = useAppStore.getState().recentLanguages.filter((l) => langs.indexOf(l) !== -1)

  // 无搜索时：最近语言排前面，其余语言去重后紧随其后
  const displayList = query
    ? filtered
    : [...recent.filter((l) => filtered.includes(l)), ...filtered.filter((l) => !recent.includes(l))]

  // 确保 activeIdx 在有效范围内
  const safeIdx = Math.min(activeIdx, displayList.length - 1)

  const select = (lang: string) => {
    const { editor, addRecentLanguage } = useAppStore.getState()
    addRecentLanguage(lang)
    editor?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!view || view.isDestroyed) return false
      const pos = langPicker!.pos
      const node = view.state.doc.nodeAt(pos)
      if (!node || node.type.name !== 'code_block') return false
      if ((node.attrs.language as string) === lang) return false
      const tr = view.state.tr.setNodeAttribute(pos, 'language', lang)
      view.dispatch(tr)
      return true
    })
    hideLangPicker()
  }

  if (!langPicker) return null

  return (
    <div
      ref={pickerRef}
      className="mditor-lang-picker"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      <div className="mditor-lang-picker-head">
        选择语言{langPicker.language ? `（当前：${langPicker.language || 'text'}）` : ''}
      </div>
      <div className="mditor-lang-picker-search">
        <input
          ref={inputRef}
          type="text"
          className="mditor-lang-search-input"
          placeholder="搜索语言…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveIdx(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiveIdx((i) => Math.min(i + 1, displayList.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIdx((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (displayList[safeIdx]) select(displayList[safeIdx])
            }
          }}
        />
      </div>
      <div className="mditor-lang-picker-list">
        {displayList.length === 0 ? (
          <div className="mditor-lang-empty">无匹配</div>
        ) : (
          displayList.map((lang, i) => {
            // 最近语言与其余语言之间的分隔线（仅无搜索时）
            const isSep = !query && i === recent.length - 1 && i < displayList.length - 1
            return (
              <Fragment key={lang}>
                <div
                  className={
                    'mditor-lang-item' +
                    (lang === langPicker.language ? ' active' : '') +
                    (i === safeIdx ? ' highlight' : '')
                  }
                  onClick={() => select(lang)}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  {lang}
                </div>
                {isSep && <div className="mditor-lang-sep" />}
              </Fragment>
            )
          })
        )}
      </div>
    </div>
  )
}

export default LangPicker