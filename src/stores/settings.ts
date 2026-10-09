import { create } from 'zustand'

const FONT_SIZE_KEY = 'mditor-font-size'
const AUTO_SAVE_KEY = 'mditor-auto-save'
const SPELLCHECK_KEY = 'mditor-spellcheck'
const HEADING_NUMBERING_KEY = 'mditor-heading-numbering'
const ATMOS_MOTION_KEY = 'mditor-atmos-motion'

export interface SettingsState {
  /** 编辑器字号（px） */
  fontSize: number
  setFontSize: (size: number) => void

  /** 自动保存开关 */
  autoSave: boolean
  setAutoSave: (on: boolean) => void

  /** 拼写检查开关 */
  spellcheck: boolean
  setSpellcheck: (on: boolean) => void

  /** 标题自动编号 */
  headingNumbering: boolean
  setHeadingNumbering: (on: boolean) => void

  /**
   * 背景氛围动效（光晕漂移 + 呼吸）。
   * 默认关闭：该层铺满整个视口，标题栏/工具栏/状态栏/侧栏又叠了
   * backdrop-filter 玻璃模糊，背景每帧变化会让合成器每帧重算全宽模糊，
   * 空闲静止时也持续占用 10%+ CPU。仅在用户显式开启后才运行动画。
   */
  atmosMotion: boolean
  setAtmosMotion: (on: boolean) => void

  /** 设置弹窗可见性（含当前激活的设置标签页） */
  settingsOpen: boolean
  settingsTab: 'general' | 'shortcuts'
  openSettings: (tab?: 'general' | 'shortcuts') => void
  closeSettings: () => void
}

function loadNumber(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return fallback
    const n = Number(v)
    // 损坏值（NaN/非数字串）回退默认：否则 fontSize=NaN 后 Math.max/min 链
    // 无法自愈，字号调节从此失灵
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

function loadBoolean(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v !== null ? v === 'true' : fallback
  } catch {
    return fallback
  }
}

/**
 * 把编辑器字号写入全局 CSS 变量。
 * index.css 中 .ProseMirror 与 .code-editor .cm-content 都消费
 * var(--editor-font-size)，因此两处编辑器（所见即所得 + 源码模式）字号联动。
 */
function applyFontSize(size: number) {
  document.documentElement.style.setProperty('--editor-font-size', `${size}px`)
}

/**
 * 背景氛围动效开关：用 body.atmos-animated 类决定是否运行动画。
 * 关闭后背景光晕保持静态（渐变效果照旧，只是不再漂移/呼吸），
 * 空闲时合成器无需反复重算 backdrop-filter 模糊，CPU 占用回落至接近 0。
 */
function applyAtmosMotion(on: boolean) {
  const toggle = () => document.body.classList.toggle('atmos-animated', on)
  if (document.body) toggle()
  else document.addEventListener('DOMContentLoaded', toggle, { once: true })
}

/** 启动时先应用一次持久化的字号（设置弹窗未打开时也要生效） */
applyFontSize(loadNumber(FONT_SIZE_KEY, 15))
/** 启动时应用氛围动效开关：默认关闭，避免空闲状态持续占用 CPU */
applyAtmosMotion(loadBoolean(ATMOS_MOTION_KEY, false))

export const useSettingsStore = create<SettingsState>((set) => ({
  // 启动加载同样夹紧到合法区间（set 路径有 clamp，load 路径之前没有：
  // 存过 "99" 的旧数据会直接以 99px 应用）
  fontSize: Math.max(10, Math.min(32, loadNumber(FONT_SIZE_KEY, 15))),
  setFontSize: (size) => {
    const clamped = Math.max(10, Math.min(32, size))
    localStorage.setItem(FONT_SIZE_KEY, String(clamped))
    applyFontSize(clamped)
    set({ fontSize: clamped })
  },

  autoSave: loadBoolean(AUTO_SAVE_KEY, true),
  setAutoSave: (on) => {
    localStorage.setItem(AUTO_SAVE_KEY, String(on))
    set({ autoSave: on })
  },

  spellcheck: loadBoolean(SPELLCHECK_KEY, false),
  setSpellcheck: (on) => {
    localStorage.setItem(SPELLCHECK_KEY, String(on))
    set({ spellcheck: on })
  },

  headingNumbering: loadBoolean(HEADING_NUMBERING_KEY, false),
  setHeadingNumbering: (on) => {
    localStorage.setItem(HEADING_NUMBERING_KEY, String(on))
    document.documentElement.dataset.headingNumbering = String(on)
    set({ headingNumbering: on })
  },

  atmosMotion: loadBoolean(ATMOS_MOTION_KEY, false),
  setAtmosMotion: (on) => {
    localStorage.setItem(ATMOS_MOTION_KEY, String(on))
    applyAtmosMotion(on)
    set({ atmosMotion: on })
  },

  settingsOpen: false,
  settingsTab: 'general',
  openSettings: (tab) => set({ settingsOpen: true, settingsTab: tab ?? 'general' }),
  closeSettings: () => set({ settingsOpen: false }),
}))
