import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { FileEntry, SearchResult } from '../types'
import { isMarkdown } from '../utils/files'

/** 弹出文件夹选择对话框 */
export async function pickFolder(): Promise<string | null> {
  const dir = await open({ directory: true, multiple: false })
  return dir as string | null
}

/** 弹出图片选择对话框，返回单个文件路径 */
export async function pickImage(): Promise<string | null> {
  const file = await open({
    multiple: false,
    filters: [
      { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  })
  return typeof file === 'string' ? file : null
}

/** 读取文件内容 */
export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path })
}

/** 字节数组 → base64（分块拼接：一次展开过多参数会让 String.fromCharCode 栈溢出） */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** base64 → 字节数组 */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * 读取二进制文件内容（图片等）。
 *
 * 走 base64 通道（read_file_b64）而不是旧的 Vec<u8>：后者经 Tauri 的 JSON IPC
 * 会展开成数字数组——5MB 图片 ≈ 500 万个整数的 JSON 文本 + JS 侧同规模 number[]，
 * 内存峰值放大近十倍，是插图/导出卡顿的主因。base64 只膨胀 33%。
 */
export async function readFileBytes(path: string): Promise<Uint8Array> {
  const b64 = await invoke<string>('read_file_b64', { path })
  return base64ToBytes(b64)
}

/** 写入二进制文件（图片等），自动创建父目录；同样走 base64 通道 */
export async function saveImageFile(path: string, bytes: Uint8Array): Promise<void> {
  await invoke('save_image_b64', { path, data: bytesToBase64(bytes) })
}

/** 写入任意二进制文件到指定路径（自动创建父目录，底层复用 base64 写盘命令） */
export async function writeFileBytes(path: string, bytes: Uint8Array): Promise<void> {
  await invoke('save_image_b64', { path, data: bytesToBase64(bytes) })
}

/** 写入文件内容 */
export async function writeFile(path: string, content: string): Promise<void> {
  return invoke<void>('write_file', { path, content })
}

/** 列出目录内容（应用仅支持 Markdown 编辑，只返回目录与 .md/.markdown 文件） */
export async function listDirectory(path: string): Promise<FileEntry[]> {
  const entries = await invoke<FileEntry[]>('list_directory', { path })
  return entries.filter((e) => e.isDir || isMarkdown(e.path))
}

/** 创建空文件 */
export async function createFile(path: string, content?: string): Promise<void> {
  await invoke('create_file', { path, content: content ?? null })
}

/** 创建目录 */
export async function createDirectory(path: string): Promise<void> {
  await invoke('create_directory', { path })
}

/** 重命名文件或目录 */
export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  await invoke('rename_path', { oldPath, newPath })
}

/**
 * 删除文件或目录。
 * 优先移入系统回收站（Windows SHFileOperationW + FOF_ALLOWUNDO）；
 * 回收站不可用（如网络驱动器、文件被占用）时退化为永久删除，
 * 返回 `recycled` 告知实际行为，调用方据此给出不同提示。
 */
export async function deletePath(path: string): Promise<{ recycled: boolean }> {
  return invoke<{ recycled: boolean }>('delete_path', { path })
}

/** 同步未保存文件列表到 Rust（窗口关闭确认使用） */
export async function syncDirtyFiles(files: string[]): Promise<void> {
  await invoke('set_dirty_files', { files })
}

/** 取走并清空启动时命令行传入的待打开文件列表（双击 .md 文件打开场景） */
export async function takePendingOpenFiles(): Promise<string[]> {
  return invoke<string[]>('take_pending_open_files')
}

/** 获取文件大小（字节），用于大文件保护判断 */
export async function fileSize(path: string): Promise<number> {
  return invoke<number>('file_size', { path })
}

/** 跨文件全局搜索 */
export async function searchFiles(root: string, query: string, maxResults?: number): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_files', { root, query, maxResults })
}

/** 跨文件批量替换 */
export async function replaceFiles(root: string, query: string, replacement: string): Promise<{ path: string; count: number }[]> {
  return invoke<{ path: string; count: number }[]>('replace_files', { root, query, replacement })
}