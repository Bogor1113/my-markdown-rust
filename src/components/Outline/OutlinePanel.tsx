import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../stores/useAppStore'

interface Props {
  /** 嵌入模式：由父组件提供 aside 容器，自身不再包裹 aside */
  embedded?: boolean
}

const OutlinePanel = ({ embedded = false }: Props) => {
  const outline = useAppStore((s) => s.outline)
  const activeOutlinePos = useAppStore((s) => s.activeOutlinePos)
  const jumpToHeading = useAppStore((s) => s.jumpToHeading)
  const hasActiveTab = useAppStore((s) => s.tabs.some((t) => t.id === s.activeTabId))
  const [collapsed, setCollapsed] = useState(false)
  const activeItemRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const item = activeItemRef.current
    const scroller = scrollRef.current
    if (!item || !scroller) return
    // 显式滚动到 high亮项 可见（scrollIntoView 在 WebView 里可能滚错祖先/不动）
    const src = scroller.getBoundingClientRect()
    const sRect = item.getBoundingClientRect()
    const relTop = sRect.top - src.top + scroller.scrollTop
    const relBottom = relTop + sRect.height
    if (relTop < scroller.scrollTop + 8) {
      scroller.scrollTop = Math.max(0, relTop - 8)
    } else if (relBottom > scroller.scrollTop + src.height - 8) {
      scroller.scrollTop = relBottom - src.height + 8
    }
  }, [activeOutlinePos])

  if (!hasActiveTab || outline.length === 0) return null

  const content = (
    <>
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <span className="mditor-panel-title text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          大纲
        </span>
        {!embedded && (
          <button
            className="text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
            onClick={() => setCollapsed(true)}
            title="收起大纲"
          >
            »
          </button>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-1">
        {outline.map((item, i) => {
          const isActive = item.pos === activeOutlinePos
          return (
            <button
              key={`${item.pos}-${i}`}
              ref={isActive ? activeItemRef : undefined}
              className={`block w-full truncate border-r-2 px-3 py-1 text-left text-[12.5px] leading-relaxed transition-colors hover:bg-[var(--color-border)]/40 ${
                isActive
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/12 font-bold text-[var(--color-accent)] shadow-[inset_0_0_0_1px_var(--color-accent-glow)]'
                  : 'border-transparent text-[var(--color-text)]'
              }`}
              style={{ paddingLeft: `${12 + (item.level - 1) * 12}px` }}
              onClick={() => jumpToHeading(item.pos)}
              title={item.text}
            >
              {item.text || '（无标题）'}
            </button>
          )
        })}
      </div>
    </>
  )

  if (embedded) {
    return <>{content}</>
  }

  // 独立模式（旧版兼容）
  if (collapsed) {
    return (
      <aside className="flex h-full w-8 flex-shrink-0 flex-col items-center border-l border-[var(--color-border)] bg-[var(--color-bg-sidebar)]">
        <button
          className="py-3 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
          onClick={() => setCollapsed(false)}
          title="展开大纲"
        >
          ☰
        </button>
      </aside>
    )
  }

  return (
    <aside
      className={`flex h-full flex-shrink-0 flex-col ${embedded ? 'w-full' : 'w-60 border-l border-[var(--color-border)] mditor-sidebar'}`}
    >
      {content}
    </aside>
  )
}

export default OutlinePanel
