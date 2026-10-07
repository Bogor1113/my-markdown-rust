import { create } from 'zustand'

const SHORTCUTS_KEY = 'mditor-shortcuts'

/** 快捷键定义：每个 action 对应一个唯一 ID 和默认按键 */
export interface ShortcutDef {
  id: string
  label: string
  /** 默认按键序列，如 'Ctrl+S', 'F11', 'Ctrl+Shift+F' */
  defaultKey: string
  /** 用户自定义按键（覆盖默认） */
  customKey?: string
}

/** 所有可自定义的快捷键 */
export const SHORTCUT_LIST: ShortcutDef[] = [
  { id: 'save', label: '保存文件', defaultKey: 'Ctrl+S' },
  { id: 'fullscreen', label: '全屏模式', defaultKey: 'F11' },
  { id: 'search', label: '全局搜索', defaultKey: 'Ctrl+Shift+F' },
  { id: 'find', label: '查找替换', defaultKey: 'Ctrl+F' },
  { id: 'palette', label: '命令面板', defaultKey: 'Ctrl+P' },
  { id: 'paletteCmd', label: '命令面板 (K)', defaultKey: 'Ctrl+K' },
]

function readShortcuts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SHORTCUTS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeShortcuts(map: Record<string, string>) {
  try { localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(map)) } catch { /* ignore */ }
}

interface ShortcutsState {
  overrides: Record<string, string>
  setOverride: (id: string, key: string) => void
  resetAll: () => void
  /** 获取某个 action 的实际按键（自定义或默认） */
  getKey: (id: string) => string
}

export const useShortcutsStore = create<ShortcutsState>((set, get) => ({
  overrides: readShortcuts(),

  setOverride: (id, key) => {
    set((s) => {
      const next = { ...s.overrides }
      if (key) {
        next[id] = key
      } else {
        delete next[id] // 还原时删除 key，避免 ghost entries
      }
      writeShortcuts(next)
      return { overrides: next }
    })
  },

  resetAll: () => {
    writeShortcuts({})
    set({ overrides: {} })
  },

  getKey: (id) => {
    const { overrides } = get()
    if (overrides[id]) return overrides[id]
    const def = SHORTCUT_LIST.find((s) => s.id === id)
    return def?.defaultKey ?? ''
  },
}))
