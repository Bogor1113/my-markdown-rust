import { useCallback, useEffect, useRef, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { useAppStore } from '../../stores/useAppStore'
import { FileIcon } from '../FileIcon'

interface TabMenu {
  x: number
  y: number
  tabId: string
}

const TabBar = () => {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const closeTabs = useAppStore((s) => s.closeTabs)

  // 标签右键菜单
  const [menu, setMenu] = useState<TabMenu | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const hideMenu = useCallback(() => setMenu(null), [])

  // 点击菜单外 / Esc / 滚动 / 失焦 → 关闭菜单
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) hideMenu()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideMenu()
    }
    const onOther = () => hideMenu()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onOther, true)
    window.addEventListener('blur', onOther)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onOther, true)
      window.removeEventListener('blur', onOther)
    }
  }, [menu, hideMenu])

  /** 若 ids 中有未保存的标签，先弹确认；返回是否继续关闭 */
  const confirmClose = useCallback(
    async (ids: string[]): Promise<boolean> => {
      const dirty = tabs.filter((t) => ids.includes(t.id) && t.isDirty)
      if (dirty.length === 0) return true
      const names =
        dirty.slice(0, 3).map((t) => t.name).join('、') + (dirty.length > 3 ? ' 等' : '')
      return ask(
        `${dirty.length} 个文件有未保存的修改（${names}），确定关闭？`,
        { title: '未保存的修改', kind: 'warning', okLabel: '关闭', cancelLabel: '取消' },
      )
    },
    [tabs],
  )

  const handleCloseTab = async (id: string) => {
    if (await confirmClose([id])) closeTab(id)
  }

  if (tabs.length === 0) return null

  // 右键菜单项
  const menuIdx = menu ? tabs.findIndex((t) => t.id === menu.tabId) : -1
  const runClose = async (ids: string[]) => {
    if (ids.length === 0) return
    hideMenu()
    if (await confirmClose(ids)) closeTabs(ids)
  }
  const menuItems = [
    {
      label: '关闭当前',
      // 与 × 按钮一致：允许关闭最后一个标签（closeTab 后进入空状态），
      // 旧条件 tabs.length <= 1 让两个入口行为矛盾
      disabled: false,
      action: () => void runClose(menu ? [menu.tabId] : []),
    },
    {
      label: '关闭左边',
      disabled: menuIdx <= 0,
      action: () => void runClose(menuIdx > 0 ? tabs.slice(0, menuIdx).map((t) => t.id) : []),
    },
    {
      label: '关闭右边',
      disabled: menuIdx < 0 || menuIdx >= tabs.length - 1,
      action: () =>
        void runClose(
          menuIdx >= 0 && menuIdx < tabs.length - 1 ? tabs.slice(menuIdx + 1).map((t) => t.id) : [],
        ),
    },
    {
      label: '关闭非当前文件',
      disabled: menuIdx < 0,
      action: async () => {
        if (!menu) return
        hideMenu()
        const ids = tabs.filter((t) => t.id !== menu.tabId).map((t) => t.id)
        if (!(await confirmClose(ids))) return
        // 先激活右键的目标标签，再关闭其余（符合 VS Code 行为）
        setActiveTab(menu.tabId)
        closeTabs(ids)
      },
    },
  ]

  return (
    <>
      <div className="tabbar-scroll mditor-sidebar flex items-end gap-0.5 overflow-x-auto border-b border-[var(--color-border)] px-1 pt-1 select-none">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className={`mditor-tab group flex max-w-[140px] cursor-pointer items-center gap-1 rounded-t-md px-2 py-1.5 text-[12.5px] ${
                isActive
                  ? 'mditor-tab-active font-medium'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tab)] hover:text-[var(--color-text)]'
              }`}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                // clamp 到视口内：贴窗口右缘/底部右键时菜单不溢出（与 ContextMenu 一致）
                const MENU_W = 168
                const MENU_H = 4 * 34 + 8
                const x = Math.max(4, Math.min(e.clientX, window.innerWidth - MENU_W - 4))
                const y = Math.max(4, Math.min(e.clientY, window.innerHeight - MENU_H - 4))
                setMenu({ x, y, tabId: tab.id })
              }}
              title={tab.path}
            >
              <FileIcon path={tab.path} size={14} />
              <span className="truncate">{tab.name}</span>
              {tab.isDirty && (
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--color-dirty)]" />
              )}
              <button
                className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded text-[12px] leading-none transition-colors ${
                  isActive
                    ? 'text-[var(--color-text-dim)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]'
                    : 'text-[var(--color-text-dim)] opacity-0 hover:bg-[var(--color-border)] hover:text-[var(--color-text)] group-hover:opacity-100'
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  void handleCloseTab(tab.id)
                }}
                title="关闭"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {/* 标签右键菜单 */}
      {menu && (
        <div
          ref={menuRef}
          className="mditor-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menuItems.map((item) => (
            <div
              key={item.label}
              className={`mditor-menu-item${item.disabled ? ' disabled' : ''}`}
              onClick={() => !item.disabled && item.action()}
            >
              <span className="mditor-menu-label">{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default TabBar
