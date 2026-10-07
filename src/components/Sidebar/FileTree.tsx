import { useAppStore } from '../../stores/useAppStore'
import { pickFolder } from '../../services/fs'
import TreeNode from './TreeNode'
import { FolderIcon } from '../FileIcon'

const FileTree = () => {
  const rootPath = useAppStore((s) => s.rootPath)
  const fileTree = useAppStore((s) => s.fileTree)
  const setRootPath = useAppStore((s) => s.setRootPath)
  const loadDirectory = useAppStore((s) => s.loadDirectory)
  const showTreeMenu = useAppStore((s) => s.showTreeMenu)

  const handleOpenFolder = async () => {
    const dir = await pickFolder()
    if (!dir) return
    setRootPath(dir)
    await loadDirectory(dir)
  }

  const rootEntries = rootPath ? (fileTree[rootPath] ?? []) : []

  const rootName = rootPath
    ? rootPath.split('\\').pop()?.split('/').pop() || rootPath
    : ''

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2 bg-[var(--color-bg)]/40">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[13px] font-semibold text-[var(--color-text)]">
          <FolderIcon size={15} />
          <span className="mditor-panel-title truncate">{rootName || '文件'}</span>
        </span>
        <button
          className="rounded-md p-1 text-[var(--color-text-secondary)] transition-colors hover:bg-white/10 hover:text-[var(--color-text)]"
          onClick={handleOpenFolder}
          title="打开文件夹"
        >
          <FolderIcon open size={15} />
        </button>
      </div>

      {/* 树内容（空白处右键 → 在根目录新建） */}
      <div
        className="flex-1 overflow-y-auto py-1"
        onContextMenu={(e) => {
          e.preventDefault()
          if (!rootPath) return
          showTreeMenu({
            x: e.clientX,
            y: e.clientY,
            path: rootPath,
            name: rootName || '文件',
            isDir: true,
            isRoot: true,
          })
        }}
      >
        {!rootPath && (
          <div className="mditor-sidebar-empty flex h-full flex-col items-center justify-center gap-3 px-4 text-center select-none">
            <p className="text-[13px] text-[var(--color-text-secondary)]">
              打开一个文件夹以浏览文件
            </p>
            <button
              className="mditor-primary-btn rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-[13px] text-white transition-colors hover:bg-[var(--color-accent-hover)]"
              onClick={handleOpenFolder}
            >
              打开文件夹
            </button>
          </div>
        )}
        {rootPath && rootEntries.length === 0 && (
          <p className="px-4 py-2 text-[12px] text-[var(--color-text-dim)]">
            文件夹为空
          </p>
        )}
        {rootEntries.map((entry) => (
          <TreeNode key={entry.path} entry={entry} depth={0} />
        ))}
      </div>
    </div>
  )
}

export default FileTree