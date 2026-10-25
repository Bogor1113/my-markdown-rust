/// 新建 Markdown 文件的统一入口。
///
/// 三个地方要「新建文件」：托盘菜单（Rust 广播 tray-new-file）、Ctrl+N、
/// 命令面板。三处各写一遍的话，文件名校验规则和「创建后刷新文件树并打开」
/// 的顺序很容易只改到其中一处，所以统一收敛到这里。
///
/// 文件固定落在**工作区根目录**（与侧边栏右键菜单的默认行为一致）；
/// 指定子目录新建仍走 TreeContextMenu。

import { useAppStore } from '../stores/useAppStore'
import { createFile } from './fs'
import { joinPath, basenameOf } from '../utils/files'

/** 新建文件名校验：与侧边栏右键菜单保持同一套规则 */
export const validateNewFileName = (value: string): string | null => {
  const v = value.trim()
  if (!v) return '文件名不能为空'
  if (/[\\/:*?"<>|]/.test(v)) return '文件名不能包含 \\ / : * ? " < > |'
  if (v.startsWith('.')) return '文件不能以 . 开头'
  const dot = v.lastIndexOf('.')
  if (dot > 0) {
    const ext = v.slice(dot + 1).toLowerCase()
    if (ext && ext !== 'md' && ext !== 'markdown') return '仅支持 .md / .markdown 格式'
  }
  return null
}

/** 弹出「新建文件」对话框并在工作区根目录创建 .md */
export function promptNewMarkdownFile(): void {
  const s = useAppStore.getState()
  const root = s.rootPath
  if (!root) {
    s.showToast('请先在应用内打开一个文件夹')
    return
  }
  s.openPrompt({
    title: '新建文件',
    fields: [
      {
        id: 'name',
        label: '文件名',
        placeholder: '如 note（自动补 .md）',
        validate: validateNewFileName,
      },
    ],
    confirmLabel: '创建',
    onConfirm: (v) => {
      const raw = v.name.trim()
      const name = /\.(md|markdown)$/i.test(raw) ? raw : `${raw}.md`
      const target = joinPath(root, name)
      void (async () => {
        try {
          await createFile(target)
          s.showToast(`已创建 ${basenameOf(target)}`)
          // 刷新文件树并打开新文件
          await s.loadDirectory(root).catch(() => {})
          await s.openFile(target)
        } catch (e) {
          s.showToast(`创建文件失败：${e}`)
        }
      })()
    },
  })
}
