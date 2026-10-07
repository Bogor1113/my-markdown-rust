import type { FileEntry } from '../../types'
import { useAppStore } from '../../stores/useAppStore'
import { isOpenableFile } from '../../utils/files'
import { FileIcon, FolderIcon } from '../FileIcon'

interface Props {
  entry: FileEntry
  depth: number
}

const TreeNode = ({ entry, depth }: Props) => {
  const expandedDirs = useAppStore((s) => s.expandedDirs)
  const fileTree = useAppStore((s) => s.fileTree)
  const toggleExpand = useAppStore((s) => s.toggleExpand)
  const openFile = useAppStore((s) => s.openFile)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const showTreeMenu = useAppStore((s) => s.showTreeMenu)

  const isExpanded = expandedDirs.has(entry.path)
  const children = fileTree[entry.path] ?? []
  const isActive = activeTabId === entry.path

  if (entry.isDir) {
    return (
      <div>
        <button
          className={`group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] transition-colors hover:bg-white/5 ${
            isExpanded ? 'font-medium' : ''
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          onClick={() => toggleExpand(entry.path)}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            showTreeMenu({
              x: e.clientX,
              y: e.clientY,
              path: entry.path,
              name: entry.name,
              isDir: true,
            })
          }}
          title={entry.path}
        >
          <span className={`text-[10px] text-[var(--color-text-secondary)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
          <FolderIcon open={isExpanded} size={15} />
          <span className="truncate text-[var(--color-text)]">{entry.name}</span>
        </button>
        {isExpanded && (
          <div>
            {children.map((child) => (
              <TreeNode key={child.path} entry={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  const handleClick = () => {
    if (isOpenableFile(entry.extension)) {
      openFile(entry.path)
    }
  }

  return (
    <button
      className={`group relative flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] text-[var(--color-text)] transition-colors hover:bg-white/5 ${
        isActive ? 'mditor-tree-active' : ''
      } ${isOpenableFile(entry.extension) ? '' : 'opacity-50'}`}
      style={{ paddingLeft: `${depth * 14 + 22}px` }}
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        showTreeMenu({
          x: e.clientX,
          y: e.clientY,
          path: entry.path,
          name: entry.name,
          isDir: false,
        })
      }}
      title={entry.path}
    >
      <FileIcon path={entry.path} size={15} />
      <span className="truncate">{entry.name}</span>
    </button>
  )
}

export default TreeNode
