import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Editor } from '@milkdown/kit/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { Tab, FileEntry, OutlineItem, ContextMenuState, LangPickerState, TreeMenuState, SearchResult, PromptDialogState, FsChangeEvent } from '../types'
import { readFile, writeFile, listDirectory, searchFiles, fileSize } from '../services/fs'
import { isMarkdown, parentDirOf } from '../utils/files'
import { useSettingsStore } from './settings'

type Theme = 'dark' | 'light' | 'midnight' | 'dusk' | 'graphite' | 'paper'

/** 主题注册表：kind 决定亮/暗家族（导出背景色等按此分流） */
export interface ThemeItem {
  id: Theme
  name: string
  kind: 'light' | 'dark'
  icon: string
}

export const THEMES: ThemeItem[] = [
  { id: 'dark', name: '暗黑', kind: 'dark', icon: '🌙' },
  { id: 'light', name: '明亮', kind: 'light', icon: '☀️' },
  { id: 'midnight', name: '午夜蓝', kind: 'dark', icon: '🌌' },
  { id: 'dusk', name: '日暮', kind: 'dark', icon: '🌆' },
  { id: 'graphite', name: '石墨', kind: 'dark', icon: '🖤' },
  { id: 'paper', name: '纸墨', kind: 'light', icon: '📄' },
]

export function isDarkTheme(t: Theme | string): boolean {
  return (THEMES.find((x) => x.id === t) ?? THEMES[0]).kind === 'dark'
}

export function themeLabel(t: Theme): string {
  return THEMES.find((x) => x.id === t)?.name ?? '暗黑'
}

const THEME_KEY = 'mditor-theme'

/** 会话记忆：记住上次打开的目录/文件，下次启动自动恢复 */
const SESSION_KEY = 'mditor-session'

/** 全文搜索请求序号：丢弃慢查询的过期响应（见 runSearch） */
let runSearchSeq = 0

/** 最近文件列表持久化键 */
const RECENT_FILES_KEY = 'mditor-recent-files'

/** 最近文件最大保留数 */
const MAX_RECENT_FILES = 15

/** 最近使用语言持久化键 */
const RECENT_LANGS_KEY = 'mditor-recent-langs'

/** 最近语言最大保留数 */
const MAX_RECENT_LANGS = 8

interface SessionData {
  rootPath: string | null
  openPaths: string[]
  activePath: string | null
  expandedDirs: string[]
  /** 以源码模式打开的文件路径（恢复会话时回填，否则 >10MB 文件重启后被
   *  WYSIWYG 全量 parse/渲染冻结数秒，击穿大文件保护） */
  sourceModePaths?: string[]
}

function readSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as SessionData
    if (!data || !Array.isArray(data.openPaths)) return null
    // 逐字段类型校验：localStorage 被部分写入/旧版本 schema 变更时，
    // new Set(非数组) 会在 restoreSession 里同步抛 TypeError，
    // 连带打断启动参数打开文件的链路（双击 .md 无法打开且无任何提示）
    if (typeof data.rootPath !== 'string' && data.rootPath !== null) return null
    if (typeof data.activePath !== 'string' && data.activePath !== null) return null
    return {
      rootPath: data.rootPath,
      openPaths: data.openPaths.filter((p): p is string => typeof p === 'string'),
      activePath: data.activePath,
      expandedDirs: Array.isArray(data.expandedDirs)
        ? data.expandedDirs.filter((p): p is string => typeof p === 'string')
        : [],
    }
  } catch {
    return null
  }
}

function readRecentFiles(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as string[]
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT_FILES) : []
  } catch {
    return []
  }
}

function writeRecentFiles(files: string[]) {
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files.slice(0, MAX_RECENT_FILES)))
  } catch {
    /* ignore */
  }
}

function readRecentLangs(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_LANGS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as string[]
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT_LANGS) : []
  } catch {
    return []
  }
}

function writeRecentLangs(langs: string[]) {
  try {
    localStorage.setItem(RECENT_LANGS_KEY, JSON.stringify(langs.slice(0, MAX_RECENT_LANGS)))
  } catch {
    /* ignore */
  }
}

function writeSession(data: SessionData) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

/** 由各变更动作调用：把当前会话快照写入 localStorage */
function persistSession() {
  const s = useAppStore.getState()
  writeSession({
    rootPath: s.rootPath,
    openPaths: [...new Set(s.tabs.map((t) => t.path))],
    activePath: s.activeTabId,
    expandedDirs: [...s.expandedDirs],
    sourceModePaths: s.tabs.filter((t) => t.sourceMode).map((t) => t.path),
  })
}

/** 初始主题：默认暗黑，若用户之前切换过则读取记忆 */
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null
    if (saved && THEMES.some((x) => x.id === saved)) return saved
  } catch {
    /* ignore */
  }
  return 'dark'
}

/** 应用主题：设置 data-theme 属性并记忆 */
function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* ignore */
  }
  // mermaid 图表按主题配色渲染：切主题后让所有图表按新主题重绘
  void import('../plugins/mermaid').then((m) => m.refreshMermaidTheme())
}

/** 自动保存：停止编辑 30s 后落盘（防抖，避免每敲一个字就重写整个文件） */
const AUTOSAVE_DEBOUNCE_MS = 30_000

/**
 * 连续编辑时的强制落盘上限。
 *
 * 防抖会被每一次按键重置——若只依赖防抖，长时间不停输入期间可以一直不落盘
 * （30s 防抖 + 从不停止输入 = 永不保存）。这里对「首次变脏」起算一个上限，
 * 到点无条件保存一次，保证「未落盘时间」有上界。
 */
const AUTOSAVE_MAX_DELAY_MS = 60_000

let _autosaveTimer: ReturnType<typeof setTimeout> | null = null
/** 本轮「变脏周期」的强制落盘截止时间（毫秒时间戳）；无待保存任务时为 0 */
let _autosaveDeadline = 0
/** 每个标签页的写盘串行化队列：自动保存与手动 Ctrl+S 并发时避免乱序写覆盖 */
const _saveInflight = new Map<string, Promise<void>>()

/**
 * 把所有未保存的标签页写入磁盘。
 *
 * 注意保存的是**全部脏标签**，而不只是最后一次编辑的那个：
 * 旧实现只记住单个 `_autosaveTabId`，于是「在 A 里改几笔 → 切到 B 继续改」
 * 会把定时器重置到 B，A 再也不会被自动保存，退出即丢改动。
 */
function runAutosave() {
  _autosaveTimer = null
  _autosaveDeadline = 0
  const { tabs, saveTab, showToast } = useAppStore.getState()
  for (const tab of tabs) {
    if (!tab.isDirty) continue
    // 保存失败绝不能静默：写盘 reject（权限/磁盘满/文件被删）若无人接住，
    // 用户完全不知道内容没落盘，标签页看似正常，退出即丢数据。
    saveTab(tab.id).catch((e) => {
      showToast(`自动保存失败：${e}`)
    })
  }
}

/** 调度自动保存：30s 防抖，且最迟 AUTOSAVE_MAX_DELAY_MS 后强制落盘一次 */
function scheduleAutosave() {
  // 用户关闭了自动保存 → 清空待办
  if (!useSettingsStore.getState().autoSave) {
    if (_autosaveTimer) {
      clearTimeout(_autosaveTimer)
      _autosaveTimer = null
    }
    _autosaveDeadline = 0
    return
  }

  const now = Date.now()
  // 新的一轮变脏（当前没有待办）→ 重新起算强制落盘截止时间
  if (!_autosaveTimer) _autosaveDeadline = now + AUTOSAVE_MAX_DELAY_MS

  if (_autosaveTimer) clearTimeout(_autosaveTimer)
  const delay = Math.max(0, Math.min(AUTOSAVE_DEBOUNCE_MS, _autosaveDeadline - now))
  _autosaveTimer = setTimeout(runAutosave, delay)
}

/**
 * 大文件确认弹窗：用自绘弹窗（非阻塞）替代原生 window.confirm。
 *
 * 原实现直接调用 window.confirm——它是 WebView2 里的原生模态框，会阻塞渲染线程；
 * 若窗口尚未显示（visible:false 启动、托盘隐藏）或弹到不可见位置，用户看不到也无法关闭，
 * 整窗像死机一样无法点击。自绘弹窗只更新 React 状态，任何窗口状态下都不会卡死。
 */
function confirmLargeFile(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    useAppStore.getState().openPrompt({
      title: '大文件确认',
      message:
        '文件超过 10MB，以源码模式打开？\n\n源码模式仅显示原始文本，不加载 Milkdown 编辑器，打开速度更快。',
      fields: [],
      confirmLabel: '以源码模式打开',
      cancelLabel: '取消',
      onConfirm: () => finish(true),
      onCancel: () => finish(false),
    })
  })
}

interface AppState {
  // ── 主题 ──
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void

  /** toast 自动消失计时器（内部使用） */
  toastTimer?: ReturnType<typeof setTimeout>

  // ── 文件树 ──
  rootPath: string | null
  fileTree: Record<string, FileEntry[]> // dirPath → children
  expandedDirs: Set<string>

  // ── 标签页 ──
  tabs: Tab[]
  activeTabId: string | null
  docVersion: number // 每次切换标签时递增，触发编辑器重载

  // ── 大纲 ──
  outline: OutlineItem[]
  setOutline: (items: OutlineItem[]) => void
  /** 滚动时当前高亮的标题 pos（scroll-spy），null 表示无激活项 */
  activeOutlinePos: number | null
  setActiveOutlinePos: (pos: number | null) => void
  /** 由编辑器注册的跳转处理器 */
  jumpHandler: ((pos: number) => void) | null
  registerJumpHandler: (fn: ((pos: number) => void) | null) => void
  jumpToHeading: (pos: number) => void

  // ── 右键菜单 ──
  contextMenu: ContextMenuState | null
  showContextMenu: (state: ContextMenuState) => void
  hideContextMenu: () => void
  /** 编辑器实例，供右键菜单/语言徽章执行命令 */
  editor: Editor | null
  registerEditor: (editor: Editor | null) => void

  // ── 代码块语言选择器 ──
  langPicker: LangPickerState | null
  showLangPicker: (state: LangPickerState) => void
  hideLangPicker: () => void

  // ── 全局轻提示 ──
  toast: string | null
  /** 自增序号：让 Toast 用 key 重新触发入场动画 */
  toastSeq: number
  showToast: (message: string) => void

  // ── 当前文档 Markdown 源码（供「复制为 Markdown」使用）──
  markdown: string
  setMarkdown: (md: string) => void

  // ── 文件树右键菜单 ──
  treeMenu: TreeMenuState | null
  showTreeMenu: (state: TreeMenuState) => void
  hideTreeMenu: () => void

  // ── 全局自绘弹窗（替换原生 window.prompt） ──
  promptDialog: PromptDialogState | null
  openPrompt: (state: PromptDialogState) => void
  closePrompt: () => void

  // ── 命令面板（Ctrl+P 文件 / Ctrl+K 命令）──
  paletteOpen: boolean
  paletteMode: 'files' | 'commands'
  openPalette: (mode: 'files' | 'commands') => void
  closePalette: () => void

  // ── 链接/图片路径校验结果 ──
  validationOpen: boolean
  validationItems: { kind: 'link' | 'image'; target: string; pos: number }[]
  openValidation: (items: { kind: 'link' | 'image'; target: string; pos: number }[]) => void
  closeValidation: () => void

  // ── 查找替换 ──
  findOpen: boolean
  openFind: () => void
  closeFind: () => void

  // ── 跨文件搜索 ──
  searchOpen: boolean
  searchQuery: string
  searchResults: SearchResult[]
  searchSearching: boolean
  openSearch: () => void
  closeSearch: () => void
  setSearchQuery: (query: string) => void
  runSearch: (query: string) => Promise<void>

  // ── 专注模式 ──
  focusMode: boolean
  toggleFocusMode: () => void

  // ── 全屏模式（F11） ──
  isFullscreen: boolean
  toggleFullscreen: () => Promise<void>

  // ── 文件系统监听 ──
  /** 每次递增：外部修改重新加载文档后触发编辑器刷新（区别于 docVersion 的整体重建） */
  externalReload: number
  /** 处理 Rust watcher 推送的文件系统事件：刷新文件树 + 重新加载已打开标签 */
  handleFsEvent: (events: FsChangeEvent[]) => Promise<void>

  // ── Actions ──
  setRootPath: (path: string | null) => void
  loadDirectory: (path: string) => Promise<void>
  toggleExpand: (path: string) => Promise<void>
  openFile: (path: string, opts?: { skipLargeConfirm?: boolean }) => Promise<void>
  closeTab: (id: string) => void
  /** 批量关闭标签（右键菜单用）；若活动标签被关闭，自动激活邻近的标签 */
  closeTabs: (ids: string[]) => void
  setActiveTab: (id: string) => void
  updateContent: (id: string, content: string) => void
  /** 切换指定标签（默认活动标签）的源码模式；非 Markdown 标签无效 */
  toggleSourceMode: (id?: string) => void
  saveCurrentFile: () => Promise<void>
  /** 保存指定标签的文件（供自动保存使用） */
  saveTab: (tabId: string) => Promise<void>
  /** 文件被重命名后，同步已打开标签的路径与名称 */
  renameTabPath: (oldPath: string, newPath: string) => void
  /** 启动时恢复上次会话：目录 + 已打开文件 + 活动标签 */
  restoreSession: () => Promise<void>

  // ── 最近文件 ──
  recentFiles: string[]
  addRecentFile: (path: string) => void

  // ── 最近使用语言 ──
  recentLanguages: string[]
  addRecentLanguage: (lang: string) => void
}
/**
 * subscribeWithSelector：允许 `store.subscribe(selector, listener)` 只在选中切片变化时
 * 通知监听器。此前 App.tsx 用裸 subscribe，弹一次 toast / 开一次右键菜单都要跑一遍
 * dirty 文件列表的 filter+map+join，还可能触发多余 IPC。
 * 所有现有的 `useAppStore(selector)` 用法不受影响。
 */
export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
  // ── 主题 ──
  theme: initialTheme(),
  toggleTheme: () =>
    set((s) => {
      const idx = THEMES.findIndex((x) => x.id === s.theme)
      const next = THEMES[(idx + 1) % THEMES.length].id
      applyTheme(next)
      return { theme: next }
    }),
  setTheme: (t) => {
    applyTheme(t)
    set({ theme: t })
  },

  // ── 初始状态 ──
  rootPath: null,
  fileTree: {},
  expandedDirs: new Set(),
  tabs: [],
  activeTabId: null,
  docVersion: 0,
  recentFiles: readRecentFiles(),

  // ── 最近使用语言 ──
  recentLanguages: readRecentLangs(),

  // ── 大纲 ──
  outline: [],
  setOutline: (items) => set({ outline: items }),
  activeOutlinePos: null,
  setActiveOutlinePos: (pos) =>
    set((s) => (s.activeOutlinePos === pos ? s : { activeOutlinePos: pos })),
  jumpHandler: null,
  registerJumpHandler: (fn) => set({ jumpHandler: fn }),
  jumpToHeading: (pos) => get().jumpHandler?.(pos),

  // ── 右键菜单 ──
  contextMenu: null,
  showContextMenu: (state) => set({ contextMenu: state }),
  hideContextMenu: () => set({ contextMenu: null }),
  editor: null,
  registerEditor: (editor) => set({ editor }),

  // ── 代码块语言选择器 ──
  langPicker: null,
  showLangPicker: (state) => set({ langPicker: state }),
  hideLangPicker: () => set({ langPicker: null }),

  // ── 全局轻提示 ──
  toast: null,
  toastSeq: 0,
  showToast: (message) => {
    const prev = get().toastTimer
    if (prev) clearTimeout(prev)
    set({ toast: message, toastSeq: get().toastSeq + 1 })
    const timer = setTimeout(() => set({ toast: null }), 3000)
    set({ toastTimer: timer })
  },

  // ── 当前文档 Markdown 源码（供「复制为 Markdown」使用）──
  markdown: '',
  setMarkdown: (md) => set({ markdown: md }),

  // ── 文件树右键菜单 ──
  treeMenu: null,
  showTreeMenu: (state) => set({ treeMenu: state }),
  hideTreeMenu: () => set({ treeMenu: null }),

  // ── 全局自绘弹窗（替换原生 window.prompt） ──
  promptDialog: null,
  openPrompt: (state) => set({ promptDialog: state }),
  closePrompt: () => set({ promptDialog: null }),

  // ── 命令面板 ──
  paletteOpen: false,
  paletteMode: 'files',
  openPalette: (mode) => set({ paletteOpen: true, paletteMode: mode }),
  closePalette: () => set({ paletteOpen: false }),

  // ── 链接/图片路径校验 ──
  validationOpen: false,
  validationItems: [],
  openValidation: (items) => set({ validationOpen: true, validationItems: items }),
  closeValidation: () => set({ validationOpen: false }),

  // ── 查找替换 ──
  findOpen: false,
  openFind: () => set({ findOpen: true }),
  closeFind: () => set({ findOpen: false }),

  // ── 跨文件搜索 ──
  searchOpen: false,
  searchQuery: '',
  searchResults: [],
  searchSearching: false,
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false, searchQuery: '', searchResults: [], searchSearching: false }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  runSearch: async (query) => {
    const root = get().rootPath
    if (!root || !query.trim()) return
    // 序号守卫：慢查询后返回会覆盖新查询的结果（先发慢 A 再发快 B，B 先渲染后被 A 覆盖）
    const seq = ++runSearchSeq
    set({ searchQuery: query, searchSearching: true })
    try {
      const results = await searchFiles(root, query.trim(), 200)
      if (seq !== runSearchSeq) return
      set({ searchResults: results.filter((r) => isMarkdown(r.path)), searchSearching: false })
    } catch {
      if (seq !== runSearchSeq) return
      set({ searchResults: [], searchSearching: false })
    }
  },

  // ── 专注模式 ──
  focusMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

  // ── 全屏模式（F11） ──
  isFullscreen: false,
  toggleFullscreen: async () => {
    // 以 store 状态为准切换（避免依赖 win.isFullscreen() 在 Windows 全屏
    // 切换过程中的查询结果不稳定，导致退出时再次执行 setFullscreen(true)）
    const next = !get().isFullscreen
    try {
      const win = getCurrentWindow()
      await win.setFullscreen(next)
      set({ isFullscreen: next })
      // 全屏切换时 Toolbar/StatusBar/TabBar 会从 DOM 移除（聚焦元素随之消失），
      // 重新聚焦窗口避免键盘焦点丢失，确保 F11/Esc 能继续触发退出
      await win.setFocus().catch(() => {})
    } catch {
      /* ignore */
    }
  },

  // ── 文件系统监听 ──
  externalReload: 0,
  handleFsEvent: async (events) => {
    // 1. 重命名配对：rename-from + rename-to 按「同父目录」启发式配对
    //    （Windows 上重命名会拆成两个事件，见 commands/watcher.rs；
    //     排序后配对保证确定性，同目录多文件同时重命名仍可能有歧义）
    const froms: string[] = []
    const tos: string[] = []
    for (const e of events) {
      if (e.kind === 'rename-from') froms.push(...e.paths)
      else if (e.kind === 'rename-to') tos.push(...e.paths)
    }
    froms.sort()
    tos.sort()
    const renames: { from: string; to: string }[] = []
    const remainingTos = [...tos]
    for (const f of froms) {
      const idx = remainingTos.findIndex((t) => parentDirOf(t) === parentDirOf(f))
      if (idx >= 0) {
        renames.push({ from: f, to: remainingTos[idx] })
        remainingTos.splice(idx, 1)
      }
    }
    // 已打开标签路径同步（含目录重命名时其下所有已打开文件）
    for (const r of renames) get().renameTabPath(r.from, r.to)

    // 2. 收集全部受影响路径
    const allPaths = new Set<string>()
    for (const e of events) for (const p of e.paths) allPaths.add(p)
    for (const r of renames) allPaths.add(r.to)

    const { showToast } = get()

    // 3. 根目录被删除 / 重命名：整个文件树重置或跟随新路径
    const root = get().rootPath
    if (root) {
      const rootRename = renames.find((r) => r.from === root)
      if (rootRename) {
        set({ fileTree: {}, expandedDirs: new Set(), rootPath: rootRename.to })
        showToast(`根目录已被外部重命名为「${rootRename.to}」`)
        await get().loadDirectory(rootRename.to).catch(() => {})
      } else if (
        events.some(
          (e) =>
            (e.kind === 'remove' || e.kind === 'rename-from') &&
            e.paths.some((p) => p === root),
        )
      ) {
        showToast('根目录已被删除或移动')
        set({ fileTree: {}, expandedDirs: new Set(), rootPath: null })
      }
    }

    // 4. 刷新已缓存的受影响父目录（只刷新 fileTree 中已加载的目录；
    //    事件风暴如 git checkout 时退化为只刷新根目录，避免大量 listDirectory）
    const storm = allPaths.size > 500
    const dirs = new Set<string>()
    if (storm) {
      const r = get().rootPath
      if (r && get().fileTree[r]) dirs.add(r)
    } else {
      for (const p of allPaths) {
        const parent = parentDirOf(p)
        if (get().fileTree[parent]) dirs.add(parent)
      }
    }
    await Promise.all(
      [...dirs].map(async (dir) => {
        try {
          const entries = await listDirectory(dir)
          set((st) => ({ fileTree: { ...st.fileTree, [dir]: entries } }))
        } catch {
          // 目录已被删除/移动：清除该目录缓存
          set((st) => {
            if (st.fileTree[dir] === undefined) return st
            const fileTree = { ...st.fileTree }
            delete fileTree[dir]
            const expandedDirs = new Set(st.expandedDirs)
            expandedDirs.delete(dir)
            return { fileTree, expandedDirs }
          })
        }
      }),
    )

    // 5. 已打开标签：外部修改 → 重新加载；未保存的跳过并提示；被删除的提示
    const { tabs } = get()
    const sep = tabs[0]?.path.includes('\\') ? '\\' : '/'
    const reload: { id: string; content: string }[] = []
    for (const tab of tabs) {
      let affected = allPaths.has(tab.path)
      if (!affected && sep) {
        // 目录被删除/重命名 → 其下所有已打开文件受影响
        for (const p of allPaths) {
          if (tab.path.startsWith(p + sep)) {
            affected = true
            break
          }
        }
      }
      if (!affected) continue
      if (tab.isDirty) {
        showToast(`「${tab.name}」已被外部修改，因有未保存更改未自动加载`)
        continue
      }
      try {
        const content = await readFile(tab.path)
        // 竞态保护：await 期间用户可能已开始编辑（标签变为未保存），此时不再覆盖
        const latest = get().tabs.find((t) => t.id === tab.id)
        if (!latest || latest.isDirty) continue
        // 内容未变（如应用自身保存触发的事件）→ 跳过，避免无谓重载
        if (content !== latest.content) reload.push({ id: tab.id, content })
      } catch {
        showToast(`「${tab.name}」已被外部删除或移动`)
      }
    }
    if (reload.length > 0) {
      showToast(`已从磁盘重新加载 ${reload.length} 个文件的修改`)
      // 仅当活动标签被重载时才递增 externalReload，避免无关重载触发编辑器空操作
      const activeId = get().activeTabId
      const touchActive = reload.some((r) => r.id === activeId)
      set((st) => ({
        tabs: st.tabs.map((t) => {
          const r = reload.find((x) => x.id === t.id)
          return r ? { ...t, content: r.content, savedContent: r.content, isDirty: false } : t
        }),
        externalReload: touchActive ? st.externalReload + 1 : st.externalReload,
      }))
    }
  },

  // ── Actions ──

  setRootPath: (path) => {
    set({ rootPath: path })
    persistSession()
  },

  loadDirectory: async (path) => {
    const entries = await listDirectory(path)
    set((s) => ({
      fileTree: { ...s.fileTree, [path]: entries },
      expandedDirs: new Set(s.expandedDirs).add(path),
    }))
    persistSession()
  },

  toggleExpand: async (path) => {
    const s = get()
    if (s.expandedDirs.has(path)) {
      const next = new Set(s.expandedDirs)
      next.delete(path)
      set({ expandedDirs: next })
    } else {
      if (!s.fileTree[path]) {
        // 目录可能在渲染后被删除/移动/权限变化：不捕获会产生 Unhandled Rejection，
        // 且点击看起来毫无反应
        try {
          const entries = await listDirectory(path)
          set((s2) => ({ fileTree: { ...s2.fileTree, [path]: entries } }))
        } catch (e) {
          get().showToast(`无法读取目录：${e}`)
          return
        }
      }
      set((s2) => ({ expandedDirs: new Set(s2.expandedDirs).add(path) }))
    }
    persistSession()
  },

  openFile: async (path, opts) => {
    const s = get()
    // 仅支持 Markdown 文档（.md / .markdown）
    if (!isMarkdown(path)) {
      get().showToast('仅支持打开 Markdown 文档（.md / .markdown）')
      return
    }
    const existing = s.tabs.find((t) => t.path === path)
    if (existing) {
      set({ activeTabId: existing.id, docVersion: s.docVersion + 1 })
      get().addRecentFile(path)
      persistSession()
      return
    }

    // 大文件保护：检查文件大小，避免卡死编辑器。
    // fileSize 可能抛错（文件刚被删除/移动/权限不足），捕获后给提示，不阻塞。
    let size = 0
    try {
      size = await fileSize(path)
    } catch (e) {
      console.error('[openFile] fileSize failed:', e)
      get().showToast(`无法打开文件：${e}`)
      return
    }
    const MB = 1024 * 1024
    if (size > 50 * MB) {
      s.showToast('文件超过 50MB，打开可能较卡')
    } else if (size > 10 * MB) {
      // >10MB → 自绘确认弹窗（非阻塞，替换原生 window.confirm——原生模态在窗口
      // 隐藏/未就绪时会弹到不可见位置，导致渲染线程被永久阻塞、整窗像死机一样）。
      // 启动/拖拽/单实例等无人工交互路径跳过弹窗。
      if (!opts?.skipLargeConfirm) {
        const ok = await confirmLargeFile()
        if (!ok) return
      }
    }

    let content: string
    try {
      content = await readFile(path)
    } catch (e) {
      console.error('[openFile] readFile failed:', e)
      get().showToast(`读取文件失败：${e}`)
      return
    }
    const name = path.split('\\').pop()?.split('/').pop() || path
    // 走到这里且 >10MB，意味着用户已确认（或无人工交互路径跳过了确认）——
    // 以源码模式打开：不加载 Milkdown，秒开；此前弹窗文案承诺了这一点但
    // 实际仍走 WYSIWYG，属虚假承诺，这里补齐。
    const openAsSource = size > 10 * MB
    const tab: Tab = {
      id: path,
      path,
      name,
      content,
      savedContent: content,
      isDirty: false,
      sourceMode: openAsSource || undefined,
    }
    set((s2) => {
      // 并发去重：快速双击同一文件时，两次 openFile 都会越过开头的 existing 检查
      //（各自 await fileSize/readFile 期间 tabs 还是空的），插入前再查一次，
      // 否则会出现两个 id/path 完全相同的标签
      const dup = s2.tabs.find((t) => t.path === path)
      if (dup) return { activeTabId: dup.id, docVersion: s2.docVersion + 1 }
      return {
        tabs: [tab, ...s2.tabs],
        activeTabId: tab.id,
        docVersion: s2.docVersion + 1,
      }
    })
    get().addRecentFile(path)
    persistSession()
  },

  closeTab: (id) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeTabId = s.activeTabId
      if (activeTabId === id) {
        const idx = s.tabs.findIndex((t) => t.id === id)
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null
      }
      return { tabs, activeTabId, docVersion: s.docVersion + 1 }
    })
    persistSession()
  },

  closeTabs: (ids) => {
    if (ids.length === 0) return
    set((s) => {
      const closing = new Set(ids)
      const tabs = s.tabs.filter((t) => !closing.has(t.id))
      let activeTabId = s.activeTabId
      if (activeTabId && closing.has(activeTabId)) {
        // 优先激活原活动标签左侧的标签，其次右侧，最后第一个
        const idx = s.tabs.findIndex((t) => t.id === activeTabId)
        const prev = [...s.tabs.slice(0, idx)].reverse().find((t) => !closing.has(t.id))
        const next = s.tabs.slice(idx + 1).find((t) => !closing.has(t.id))
        activeTabId = prev?.id ?? next?.id ?? tabs[0]?.id ?? null
      }
      return { tabs, activeTabId, docVersion: s.docVersion + 1 }
    })
    persistSession()
  },

  /** 文件/目录被重命名后，同步已打开标签的路径与名称（含目录内已打开的文件） */
  renameTabPath: (oldPath: string, newPath: string) => {
    set((s) => {
      const sep = oldPath.includes('\\') ? '\\' : '/'
      const remap = (p: string) =>
        p === oldPath
          ? newPath
          : p.startsWith(oldPath + sep)
            ? newPath + p.slice(oldPath.length)
            : p
      return {
        tabs: s.tabs.map((t) => {
          const path = remap(t.path)
          if (path === t.path) return t
          return { ...t, path, name: path.split('\\').pop()?.split('/').pop() || path }
        }),
        activeTabId: s.activeTabId ? remap(s.activeTabId) : s.activeTabId,
      }
    })
    persistSession()
  },

  setActiveTab: (id) => {
    set((s) => ({ activeTabId: id, docVersion: s.docVersion + 1 }))
    persistSession()
  },

  updateContent: (id, content) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id)
      // 内容未变化（如同内容重复触发）→ 短路，避免重建数组引发无关订阅重渲染
      if (!tab || tab.content === content) return s
      return {
        tabs: s.tabs.map((t) =>
          t.id === id
            ? { ...t, content, isDirty: content !== t.savedContent }
            : t,
        ),
      }
    })
    // 内容变化后安排自动保存（见 scheduleAutosave：30s 防抖 + 60s 强制落盘上限）
    scheduleAutosave()
  },

  toggleSourceMode: (id) => {
    const s = get()
    const tabId = id ?? s.activeTabId
    if (!tabId) return
    const tab = s.tabs.find((t) => t.id === tabId)
    if (!tab) return
    // 大文件保护：>10MB 的文件禁止切回 WYSIWYG（Milkdown 全量 parse/渲染会
    // 冻结界面数秒以上，等于绕过 openFile 的确认弹窗）
    if (tab.sourceMode && tab.content.length > 10 * 1024 * 1024) {
      get().showToast('文件过大（>10MB），不支持切换到所见即所得模式')
      return
    }
    // 切换前收起依赖编辑器的浮层：findOpen 若滞留，源码模式下 Ctrl+F 无处
    // 显示、切回 WYSIWYG 时面板会闪现一帧又消失
    if (s.findOpen) get().closeFind()
    if (s.contextMenu) get().hideContextMenu()
    set({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, sourceMode: !t.sourceMode } : t)),
    })
  },

  saveCurrentFile: async () => {
    const s = get()
    if (!s.activeTabId) return
    // 手动保存失败给出明确反馈，而不是让 rejection 静默丢失
    try {
      await s.saveTab(s.activeTabId)
    } catch (e) {
      s.showToast(`保存失败：${e}`)
    }
  },

  /**
   * 保存指定标签的文件。
   *
   * 三个正确性保障：
   * 1. **串行化**：同一文件的两次保存（如自动保存与 Ctrl+S 撞车）排队执行。
   *    否则两个 writeFile 并发、乱序完成时，旧内容可能后写覆盖新内容。
   * 2. **竞态保护**：写盘是异步的，期间用户可能继续输入。只有磁盘写入的内容
   *    仍然是最新 content 时才清除 isDirty——否则会把「还有未保存修改」误标为已保存。
   * 3. **错误上抛**：调用方（手动保存/自动保存）各自 catch 并 toast，
   *    绝不让保存失败静默。
   */
  saveTab: async (tabId: string) => {
    const prev = _saveInflight.get(tabId) ?? Promise.resolve()
    const task = prev.catch(() => {}).then(async () => {
      const s = get()
      const tab = s.tabs.find((t) => t.id === tabId)
      if (!tab || !tab.isDirty) return
      const contentAtWrite = tab.content
      await writeFile(tab.path, contentAtWrite)
      set((s2) => ({
        tabs: s2.tabs.map((t) =>
          // content 在写盘期间又变了 → 保持 isDirty，等下一轮保存
          t.id === tabId && t.content === contentAtWrite
            ? { ...t, savedContent: contentAtWrite, isDirty: false }
            : t,
        ),
      }))
    })
    _saveInflight.set(tabId, task)
    try {
      await task
    } finally {
      if (_saveInflight.get(tabId) === task) _saveInflight.delete(tabId)
    }
  },

  addRecentFile: (path) => {
    set((s) => {
      const next = [path, ...s.recentFiles.filter((p) => p !== path)].slice(0, MAX_RECENT_FILES)
      writeRecentFiles(next)
      return { recentFiles: next }
    })
  },

  addRecentLanguage: (lang) => {
    set((s) => {
      const next = [lang, ...s.recentLanguages.filter((l) => l !== lang)].slice(0, MAX_RECENT_LANGS)
      writeRecentLangs(next)
      return { recentLanguages: next }
    })
  },

  restoreSession: async () => {
    const data = readSession()
    if (!data) return

    // 1. 恢复目录（列表异步加载，失败静默：可能已被移动/删除）
    if (data.rootPath) {
      set({ rootPath: data.rootPath, expandedDirs: new Set(data.expandedDirs) })
      try {
        const entries = await listDirectory(data.rootPath)
        set((s) => ({
          fileTree: { ...s.fileTree, [data.rootPath!]: entries },
        }))
      } catch {
        /* 目录不存在：保持 rootPath 显示，用户可重新选择 */
      }
      // 恢复上次展开的子目录内容：不加载的话这些目录重启后是
      // 「展开箭头 + 空内容」，必须折叠再展开才能看到文件
      await Promise.all(
        data.expandedDirs
          .filter((dir) => dir !== data.rootPath && dir.startsWith(data.rootPath!))
          .map(async (dir) => {
            try {
              const entries = await listDirectory(dir)
              set((s) => ({ fileTree: { ...s.fileTree, [dir]: entries } }))
            } catch {
              /* 子目录已不存在：跳过 */
            }
          }),
      )
    }

    // 2. 重新读取上次打开的文件（并行读取提速，单个失败跳过，不阻塞整体恢复）
    const sourceModePaths = new Set(data.sourceModePaths ?? [])
    const results = await Promise.all(
      data.openPaths.map(async (path): Promise<{ tab: Tab; isActive: boolean } | null> => {
        try {
          const content = await readFile(path)
          const name = path.split('\\').pop()?.split('/').pop() || path
          const tab: Tab = {
            id: path,
            path,
            name,
            content,
            savedContent: content,
            isDirty: false,
            // 恢复上次会话的源码模式；兜底：内容超 10MB 强制源码（纠正旧会话
            // 数据缺失 / 用户在别处改动导致文件变大的场景）
            sourceMode: sourceModePaths.has(path) || content.length > 10 * 1024 * 1024 || undefined,
          }
          return { tab, isActive: path === data.activePath }
        } catch {
          /* 文件不存在或读取失败：跳过 */
          return null
        }
      }),
    )
    const tabs: Tab[] = []
    let activeTabId: string | null = null
    for (const r of results) {
      if (!r) continue
      tabs.push(r.tab)
      if (r.isActive) activeTabId = r.tab.id
    }

    if (tabs.length > 0) {
      set((s) => ({
        tabs,
        activeTabId: activeTabId ?? tabs[0].id,
        docVersion: s.docVersion + 1,
      }))
    }
  },
  })),
)