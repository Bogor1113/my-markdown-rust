import { lazy, Suspense, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../../stores/useAppStore'
import { useShortcutsStore } from '../../stores/shortcuts'
// 懒加载编辑器：katex + lowlight 代码高亮等重型依赖只随编辑器一起加载，
// 无文档打开时（如纯冷启动欢迎页）避免解析这 ~1.2MB 的启动开销；首次打开后即有缓存。
const MilkdownEditor = lazy(() => import('./MilkdownEditor'))
const SourceEditor = lazy(() => import('./SourceEditor'))
import FindReplace from '../FindReplace'
import StatusBar from '../StatusBar/StatusBar'
import RecentFiles from '../RecentFiles/RecentFiles'
import { isMarkdown } from '../../utils/files'

const EditorArea = () => {
  const activeTabId = useAppStore((s) => s.activeTabId)
  const tabs = useAppStore((s) => s.tabs)
  const externalReload = useAppStore((s) => s.externalReload)
  const updateContent = useAppStore((s) => s.updateContent)
  const saveCurrentFile = useAppStore((s) => s.saveCurrentFile)
  const openFind = useAppStore((s) => s.openFind)
  const isFullscreen = useAppStore((s) => s.isFullscreen)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isMd = activeTab ? isMarkdown(activeTab.path) : false
  /** 源码模式（按标签记忆）：直接编辑原始 Markdown，Milkdown 编辑器整体卸载 */
  const sourceMode = isMd && !!activeTab?.sourceMode

  // ref 保持最新值，让 handleKeyDown 稳定（避免每次输入都解绑/重绑 window 监听）
  const saveRef = useRef(saveCurrentFile)
  saveRef.current = saveCurrentFile
  const openFindRef = useRef(openFind)
  openFindRef.current = openFind
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const isFullscreenRef = useRef(isFullscreen)
  isFullscreenRef.current = isFullscreen

  // 快捷键匹配辅助
  const matchShortcut = useCallback((e: KeyboardEvent, id: string): boolean => {
    const key = useShortcutsStore.getState().getKey(id)
    if (!key) return false
    const parts = key.split('+')
    const needCtrl = parts.includes('Ctrl')
    const needShift = parts.includes('Shift')
    const needAlt = parts.includes('Alt')
    const needMeta = parts.includes('Meta')
    const mainKey = parts[parts.length - 1]
    // 每个修饰键严格匹配；Ctrl 与 Meta 不互相放行（旧写法把 Meta 并入 Ctrl，
    // 导致含 Meta 的绑定永远不匹配、或 Ctrl 绑定误吃 Cmd 按键）
    if (needCtrl !== e.ctrlKey) return false
    if (needShift !== e.shiftKey) return false
    if (needAlt !== e.altKey) return false
    if (needMeta !== e.metaKey) return false
    // 主键统一小写比较：多字符键名（F11/Enter/方向键）旧写法不做小写化，
    // e.key 是 'f11' 而 mainKey 是 'F11' → 永远不等，F11 全屏从未生效过
    return e.key.toLowerCase() === mainKey.toLowerCase()
  }, [])

  // 有模态弹窗（自绘 prompt 等）打开时屏蔽全局快捷键：
  // 否则弹窗内按 Esc 会「关弹窗 + 退全屏」双重触发，Ctrl+F 会在弹窗背后开查找条
  const isModalBlocking = () => !!useAppStore.getState().promptDialog

  // Ctrl+S 保存；Ctrl+F 打开查找；F11/Esc 全屏切换
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isModalBlocking()) return
    // 全屏状态下按 Esc 退出全屏
    if (isFullscreenRef.current && e.key === 'Escape') {
      e.preventDefault()
      useAppStore.getState().toggleFullscreen()
      return
    }
    if (matchShortcut(e, 'save')) {
      e.preventDefault()
      saveRef.current()
      return
    }
    if (matchShortcut(e, 'find')) {
      e.preventDefault()
      openFindRef.current()
      return
    }
    if (matchShortcut(e, 'palette')) {
      e.preventDefault()
      useAppStore.getState().openPalette('files')
      return
    }
    if (matchShortcut(e, 'paletteCmd')) {
      e.preventDefault()
      useAppStore.getState().openPalette('commands')
      return
    }
    if (matchShortcut(e, 'fullscreen')) {
      e.preventDefault()
      useAppStore.getState().toggleFullscreen()
    }
  }, [matchShortcut])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!activeTab) {
    return (
      <div className="mditor-empty-state flex flex-1 flex-col items-center justify-center text-[var(--color-text-secondary)] select-none">
        <div className="mditor-empty-title text-center mb-4">
          <p className="text-lg">打开文件夹或文件开始编辑</p>
          <p className="text-sm mt-1 opacity-60">支持 Markdown 所见即所得编辑</p>
        </div>
        <RecentFiles />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="relative flex-1 min-h-0">
        <div className="h-full">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-secondary)]">
                编辑器加载中…
              </div>
            }
          >
            {sourceMode ? (
              <SourceEditor
                docKey={activeTab.id}
                content={activeTab.content}
                reloadTick={externalReload}
                onChange={(md) => updateContent(activeTab.id, md)}
              />
            ) : (
              <MilkdownEditor
                docKey={activeTab.id}
                content={activeTab.content}
                reloadTick={externalReload}
                onChange={(md) => updateContent(activeTab.id, md)}
              />
            )}
          </Suspense>
        </div>
        {isMd && !sourceMode && <FindReplace />}
      </div>
      {!isFullscreen && <StatusBar />}
    </div>
  )
}

export default EditorArea