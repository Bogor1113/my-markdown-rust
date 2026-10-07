import { useEffect, useRef } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { useAppStore } from '../../stores/useAppStore'
import {
  createFile,
  createDirectory,
  renamePath,
  deletePath,
  listDirectory,
} from '../../services/fs'
import { joinPath, parentDirOf, basenameOf } from '../../utils/files'
import { builtinTemplates, getTemplateContent } from '../../lib/templates'

interface MenuItem {
  label: string
  action: () => void
  sep?: boolean
}

const TreeContextMenu = () => {
  const treeMenu = useAppStore((s) => s.treeMenu)
  const hideTreeMenu = useAppStore((s) => s.hideTreeMenu)
  const showToast = useAppStore((s) => s.showToast)
  const rootPath = useAppStore((s) => s.rootPath)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击菜单外 / Esc / 滚动 / 失焦 → 关闭菜单
  useEffect(() => {
    if (!treeMenu) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) hideTreeMenu()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideTreeMenu()
    }
    const onOther = () => hideTreeMenu()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onOther, true)
    window.addEventListener('blur', onOther)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onOther, true)
      window.removeEventListener('blur', onOther)
    }
  }, [treeMenu, hideTreeMenu])

  if (!treeMenu) return null

  const { x, y, path, name, isDir, isRoot } = treeMenu
  const sep = path.includes('\\') ? '\\' : '/'

  /** 刷新指定目录的列表缓存 */
  const refreshDir = async (dir: string) => {
    try {
      const entries = await listDirectory(dir)
      useAppStore.setState((s) => ({ fileTree: { ...s.fileTree, [dir]: entries } }))
    } catch {
      /* ignore */
    }
  }

  /** 文件名/文件夹名校验：非空、无非法字符（拒绝路径分隔符等） */
  const nameValidate = (label: string) => (value: string) => {
    const v = value.trim()
    if (!v) return `${label}不能为空`
    if (/[\\/:*?"<>|]/.test(v)) return `${label}不能包含 \\ / : * ? " < > |`
    return null
  }

  /**
   * 新建文件：仅允许 .md / .markdown 格式（用户明确要求"限制死"）。
   * 无扩展名自动补 .md；填了别的扩展名直接拒绝。
   */
  const handleCreateFile = () => {
    useAppStore.getState().openPrompt({
      title: '新建文件',
      fields: [
        {
          id: 'name',
          label: '文件名',
          placeholder: '如 note（自动补 .md）',
          validate: (value) => {
            const err = nameValidate('文件名')(value)
            if (err) return err
            const v = value.trim()
            if (v.startsWith('.')) return '文件不能以 . 开头'
            const dot = v.lastIndexOf('.')
            if (dot > 0) {
              const ext = v.slice(dot + 1).toLowerCase()
              if (ext && ext !== 'md' && ext !== 'markdown') return '仅支持 .md / .markdown 格式'
            }
            return null
          },
        },
      ],
      confirmLabel: '创建',
      onConfirm: (v) => {
        const raw = v.name.trim()
        // 无扩展名自动补 .md（满足"只能是 md 格式"）
        const name = /\.(md|markdown)$/i.test(raw) ? raw : `${raw}.md`
        const target = joinPath(path, name)
        void (async () => {
          try {
            await createFile(target)
            showToast(`已创建 ${basenameOf(target)}`)
            await refreshDir(path)
          } catch (e) {
            showToast(`创建文件失败：${e}`)
          }
        })()
      },
    })
  }

  const handleCreateFolder = () => {
    useAppStore.getState().openPrompt({
      title: '新建文件夹',
      fields: [{ id: 'name', label: '文件夹名', placeholder: '如 我的笔记', validate: nameValidate('文件夹名') }],
      confirmLabel: '创建',
      onConfirm: (v) => {
        const input = v.name.trim()
        if (!input) return
        const target = joinPath(path, input)
        void (async () => {
          try {
            await createDirectory(target)
            showToast(`已创建文件夹 ${basenameOf(target)}`)
            await refreshDir(path)
          } catch (e) {
            showToast(`创建文件夹失败：${e}`)
          }
        })()
      },
    })
  }

  const handleCreateFromTemplate = () => {
    useAppStore.getState().openPrompt({
      title: '从模板新建',
      fields: [
        {
          id: 'template',
          label: '选择模板',
          defaultValue: builtinTemplates[0]?.id ?? '',
          datalist: builtinTemplates.map((t) => t.id),
        },
        {
          id: 'name',
          label: '文件名',
          placeholder: '如 my-note（自动补 .md）',
          validate: (value) => {
            const err = nameValidate('文件名')(value)
            if (err) return err
            const v = value.trim()
            if (v.startsWith('.')) return '文件不能以 . 开头'
            const dot = v.lastIndexOf('.')
            if (dot > 0) {
              const ext = v.slice(dot + 1).toLowerCase()
              if (ext && ext !== 'md' && ext !== 'markdown') return '仅支持 .md / .markdown 格式'
            }
            return null
          },
        },
      ],
      confirmLabel: '创建',
      onConfirm: (v) => {
        const raw = v.name.trim()
        const name = /\.(md|markdown)$/i.test(raw) ? raw : `${raw}.md`
        const target = joinPath(path, name)
        const content = getTemplateContent(v.template) ?? ''
        void (async () => {
          try {
            await createFile(target, content)
            showToast(`已从模板创建 ${basenameOf(target)}`)
            await refreshDir(path)
          } catch (e) {
            showToast(`创建文件失败：${e}`)
          }
        })()
      },
    })
  }

  const handleRename = () => {
    useAppStore.getState().openPrompt({
      title: '重命名',
      fields: [{ id: 'name', label: '新名称', defaultValue: name, validate: nameValidate('名称') }],
      confirmLabel: '重命名',
      onConfirm: (v) => {
        const input = v.name.trim()
        if (!input || input.trim() === name) return
        const target = joinPath(parentDirOf(path), input.trim())
        void (async () => {
          try {
            await renamePath(path, target)
            if (path === rootPath) {
              // 重命名的是根目录：重置为新的根路径并重新加载
              const { setRootPath, loadDirectory } = useAppStore.getState()
              useAppStore.setState({ fileTree: {}, expandedDirs: new Set() })
              setRootPath(target)
              await loadDirectory(target).catch(() => {})
            } else {
              useAppStore.getState().renameTabPath(path, target)
              await refreshDir(parentDirOf(path))
            }
            showToast('重命名成功')
          } catch (e) {
            showToast(`重命名失败：${e}`)
          }
        })()
      },
    })
  }

  const handleDelete = async () => {
    const kind = isDir ? '文件夹' : '文件'
    const ok = await ask(`确定删除${kind}「${name}」？将移入系统回收站，可从回收站恢复。`, {
      title: '删除确认',
      kind: 'warning',
      okLabel: '删除',
      cancelLabel: '取消',
    })
    if (!ok) return
    try {
      const { recycled } = await deletePath(path)
      // 关闭与该路径相关的已打开标签
      const { tabs, closeTabs, setRootPath } = useAppStore.getState()
      const ids = tabs
        .filter((t) => t.path === path || t.path.startsWith(path + sep))
        .map((t) => t.id)
      closeTabs(ids)
      if (path === rootPath) {
        setRootPath(null)
        useAppStore.setState({ fileTree: {}, expandedDirs: new Set() })
      } else {
        await refreshDir(parentDirOf(path))
      }
      showToast(
        recycled
          ? `已移入回收站：${name}`
          : `已删除：${name}（回收站不可用，已直接删除）`,
      )
    } catch (e) {
      showToast(`删除失败：${e}`)
    }
  }

  const items: MenuItem[] = []
  if (isDir) {
    items.push({ label: '新建文件', action: () => void handleCreateFile() })
    items.push({ label: '新建文件夹', action: () => void handleCreateFolder() })
    items.push({ label: '从模板新建', action: () => void handleCreateFromTemplate() })
  }
  if (!isRoot) {
    if (isDir) items.push({ label: '', action: () => {}, sep: true })
    items.push({ label: '重命名', action: () => void handleRename() })
    items.push({ label: '删除', action: () => void handleDelete() })
  }

  return (
    <div
      ref={menuRef}
      className="mditor-context-menu"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.sep ? (
          <div key={i} className="mditor-menu-sep" />
        ) : (
          <div
            key={i}
            className="mditor-menu-item"
            onClick={() => {
              hideTreeMenu()
              item.action()
            }}
          >
            <span className="mditor-menu-label">{item.label}</span>
          </div>
        ),
      )}
    </div>
  )
}

export default TreeContextMenu
