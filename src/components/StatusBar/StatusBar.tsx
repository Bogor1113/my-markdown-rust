import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../stores/useAppStore'
import { useSettingsStore } from '../../stores/settings'
import { isMarkdown } from '../../utils/files'

/** 统计信息：字数、行数、字符数、段落数、图片数、链接数、预计阅读时间 */
function countStats(text: string) {
  const chars = text.length
  const lines = text ? text.split('\n').length : 0
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
  const latin = (text.match(/[a-zA-Z0-9]+(?:[''][a-zA-Z0-9]+)*/g) || []).length
  const words = cjk + latin
  // 段落数：非空行
  const paragraphs = text ? text.split(/\n\s*\n/).filter((p) => p.trim()).length : 0
  // 图片数
  const images = (text.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length
  // 链接数（排除图片链接）
  const links = (text.replace(/!\[[^\]]*\]\([^)]+\)/g, '').match(/\[[^\]]+\]\([^)]+\)/g) || []).length
  // 预计阅读时间（中文 400 字/分钟，英文 200 词/分钟）
  const readingMinutes = Math.max(1, Math.ceil((cjk / 400) + (latin / 200)))
  // 标题数
  const headings = (text.match(/^#{1,6}\s+.+/gm) || []).length
  // 代码块数
  const codeBlocks = (text.match(/^```/gm) || []).length / 2
  // 引用块数
  const blockquotes = (text.match(/^>\s+/gm) || []).length
  // 列表项数
  const listItems = (text.match(/^\s*[-*+]\s+/gm) || []).length + (text.match(/^\s*\d+\.\s+/gm) || []).length

  return { chars, words, lines, paragraphs, images, links, readingMinutes, cjk, latin, headings, codeBlocks: Math.floor(codeBlocks), blockquotes, listItems }
}

const StatusBar = () => {
  const activeTabId = useAppStore((s) => s.activeTabId)
  const tabs = useAppStore((s) => s.tabs)
  const focusMode = useAppStore((s) => s.focusMode)
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode)
  const typewriterMode = useAppStore((s) => s.typewriterMode)
  const toggleTypewriterMode = useAppStore((s) => s.toggleTypewriterMode)
  const isFullscreen = useAppStore((s) => s.isFullscreen)
  const toggleFullscreen = useAppStore((s) => s.toggleFullscreen)
  const spellcheck = useSettingsStore((s) => s.spellcheck)
  const setSpellcheck = useSettingsStore((s) => s.setSpellcheck)
  const headingNumbering = useSettingsStore((s) => s.headingNumbering)
  const setHeadingNumbering = useSettingsStore((s) => s.setHeadingNumbering)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isMdTab = !!activeTab && isMarkdown(activeTab.path)
  const hasTab = !!activeTab
  const sourceMode = isMdTab && !!activeTab?.sourceMode
  const toggleSourceMode = useAppStore((s) => s.toggleSourceMode)

  // countStats 会对整篇文档跑十余次全量正则，是 O(文档长度) 的重活
  // （616KB 课件实测 ~16ms）。之前它直接依赖 activeTab.content，于是**每次回写**
  // 都要全量统计一遍；useDeferredValue 只是把它降级为低优先级渲染，主线程照样
  // 被占住，而且它正好落在「输入停顿 200ms 回写」那一刻，直接顶高了下一次按键的
  // 响应延迟（实测 input 事件 p90 达到 300ms）。
  //
  // 现在改成「停下 600ms 才统计一次」：连续输入期间完全不进入统计路径，
  // 切标签时立即结算一次（用户确实在等这组数字）。
  const content = activeTab?.content ?? ''
  const [statContent, setStatContent] = useState(content)
  const statTabRef = useRef(activeTabId)
  useEffect(() => {
    const switched = statTabRef.current !== activeTabId
    statTabRef.current = activeTabId
    if (switched) {
      setStatContent(content)
      return
    }
    const t = setTimeout(() => setStatContent(content), 600)
    return () => clearTimeout(t)
  }, [content, activeTabId])

  const stats = useMemo(() => {
    if (!hasTab) return null
    return countStats(statContent)
    // 注意依赖里用 hasTab 而不是 activeTab：activeTab 每次输入都是新对象引用，
    // 放进依赖会让 useMemo 完全失效。
  }, [hasTab, statContent])

  const [showStats, setShowStats] = useState(false)

  if (!activeTab) return null

  return (
    <div className="mditor-statusbar">
      <div className="mditor-statusbar-left">
        {stats ? (
          <span
            className="relative cursor-default"
            onMouseEnter={() => setShowStats(true)}
            onMouseLeave={() => setShowStats(false)}
          >
            字数 {stats.words} · 行 {stats.lines} · 字符 {stats.chars}
            {isMdTab && (
              <>
                {' '}· 段落 {stats.paragraphs}
                {stats.images > 0 && <> · 图片 {stats.images}</>}
                {stats.links > 0 && <> · 链接 {stats.links}</>}
                {' '}· ~{stats.readingMinutes} 分钟
              </>
            )}
            {showStats && (
              <div className="mditor-stats-tooltip">
                <div className="mditor-stats-tooltip-title">文档统计</div>
                <div className="mditor-stats-grid">
                  <span>总字数</span><span>{stats.words}</span>
                  <span>中文字符</span><span>{stats.cjk}</span>
                  <span>英文单词</span><span>{stats.latin}</span>
                  <span>总字符数</span><span>{stats.chars}</span>
                  <span>行数</span><span>{stats.lines}</span>
                  <span>段落数</span><span>{stats.paragraphs}</span>
                  <span>标题数</span><span>{stats.headings}</span>
                  <span>图片数</span><span>{stats.images}</span>
                  <span>链接数</span><span>{stats.links}</span>
                  <span>代码块</span><span>{stats.codeBlocks}</span>
                  <span>引用块</span><span>{stats.blockquotes}</span>
                  <span>列表项</span><span>{stats.listItems}</span>
                  <span>阅读时间</span><span>~{stats.readingMinutes} 分钟</span>
                </div>
              </div>
            )}
          </span>
        ) : null}
      </div>
      <div className="mditor-statusbar-right">
        {isMdTab && (
          <button
            className={`mditor-statusbar-btn${sourceMode ? ' active' : ''}`}
            onClick={() => toggleSourceMode()}
            title={sourceMode ? '切换到所见即所得模式' : '切换到源码模式（直接编辑原始 Markdown）'}
          >
            源码
          </button>
        )}
        <button
          className={`mditor-statusbar-btn${focusMode ? ' active' : ''}`}
          onClick={toggleFocusMode}
          title={focusMode ? '退出专注模式 (F8)' : '专注模式：淡化非当前段落 (F8)'}
        >
          专注
        </button>
        <button
          className={`mditor-statusbar-btn${typewriterMode ? ' active' : ''}`}
          onClick={toggleTypewriterMode}
          title={typewriterMode ? '退出打字机模式 (F9)' : '打字机模式：当前段落固定居中 (F9)'}
        >
          打字机
        </button>
        <button
          className={`mditor-statusbar-btn${isFullscreen ? ' active' : ''}`}
          onClick={toggleFullscreen}
          title={isFullscreen ? '退出全屏 (F11)' : '全屏模式 (F11)'}
        >
          全屏
        </button>
        {isMdTab && (
          <button
            className={`mditor-statusbar-btn${spellcheck ? ' active' : ''}`}
            onClick={() => setSpellcheck(!spellcheck)}
            title={spellcheck ? '关闭拼写检查' : '开启拼写检查'}
          >
            拼写
          </button>
        )}
        {isMdTab && (
          <button
            className={`mditor-statusbar-btn${headingNumbering ? ' active' : ''}`}
            onClick={() => setHeadingNumbering(!headingNumbering)}
            title={headingNumbering ? '关闭标题自动编号' : '开启标题自动编号'}
          >
            编号
          </button>
        )}
      </div>
    </div>
  )
}

export default StatusBar
