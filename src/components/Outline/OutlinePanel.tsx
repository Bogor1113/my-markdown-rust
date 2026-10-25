import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../stores/useAppStore'

interface Props {
  /** 嵌入模式：由父组件提供 aside 容器，自身不再包裹 aside */
  embedded?: boolean
}

/**
 * 单条大纲项。
 *
 * 必须 memo：滚动时 `activeOutlinePos` 每帧都可能变，若整个列表在父组件里内联
 * 渲染，React 会重建**全部** 1000+ 个按钮节点（616KB 课件实测 605ms/帧的
 * jsxDEV 调用），滚动直接卡死。memo 之后每帧只有「失去高亮」和「获得高亮」
 * 两行真正重渲染。
 */
const OutlineRow = memo(function OutlineRow({
  index,
  level,
  text,
  active,
  onJump,
  itemRef,
}: {
  index: number
  level: number
  text: string
  active: boolean
  onJump: (index: number) => void
  itemRef?: React.RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      ref={itemRef}
      className={`block w-full truncate border-r-2 px-3 py-1 text-left text-[12.5px] leading-relaxed transition-colors hover:bg-[var(--color-border)]/40 ${
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/12 font-bold text-[var(--color-accent)] shadow-[inset_0_0_0_1px_var(--color-accent-glow)]'
          : 'border-transparent text-[var(--color-text)]'
      }`}
      style={{ paddingLeft: `${12 + (level - 1) * 12}px` }}
      onClick={() => onJump(index)}
      title={text}
    >
      {text || '（无标题）'}
    </button>
  )
})

const OutlinePanel = ({ embedded = false }: Props) => {
  const outline = useAppStore((s) => s.outline)
  const activeOutlinePos = useAppStore((s) => s.activeOutlinePos)
  const jumpToHeading = useAppStore((s) => s.jumpToHeading)
  const hasActiveTab = useAppStore((s) => s.tabs.some((t) => t.id === s.activeTabId))
  const [collapsed, setCollapsed] = useState(false)
  const activeItemRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  /** 最新大纲数组：跳转按索引取 pos，避免把 pos 当 prop 传给每一行 */
  const outlineRef = useRef(outline)
  outlineRef.current = outline

  // 跳转回调必须**稳定**：一旦它随大纲变化换新引用，所有行的 props 都变了，
  // memo 全部失效，等于没做。这里按下标查最新 pos，回调本体永久不变。
  const jumpByIndex = useCallback(
    (i: number) => {
      const item = outlineRef.current[i]
      if (item) jumpToHeading(item.pos)
    },
    [jumpToHeading],
  )

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
            // key 用下标而非 pos：编辑时后续标题的 pos 会整体平移，用 pos 当 key
            // 会让 React 把 1000+ 行全部卸载重建（616KB 课件实测一次 600ms+）。
            <OutlineRow
              key={i}
              index={i}
              level={item.level}
              text={item.text}
              active={isActive}
              onJump={jumpByIndex}
              itemRef={isActive ? activeItemRef : undefined}
            />
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
