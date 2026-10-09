import { useAppStore } from '../stores/useAppStore'
import { saveImageFile } from './fs'
import { isMarkdown } from '../utils/files'

/** 图片扩展名 → MIME 类型 */
export const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
}

let seq = 0

/** 去掉文件名里的非法字符。# 和 % 必须替换：文档里的相对引用按 URL 解析，
 *  `#` 后被当 fragment 截断、`%` 会被 decode 误解，都会裂图 */
function sanitizeName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|#%\s]+/g, '_').trim()
  return clean || `image-${Date.now()}`
}

/** 从 MIME 推断扩展名（剪贴板图片常没有文件名） */
function extFromMime(mime: string): string {
  const m = /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp|ico)/.exec(mime)
  if (!m) return 'png'
  const kind = m[1]
  if (kind === 'jpeg') return 'jpg'
  if (kind === 'svg+xml') return 'svg'
  return kind
}

/**
 * 把图片字节保存到「当前 Markdown 文件同目录的 <文件名>.assets」，
 * 返回可供文档引用的相对路径（如 `笔记.assets/xxx.png`）；失败返回 null。
 * 仅支持 Markdown 文档，代码文件或未打开文档时直接拒绝。
 */
export async function saveImageToAssets(
  fileName: string,
  mime: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const { tabs, activeTabId, showToast, loadDirectory } = useAppStore.getState()
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab) {
    showToast('请先打开一个 Markdown 文档再插入图片')
    return null
  }
  if (!isMarkdown(tab.path)) {
    showToast('图片仅支持插入 Markdown 文档')
    return null
  }

  const path = tab.path
  const sep = path.includes('\\') ? '\\' : '/'
  const dir = path.slice(0, path.lastIndexOf(sep) + 1)
  const namePart = path.slice(path.lastIndexOf(sep) + 1)
  const base = namePart.replace(/\.(md|markdown)$/i, '') || 'document'

  // 扩展名：优先取文件名自带，否则按 MIME 推断。
  // 无扩展名的文件名也要落 finalExt：此前整名直接用，落盘文件丢扩展名，
  // 文档引用与导出链路的「扩展名 → MIME」推断全部落空
  const dot = fileName.lastIndexOf('.')
  const nameExt = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ''
  const finalExt = /^[a-z0-9]{2,5}$/.test(nameExt) ? nameExt : extFromMime(mime)
  const stem = sanitizeName(dot > 0 ? fileName.slice(0, dot) : fileName) || 'image'
  const unique = `${Date.now()}-${seq++}-${stem}.${finalExt}`
  const absPath = `${dir}${base}.assets${sep}${unique}`

  try {
    await saveImageFile(absPath, bytes)
  } catch (e) {
    showToast(`保存图片失败：${e}`)
    return null
  }

  // 刷新文件树，让 assets 目录立刻可见
  void loadDirectory(dir.replace(/[\\/]$/, '')).catch(() => {})
  return `${base}.assets/${unique}`
}
