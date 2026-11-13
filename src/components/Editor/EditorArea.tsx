import { lazy, Suspense, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../../stores/useAppStore'
import { useShortcutsStore } from '../../stores/shortcuts'
import { useSettingsStore } from '../../stores/settings'
import { useSnippetStore } from '../../stores/snippets'
// 懒加载编辑器：katex + lowlight 代码高亮等重型依赖只随编辑器一起加载，
// 无文档打开时（如纯冷启动欢迎页）避免解析这 ~1.2MB 的启动开销；首次打开后即有缓存。
const MilkdownEditor = lazy(() => import('./MilkdownEditor'))
const SourceEditor = lazy(() => import('./SourceEditor'))
import FindReplace from '../FindReplace'
import StatusBar from '../StatusBar/StatusBar'
import RecentFiles from '../RecentFiles/RecentFiles'
import { isMarkdown } from '../../utils/files'

/**
 * 浮层判定分两层，不能混为一谈：
 *
 * - `isModalOpen`：真正的模态弹窗（遮罩层，背后不该响应任何全局快捷键）。
 *   旧实现只看 promptDialog，于是设置弹窗里 Ctrl+F 会在背后开查找栏、Ctrl+S
 *   直接保存、F8/F9 切模式，命令面板里 Ctrl+P 会重复触发。
 * - `hasAnyOverlay`：再加上非模态的查找栏 / 搜索面板。这些浮层不遮断主界面，
 *   用户仍可能同时按 F8/F9/Ctrl+Shift+L，若一并屏蔽会让视图切换快捷键在
 *   查找栏常驻时莫名失效；它们只参与「全屏 Esc 让位」。
 *
 * 全屏 Esc 原先无条件 toggleFullscreen，与各浮层自己的 Esc 监听同时触发，
 * 一次 Esc 既关浮层又退全屏，因此必须由 hasAnyOverlay 把关。
 * 放在模块级：只读各 store 的 getState()，不依赖渲染闭包，handleKeyDown
 * 可以安全地在 useCallback 里引用而不必进入依赖数组。
 */
const isModalOpen = (): boolean => {
  const s = useAppStore.getState()
  return !!(
    s.promptDialog ||
    s.paletteOpen ||
    s.validationOpen ||
    useSettingsStore.getState().settingsOpen ||
    useSnippetStore.getState().modalOpen
  )
}

const hasAnyOverlay = (): boolean => {
  const s = useAppStore.getState()
  return isModalOpen() || s.findOpen || s.searchOpen
}

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

  // Ctrl+S 保存；Ctrl+F 打开查找；F11/Esc 全屏切换
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isModalOpen()) return
    // 全屏状态下按 Esc 退出全屏；有其它浮层时让位给浮层自己的 Esc 监听
    if (isFullscreenRef.current && e.key === 'Escape' && !hasAnyOverlay()) {
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
      // 源码模式下 FindReplace 未渲染（见下方 isMd && !sourceMode），旧实现仍
      // openFind() 会吞掉按键且完全没有反馈，给出明确提示。
      const st = useAppStore.getState()
      const tab = st.tabs.find((t) => t.id === st.activeTabId)
      if (tab?.sourceMode) {
        st.showToast('源码模式下暂不支持文档内查找，请切回所见即所得模式（Ctrl+/）')
        return
      }
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
    // Typora 键位：Ctrl+/ 源码模式、F8 专注（淡化）、F9 打字机（居中）、
    // Ctrl+Shift+L 侧栏开关。这几条只在有 Markdown 标签时才有意义，且必须与
    // 编辑器内的 Typora 键位（Ctrl+1..6 / Ctrl+Shift+K 等，由 plugins/typoraKeys.ts
    // 处理）互不重叠。
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '/') {
      const st = useAppStore.getState()
      const tab = st.tabs.find((t) => t.id === st.activeTabId)
      if (tab && /\.(md|markdown|mdx|mdown|mkd)$/i.test(tab.path)) {
        e.preventDefault()
        st.toggleSourceMode()
        return
      }
    }
    if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault()
      useAppStore.getState().toggleSidebar()
      return
    }
    if (e.key === 'F8') {
      e.preventDefault()
      useAppStore.getState().toggleFocusMode()
      return
    }
    if (e.key === 'F9') {
      e.preventDefault()
      useAppStore.getState().toggleTypewriterMode()
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