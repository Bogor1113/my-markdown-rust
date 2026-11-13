/**
 * 主题系统：与 MyTerm 完全同源的一套界面调色板。
 *
 * 设计目标：两个软件的「主题」是同一批主题、同一批颜色 —— 在 MyTerm 里选
 * 「深蓝（默认）」，MyMd 里也是同样的深蓝；选 Dracula / Nord / Solarized 时
 * 两边的底色、强调色、语义色一致，切换后不会出现"一个偏蓝一个偏紫"的割裂感。
 *
 * 实现方式：由「主背景色 + 强调色」派生出全部界面层级（面板、边框、文字、
 * 玻璃层、语义色…），因此新增主题只要给 2~4 个基准色即可。
 *
 * 应用方式：applyMdTheme(id) 把派生结果写成 `--color-*` CSS 变量（内联到
 * <html>），同时把 data-theme 归为 light / dark 两个家族标记（导出、mermaid
 * 等只关心明暗的地方继续可用）。
 */

export interface MdPalette {
  /** 主背景 */
  bg: string;
  /** 抬升面（卡片 / 输入框 / 菜单 / 代码块底） */
  bgElev: string;
  /** 面板底色（侧栏 / 工具栏） */
  bgPanel: string;
  /** 悬停态 */
  bgHover: string;
  /** 激活 / 选中态 */
  bgActive: string;
  /** 常规边框 */
  border: string;
  /** 高对比边框（输入聚焦 / 分隔强调） */
  borderBright: string;
  /** 主文字 */
  text: string;
  /** 次要文字 */
  textSecondary: string;
  /** 极弱文字（占位符 / 禁用） */
  textDim: string;
  /** 强调色 */
  accent: string;
  /** 强调色悬停 */
  accentHover: string;
  /** 强调色半透明泛光 */
  accentGlow: string;
  /** 未保存标记色 */
  dirty: string;
  /** 明暗家族 */
  kind: 'light' | 'dark';
}

export interface MdThemeItem {
  id: string;
  name: string;
  kind: 'light' | 'dark';
  icon: string;
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** 整体加减亮度（生成抬升面 / 边框层级）。纯黑底需要更大偏移才看得出来 */
function shift(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const boost = luminance(hex) < 0.06 ? 1.55 : 1;
  const a = amt * boost;
  return rgbToHex(r + a, g + a, b + a);
}

/** 两色线性混合，t=0 取 a，t=1 取 b */
function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/** 感知亮度（0~1），用于判定明暗 */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** 由基准色派生全套界面配色 */
function makePalette(opts: {
  bg: string;
  text: string;
  accent: string;
  /** 强调色第二色停（仅用于 accentHover 的偏色，可省略） */
  accent2?: string;
  /** 警告色（未保存圆点等语义色，与 MyTerm 同名主题一致） */
  warn?: string;
  accentRgb: string;
}): MdPalette {
  const { bg, text, accent, accentRgb } = opts;
  const isLight = luminance(bg) > 0.5;
  // 深色主题：抬升面比背景亮；浅色主题：比背景暗
  const dir = isLight ? -1 : 1;
  return {
    bg,
    bgElev: shift(bg, dir * 8),
    bgPanel: shift(bg, dir * 5),
    bgHover: shift(bg, dir * 14),
    bgActive: shift(bg, dir * 20),
    border: shift(bg, dir * 26),
    borderBright: shift(bg, dir * 40),
    text,
    textSecondary: mix(text, bg, isLight ? 0.42 : 0.38),
    textDim: mix(text, bg, isLight ? 0.64 : 0.60),
    accent,
    accentHover: mix(accent, isLight ? '#000000' : '#ffffff', 0.24),
    accentGlow: `rgba(${accentRgb}, ${isLight ? 0.10 : 0.14})`,
    // 未保存圆点：用主题的警示色（与 MyTerm 同名主题一致）
    dirty: opts.warn ?? '#fbbf24',
    kind: isLight ? 'light' : 'dark',
  };
}

/** 各主题的界面调色板（id 与 MyTerm 保持一致，切换后两边观感相同） */
export const MD_PALETTES: Record<string, MdPalette> = {
  ocean: makePalette({
    bg: '#0e1116',
    text: '#d6dae2',
    accent: '#4f8cff',
    accent2: '#7a5cff',
    warn: '#d29922',
    accentRgb: '79, 140, 255',
  }),
  windterm: makePalette({
    bg: '#1c1c1c',
    text: '#e8e8e2',
    accent: '#819aff',
    accentRgb: '129, 154, 255',
  }),
  'classic-green': makePalette({
    bg: '#000000',
    text: '#33ff33',
    accent: '#33ff33',
    warn: '#ffff00',
    accentRgb: '51, 255, 51',
  }),
  light: makePalette({
    bg: '#f5f6f7',
    text: '#333333',
    accent: '#0451a5',
    accent2: '#2b7dd6',
    warn: '#bbb400',
    accentRgb: '4, 81, 165',
  }),
  'solarized-dark': makePalette({
    bg: '#002b36',
    text: '#93a1a1',
    accent: '#268bd2',
    accent2: '#b58900',
    warn: '#b58900',
    accentRgb: '38, 139, 210',
  }),
  dracula: makePalette({
    bg: '#282a36',
    text: '#f8f8f2',
    accent: '#bd93f9',
    accent2: '#f1fa8c',
    warn: '#f1fa8c',
    accentRgb: '189, 147, 249',
  }),
  gruvbox: makePalette({
    bg: '#282828',
    text: '#ebdbb2',
    accent: '#b8bb26',
    accent2: '#fabd2f',
    warn: '#fabd2f',
    accentRgb: '184, 187, 38',
  }),
  nord: makePalette({
    bg: '#2e3440',
    text: '#d8dee9',
    accent: '#88c0d0',
    accent2: '#ebcb8b',
    warn: '#ebcb8b',
    accentRgb: '136, 192, 208',
  }),
};

/** 主题注册表：与 MyTerm 的主题列表一一对应（名称、明暗、图标均一致） */
export const MD_THEMES: MdThemeItem[] = [
  { id: 'ocean', name: '深蓝（默认）', kind: 'dark', icon: '🌊' },
  { id: 'windterm', name: 'WindTerm', kind: 'dark', icon: '🪟' },
  { id: 'classic-green', name: '经典绿', kind: 'dark', icon: '💚' },
  { id: 'light', name: '明亮', kind: 'light', icon: '☀️' },
  { id: 'solarized-dark', name: 'Solarized Dark', kind: 'dark', icon: '🌅' },
  { id: 'dracula', name: 'Dracula', kind: 'dark', icon: '🧛' },
  { id: 'gruvbox', name: 'Gruvbox Dark', kind: 'dark', icon: '🍂' },
  { id: 'nord', name: 'Nord', kind: 'dark', icon: '❄️' },
];

/** 旧版本主题 id → 新主题 id（老用户 localStorage 里存的旧 id 平滑迁移） */
export const LEGACY_THEME_MAP: Record<string, string> = {
  dark: 'ocean',
  midnight: 'ocean',
  dusk: 'gruvbox',
  graphite: 'nord',
  paper: 'light',
};

export const DEFAULT_THEME = MD_THEMES[0].id

/** 主题记忆的 localStorage 键（store 与启动引导共用） */
export const THEME_STORAGE_KEY = 'mditor-theme'

/**
 * 启动引导：在 React 渲染前把上次选择的主题注入 CSS 变量，
 * 避免"打开软件先闪一下默认色、切主题才生效"。
 */
export function bootstrapMdTheme(): string {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  const migrated = saved ? (LEGACY_THEME_MAP[saved] ?? saved) : DEFAULT_THEME
  const id = MD_PALETTES[migrated] ? migrated : DEFAULT_THEME
  applyMdTheme(id)
  return id
};

/** 把主题写进 <html> 的 CSS 变量 + data-theme 明暗标记 */
export function applyMdTheme(id: string): void {
  const p = MD_PALETTES[id] ?? MD_PALETTES[DEFAULT_THEME];
  if (!p) return;
  const root = document.documentElement;
  const vars: Record<string, string> = {
    '--color-bg': p.bg,
    '--color-bg-alt': p.bgElev,
    '--color-bg-sidebar': p.bgPanel,
    '--color-bg-toolbar': p.bgPanel,
    '--color-bg-tab': p.bgHover,
    '--color-bg-tab-active': p.bg,
    '--color-border': p.border,
    '--color-border-bright': p.borderBright,
    '--color-text': p.text,
    '--color-text-secondary': p.textSecondary,
    '--color-text-dim': p.textDim,
    '--color-text-muted': p.textDim,
    '--color-accent': p.accent,
    '--color-accent-hover': p.accentHover,
    '--color-accent-glow': p.accentGlow,
    '--color-dirty': p.dirty,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  // data-theme 只保留明暗两族：导出、mermaid 等按明暗分流的地方继续可用
  root.dataset.theme = p.kind;
  root.dataset.themeId = id;
}
