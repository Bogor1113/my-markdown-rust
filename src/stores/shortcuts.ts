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
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    // 形状校验：损坏数据（"null"/标量/数组）会让 getKey 里 overrides[id] 抛
    // TypeError，全局 keydown 每键报错、所有快捷键失效——宁可回退默认值
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeShortcuts(map: Record<string, string>) {
  try { localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(map)) } catch { /* ignore */ }
}

interface ShortcutsState {
  overrides: Record<string, string>
  /** 设置自定义快捷键；与其它动作冲突时返回 false（不写入），由调用方提示 */
  setOverride: (id: string, key: string) => boolean
  resetAll: () => void
  /** 获取某个 action 的实际按键（自定义或默认） */
  getKey: (id: string) => string
}

/** 冲突检测：同键（规范化大小写）只允许绑定一个动作，否则先绑者被静默覆盖。
 *  返回冲突动作的 label，无冲突返回 null。 */
export function getShortcutConflict(id: string, key: string): string | null {
  const overrides = useShortcutsStore.getState().overrides
  const norm = (s: string) => s.toLowerCase()
  for (const def of SHORTCUT_LIST) {
    if (def.id === id) continue
    const other = overrides[def.id] ?? def.defaultKey
    if (other && norm(other) === norm(key)) return def.label
  }
  return null
}

export const useShortcutsStore = create<ShortcutsState>((set, get) => ({
  overrides: readShortcuts(),

  setOverride: (id, key) => {
    if (key && getShortcutConflict(id, key)) return false
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
    return true
  },

  resetAll: () => {
    writeShortcuts({})
    set({ overrides: {} })
  },

  getKey: (id) => {
    const { overrides } = get()
    if (overrides?.[id]) return overrides[id]
    const def = SHORTCUT_LIST.find((s) => s.id === id)
    return def?.defaultKey ?? ''
  },
}))
