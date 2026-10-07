import { useDeferredValue, useMemo, useState } from 'react'
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
  const isFullscreen = useAppStore((s) => s.isFullscreen)
  const toggleFullscreen = useAppStore((s) => s.toggleFullscreen)
  const spellcheck = useSettingsStore((s) => s.spellcheck)
  const setSpellcheck = useSettingsStore((s) => s.setSpellcheck)
  const headingNumbering = useSettingsStore((s) => s.headingNumbering)
  const setHeadingNumbering = useSettingsStore((s) => s.setHeadingNumbering)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isMdTab = !!activeTab && isMarkdown(activeTab.path)
  const hasTab = !!activeTab

  // countStats 会对整篇文档跑 11 个全量正则，是 O(文档长度) 的重活。
  // 之前它直接依赖 activeTab.content，于是**每敲一个字符**都要全量统计一遍
  // （5 万字文档约 3–8ms/键），与编辑器自身渲染叠加后表现为输入粘滞。
  //
  // useDeferredValue 把它降级为低优先级渲染：连续输入时这次渲染会被下一次输入
  // 打断并丢弃，只有在用户停顿后才真正算出结果并被提交。
  // 输入路径因此完全不被统计阻塞，而用户看到的数字只是延迟了不到一帧。
  const deferredContent = useDeferredValue(activeTab?.content ?? '')

  const stats = useMemo(() => {
    if (!hasTab) return null
    return countStats(deferredContent)
    // 注意依赖里用 hasTab 而不是 activeTab：activeTab 每次输入都是新对象引用，
    // 放进依赖会让 useMemo 完全失效，deferred 也就白做了。
  }, [hasTab, deferredContent])

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
        <button
          className={`mditor-statusbar-btn${focusMode ? ' active' : ''}`}
          onClick={toggleFocusMode}
          title={focusMode ? '退出专注模式' : '专注模式（打字机居中）'}
        >
          专注
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
