import { useState, useCallback, useRef } from 'react'
import FileTree from '../Sidebar/FileTree'
import Toolbar from '../Toolbar/Toolbar'
import TabBar from '../Tabs/TabBar'
import EditorArea from '../Editor/EditorArea'
import OutlinePanel from '../Outline/OutlinePanel'
import ContextMenu from '../ContextMenu/ContextMenu'
import LangPicker from '../ContextMenu/LangPicker'
import TreeContextMenu from '../Sidebar/TreeContextMenu'
import PromptDialog from '../Modal/PromptDialog'
import SettingsModal from '../Modal/SettingsModal'
import SnippetModal from '../SnippetModal'
import Toast from '../Toast'
import SearchPanel from '../SearchPanel/SearchPanel'
import TitleBar from '../TitleBar'
import { CommandPalette } from '../CommandPalette'
import { ValidationModal } from '../ValidationModal'
import { useAppStore } from '../../stores/useAppStore'

const SIDEBAR_KEY = 'mditor-sidebar-width'
const OUTLINE_KEY = 'mditor-outline-width'

function loadNum(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key)
    if (v !== null) {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  } catch { /* ignore */ }
  return fallback
}

/** 可拖拽分隔条：拖动期间只回调 onResize 更新内存态，结束时回调 onResizeEnd 一次（持久化放这里） */
function Divider({
  onResize,
  onResizeEnd,
}: {
  onResize: (delta: number) => void
  onResizeEnd: () => void
}) {
  const dragging = useRef(false)
  const startPos = useRef(0)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragging.current = true
      startPos.current = e.clientX

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        onResize(ev.clientX - startPos.current)
        startPos.current = ev.clientX
      }

      const onMouseUp = () => {
        dragging.current = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.classList.remove('mditor-resizing')
        onResizeEnd()
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      document.body.classList.add('mditor-resizing')
    },
    [onResize, onResizeEnd],
  )

  return (
    <div
      className="mditor-resize-handle-v"
      onMouseDown={onMouseDown}
    />
  )
}

const AppLayout = () => {
  const [sidebarWidth, setSidebarWidth] = useState(() => loadNum(SIDEBAR_KEY, 256))
  const [outlineWidth, setOutlineWidth] = useState(() => loadNum(OUTLINE_KEY, 240))
  const hasOutline = useAppStore(
    (s) => s.tabs.some((t) => t.id === s.activeTabId) && s.outline.length > 0,
  )
  const isFullscreen = useAppStore((s) => s.isFullscreen)
  const toggleFullscreen = useAppStore((s) => s.toggleFullscreen)

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.max(160, Math.min(480, w + delta)))
  }, [])
  // 持久化只在拖拽结束时做一次：之前放在 setSidebarWidth 的 updater 里，
  // 每次 mousemove 都同步写 localStorage（同步 IO + 强制序列化），拖一下就是上百次写盘。
  // 用 ref 读最新宽度：mouseup 回调闭包捕获的是 mousedown 时的 onResizeEnd，
  // 不走 ref 的话会把拖拽前的旧宽度写进去。
  const sidebarWidthRef = useRef(sidebarWidth)
  sidebarWidthRef.current = sidebarWidth
  const persistSidebarWidth = useCallback(() => {
    try { localStorage.setItem(SIDEBAR_KEY, String(sidebarWidthRef.current)) } catch { /* ignore */ }
  }, [])

  const handleOutlineResize = useCallback((delta: number) => {
    setOutlineWidth((w) => Math.max(140, Math.min(400, w - delta)))
  }, [])
  const outlineWidthRef = useRef(outlineWidth)
  outlineWidthRef.current = outlineWidth
  const persistOutlineWidth = useCallback(() => {
    try { localStorage.setItem(OUTLINE_KEY, String(outlineWidthRef.current)) } catch { /* ignore */ }
  }, [])

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* 自绘玻璃标题栏 + 工具栏（全屏时隐藏） */}
      {!isFullscreen && (
        <TitleBar>
          <Toolbar />
        </TitleBar>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 左侧文件树（全屏时隐藏） */}
        {!isFullscreen && (
          <>
            <aside
              className="mditor-sidebar flex h-full flex-shrink-0 flex-col border-r border-[var(--color-border)]"
              style={{ width: sidebarWidth }}
            >
              <FileTree />
            </aside>
            <Divider onResize={handleSidebarResize} onResizeEnd={persistSidebarWidth} />
          </>
        )}

        {/* 主区域 */}
        <main className="flex min-w-0 flex-1 flex-col">
          {!isFullscreen && <TabBar />}
          <EditorArea />
        </main>

        {/* 右侧大纲（全屏时隐藏） */}
        {!isFullscreen && hasOutline && (
          <>
            <Divider onResize={handleOutlineResize} onResizeEnd={persistOutlineWidth} />
            <aside
              className="mditor-sidebar flex h-full flex-shrink-0 flex-col border-l border-[var(--color-border)]"
              style={{ width: outlineWidth }}
            >
              <OutlinePanel embedded />
            </aside>
          </>
        )}
      </div>

      {/* 全局浮层 */}
      <ContextMenu />
      <LangPicker />
      <TreeContextMenu />
      <PromptDialog />
      <SettingsModal />
      <SnippetModal />
      <Toast />
      <SearchPanel />
      <CommandPalette />
      <ValidationModal />

      {/* 全屏时的悬浮退出按钮（键盘 F11/Esc 失效时保证可用鼠标退出） */}
      {isFullscreen && (
        <button
          type="button"
          onClick={() => toggleFullscreen()}
          title="退出全屏（F11 / Esc）"
          className="fixed right-3 top-3 z-[999] cursor-pointer rounded-md border border-[var(--color-border)] bg-[var(--color-bg-toolbar)] px-3 py-1.5 text-sm text-[var(--color-text)] shadow-lg transition-opacity hover:opacity-80"
        >
          退出全屏
        </button>
      )}
    </div>
  )
}

export default AppLayout
