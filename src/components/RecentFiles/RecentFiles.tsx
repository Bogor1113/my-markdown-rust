import { useAppStore } from '../../stores/useAppStore'
import { basenameOf, parentDirOf } from '../../utils/files'

const RecentFiles = () => {
  const recentFiles = useAppStore((s) => s.recentFiles)
  const openFile = useAppStore((s) => s.openFile)

  if (recentFiles.length === 0) return null

  return (
    <div className="mditor-recent-files">
      <p className="mditor-recent-files-title">最近文件</p>
      <ul className="mditor-recent-files-list">
        {recentFiles.map((f) => (
          <li
            key={f}
            className="mditor-recent-file-item"
            onClick={() => openFile(f)}
            title={f}
          >
            <span className="mditor-recent-file-name">{basenameOf(f)}</span>
            <span className="mditor-recent-file-path">{parentDirOf(f)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default RecentFiles