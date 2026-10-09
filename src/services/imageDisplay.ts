import { convertFileSrc } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/useAppStore'
import { parentDirOf, joinPath } from '../utils/files'
import { readFile } from './fs'

/** 是否带协议前缀（http/https/data/asset 等，不含 Windows 盘符 C:） */
function hasProtocol(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src)
}

/** 当前活动文档所在目录（未打开文档时返回 null） */
function currentDocDir(): string | null {
  const { tabs, activeTabId } = useAppStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  return tab ? parentDirOf(tab.path) : null
}

/** ASCII 分隔符路由：\ 视为 Windows 风格 */
function toAbs(src: string): string {
  const s = src.replace(/^\.\//, '')
  const dir = currentDocDir()
  if (!dir) return s
  return joinPath(dir, s)
}

/** 已注册的 SVG 图片重渲染回调（保存后统一刷新显示） */
const svgRenderers = new Set<() => void>()

/** 注册一个渲染刷新回调；返回取消注册函数（节点视图销毁时调用） */
export function registerSvgRerender(fn: () => void): () => void {
  svgRenderers.add(fn)
  return () => {
    svgRenderers.delete(fn)
  }
}

/**
 * 通知所有注册的 SVG 渲染回调重新加载最新文件内容。
 * SVG 文件被保存后调用，让编辑器中已渲染的图片立即显示新内容
 * （不依赖 asset 协议缓存，统一走 data URL，天然无缓存污染问题）。
 */
export function notifySvgRerender(): void {
  for (const fn of svgRenderers) {
    try {
      fn()
    } catch {
      /* 单个渲染回调异常不影响其余 */
    }
  }
}

/** 判断 Markdown 里的图片 src 是否指向 SVG（本地 .svg 文件或 data:image/svg+xml） */
export function isSvgSrc(src: string): boolean {
  const s = (src ?? '').trim().toLowerCase()
  if (s.startsWith('data:image/svg+xml')) return true
  // 路径结尾是 .svg，或带查询串/锚点（如 a.svg?x、a.svg#frag）
  return /\.svg(?:\?|#|$)/.test(s)
}

/**
 * 把链接/图片 src 解析为本机绝对路径；URL（http/https/data/asset 等）返回 null。
 * - 绝对路径（Windows 盘符 / UNC / 以 / 或 \ 开头）→ 原样返回
 * - asset:// 显示地址（convertFileSrc 产物）→ 还原本地绝对路径
 * - 相对路径 → 基于当前活动文档所在目录解析
 * 注意顺序：Windows 盘符（C:\...）形如「协议:」，必须先于协议判断。
 */
export function toLocalAbsPath(src: string): string | null {
  const t = (src ?? '').trim()
  if (!t) return null
  if (/^[A-Za-z]:[\\/]/.test(t) || t.startsWith('/') || t.startsWith('\\')) {
    return t.replace(/^\.\//, '')
  }
  // Windows 上 convertFileSrc 产物是 http://asset.localhost/...，其余平台为
  // asset://localhost/...（旧版）—— 两种都要还原，漏了 asset.localhost 会让
  // 「从显示地址反查本地路径」的全部链路（SVG 源码编辑、导出内联）失效。
  const asset = t.match(/^(?:asset|http):\/\/(?:asset\.)?(?:localhost|tauri\.localhost)\/(.+)$/i)
  if (asset) {
    try {
      // Mermaid 等生成的 asset 协议在 Windows 上可能用全角冒号（%EF%BC%9A）代替盘符冒号
      return decodeURIComponent(asset[1]).replace(/：/g, ':')
    } catch {
      return null
    }
  }
  if (hasProtocol(t)) return null
  return toAbs(t)
}

/**
 * 把 Markdown 里保存的图片 src 转换为编辑器 WebView 可显示的地址：
 * - URL（http/https/data: 等）→ 原样返回
 * - 绝对路径 → convertFileSrc 转成 asset 协议 URL（WebView 可加载本地文件）
 * - 相对路径（如 `笔记.assets/foo.png`）→ 基于当前文档所在目录解析为绝对路径再转换
 *
 * 背景：文档里保存的是相对路径（便于移动/分享），而 WebView 的 base 是应用
 * 自身 origin（http://localhost 或 tauri://），直接渲染相对路径必然 404 裂图。
 */
export function toDisplayImageSrc(src: string): string {
  const s = (src ?? '').trim()
  if (!s) return s

  // 注意顺序：Windows 盘符（C:\...）也形如「协议:」，必须先排除再判定 URL
  const isWindowsAbs = /^[A-Za-z]:[\\/]/.test(s)
  const isPosixAbs = s.startsWith('/') || s.startsWith('\\')
  if (!isWindowsAbs && !isPosixAbs && hasProtocol(s)) return s

  const abs = isWindowsAbs || isPosixAbs
    ? s
    : (() => {
        const dir = currentDocDir()
        if (!dir) return s
        return joinPath(dir, s.replace(/^\.\//, ''))
      })()

  try {
    return convertFileSrc(abs)
  } catch {
    // 非 Tauri 环境（纯浏览器调试）降级为原路径
    return s
  }
}

/**
 * 把 SVG 图片的 src 转成可直接显示的地址（异步）。
 *
 * 本地 .svg 文件 → 读取文本并转成 data URL：
 * - Edge 用 asset 协议显示 SVG 时，文件写入后浏览器可能命中缓存不刷新，
 *   而 data URL 每次都是全新资源，天然解决「保存后立即看到新内容」；
 * - asset 协议把 URL 的查询串当成路径一部分（查询串缓存破坏法不可靠）。
 * URL（http/https）与 data: URL → 原样返回；读取失败 → 降级为 asset 协议显示。
 */
export async function toDisplaySvgSrc(src: string): Promise<string> {
  const s = (src ?? '').trim()
  if (!s) return s
  if (/^data:image\/svg\+xml/i.test(s)) return s
  const abs = toLocalAbsPath(s)
  if (!abs) return toDisplayImageSrc(s)
  try {
    const text = await readFile(abs)
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
  } catch {
    // 文件被移动/删除：降级走原本的 asset 地址（显示占位样式）
    return toDisplayImageSrc(s)
  }
}
