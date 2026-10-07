import type { ReactNode } from 'react'
import { extensionOf } from '../utils/files'

/** 通用 SVG 外壳 */
function Svg({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      {children}
    </svg>
  )
}

/** 浅色文档底 + 折角（供带字标的文件类型复用） */
function TintedDoc({ color, children }: { color: string; children: ReactNode }) {
  return (
    <>
      <path
        d="M6 3h9l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        fill={color}
        fillOpacity="0.15"
      />
      <path d="M15 3h4v4z" fill={color} fillOpacity="0.85" />
      {children}
    </>
  )
}

const SANS = 'Arial, Helvetica, sans-serif'
const MONO = 'Consolas, "SF Mono", monospace'

/* ── Python：双色蟒蛇（蓝头左上 / 黄头右下） ── */
function PythonIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <path
        d="M7.3 3.6h8.5c1.9 0 3.2 1.4 3.2 3.3v2.6"
        fill="none"
        stroke="#3776AB"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M16.7 20.4H8.2c-1.9 0-3.2-1.4-3.2-3.3v-2.6"
        fill="none"
        stroke="#FFD43B"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="8.4" cy="4.4" r="1.05" fill="#fff" stroke="#1b1b1b" strokeWidth="0.5" />
      <circle cx="11.2" cy="4.4" r="1.05" fill="#fff" stroke="#1b1b1b" strokeWidth="0.5" />
      <circle cx="15.6" cy="19.6" r="1.05" fill="#fff" stroke="#1b1b1b" strokeWidth="0.5" />
      <circle cx="12.8" cy="19.6" r="1.05" fill="#fff" stroke="#1b1b1b" strokeWidth="0.5" />
    </Svg>
  )
}

/* ── SQL：数据库圆柱 ── */
function SqlIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <path d="M5.5 5.4v10.3a6.5 2.6 0 0 0 13 0V5.4" fill="#c77d00" />
      <ellipse cx="12" cy="5.4" rx="6.5" ry="2.6" fill="#e38c00" />
      <path
        d="M5.5 9.2c0 1.44 2.91 2.6 6.5 2.6s6.5-1.16 6.5-2.6"
        fill="none"
        stroke="#f5b642"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path
        d="M5.5 13c0 1.44 2.91 2.6 6.5 2.6s6.5-1.16 6.5-2.6"
        fill="none"
        stroke="#f5b642"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </Svg>
  )
}

/* ── Markdown：文档 + M↓ ── */
function MdIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <TintedDoc color="#519aba">
        <text
          x="12"
          y="11.9"
          textAnchor="middle"
          fontSize="9.5"
          fontWeight="700"
          fill="#519aba"
          fontFamily={SANS}
        >
          M
        </text>
        <path
          d="M9.2 15.6h5.6M12 13.9v3.4M10.3 19.2L12 20.9l1.7-1.7"
          stroke="#519aba"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </TintedDoc>
    </Svg>
  )
}

/* ── JavaScript：黄色方块 + JS ── */
function JsIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.6" fill="#f1e05a" />
      <text
        x="12"
        y="15.1"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="700"
        fill="#1b1b1b"
        fontFamily={SANS}
      >
        JS
      </text>
    </Svg>
  )
}

/* ── TypeScript：蓝色方块 + TS ── */
function TsIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.6" fill="#3178c6" />
      <text
        x="12"
        y="15.1"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="700"
        fill="#fff"
        fontFamily={SANS}
      >
        TS
      </text>
    </Svg>
  )
}

/* ── HTML：橙色方块 + <> ── */
function HtmlIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.6" fill="#e34c26" />
      <text
        x="12"
        y="15.1"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="#fff"
        fontFamily={MONO}
      >
        {'<>'}
      </text>
    </Svg>
  )
}

/* ── CSS：紫色盾牌 + CSS ── */
function CssIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <path d="M12 3.2l7 2.4v5.4c0 4.3-2.9 7.5-7 9.4-4.1-1.9-7-5.1-7-9.4V5.6z" fill="#563d7c" />
      <text
        x="12"
        y="14.8"
        textAnchor="middle"
        fontSize="7.2"
        fontWeight="700"
        fill="#fff"
        fontFamily={SANS}
      >
        CSS
      </text>
    </Svg>
  )
}

/* ── JSON：文档 + {} ── */
function JsonIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <TintedDoc color="#8a7f20">
        <text
          x="12"
          y="13"
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill="#8a7f20"
          fontFamily={MONO}
        >
          {'{}'}
        </text>
      </TintedDoc>
    </Svg>
  )
}

/* ── YAML/TOML：文档 + YML ── */
function YmlIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <TintedDoc color="#cb171e">
        <text
          x="12"
          y="14.8"
          textAnchor="middle"
          fontSize="7.2"
          fontWeight="700"
          fill="#cb171e"
          fontFamily={SANS}
        >
          YML
        </text>
      </TintedDoc>
    </Svg>
  )
}

/* ── 通用文档（文本/日志/未知类型） ── */
function DocIcon({ size }: { size: number }) {
  const color = 'var(--color-text-dim)'
  return (
    <Svg size={size}>
      <path
        d="M6 3h9l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        fill={color}
        fillOpacity="0.16"
      />
      <path d="M15 3h4v4z" fill={color} fillOpacity="0.85" />
      <rect x="6.5" y="11" width="10" height="1.7" rx="0.85" fill={color} fillOpacity="0.55" />
      <rect x="6.5" y="14.6" width="6.6" height="1.7" rx="0.85" fill={color} fillOpacity="0.3" />
    </Svg>
  )
}

/** 文件小图标：每种扩展名类型用不同的形状 */
export function FileIcon({ path, size = 16 }: { path: string; size?: number }) {
  switch (extensionOf(path)) {
    case 'py':
    case 'pyw':
      return <PythonIcon size={size} />
    case 'sql':
      return <SqlIcon size={size} />
    case 'md':
    case 'markdown':
      return <MdIcon size={size} />
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
      return <JsIcon size={size} />
    case 'ts':
    case 'tsx':
      return <TsIcon size={size} />
    case 'html':
    case 'htm':
      return <HtmlIcon size={size} />
    case 'css':
    case 'scss':
      return <CssIcon size={size} />
    case 'json':
      return <JsonIcon size={size} />
    case 'yml':
    case 'yaml':
    case 'toml':
      return <YmlIcon size={size} />
    default:
      return <DocIcon size={size} />
  }
}

/** 文件夹小图标（open 时为展开状态） */
export function FolderIcon({ open = false, size = 16 }: { open?: boolean; size?: number }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} style={{ flexShrink: 0 }} aria-hidden>
        <path
          d="M4 6.5a1.5 1.5 0 0 1 1.5-1.5h3.7a1.5 1.5 0 0 1 1.06.44l.94.94h7.3a1.5 1.5 0 0 1 1.5 1.5V9H4z"
          fill="#e6b64c"
          fillOpacity="0.5"
        />
        <path
          d="M4.9 9h14.2l-2.1 6.4a1.7 1.7 0 0 1-1.62 1.1H6.62a1.7 1.7 0 0 1-1.62-1.1z"
          fill="#e6b64c"
          fillOpacity="0.92"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ flexShrink: 0 }} aria-hidden>
      <path
        d="M4 6.5a1.5 1.5 0 0 1 1.5-1.5h3.7a1.5 1.5 0 0 1 1.06.44l.94.94h7.3a1.5 1.5 0 0 1 1.5 1.5v8.62a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 17z"
        fill="#e6b64c"
        fillOpacity="0.92"
      />
    </svg>
  )
}
