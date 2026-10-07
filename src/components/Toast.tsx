import { useAppStore } from '../stores/useAppStore'

/** 全局轻提示：底部居中弹出，几秒后自动消失 */
const Toast = () => {
  const toast = useAppStore((s) => s.toast)
  const toastSeq = useAppStore((s) => s.toastSeq)

  if (!toast) return null

  return (
    <div className="mditor-toast" key={toastSeq}>
      {toast}
    </div>
  )
}

export default Toast
