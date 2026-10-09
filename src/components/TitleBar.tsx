import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * 自绘标题栏：原生装饰已关闭（tauri.conf.json decorations:false），
 * 顶部这条玻璃质感条替代系统标题栏。拖拽区 + 最小化/最大化/关闭。
 * 双击拖拽区由 Tauri 的 data-tauri-drag-region 自动处理为最大化/还原。
 *
 * 工具栏按钮通过 children 注入到标题与窗口控制按钮之间。
 */
export default function TitleBar({ children }: { children?: ReactNode }) {
  // getCurrentWindow() 每次调用返回新实例：放组件体里裸调用会让 appWindow 每次
  // 渲染都是新引用，effect 每帧重建监听；且快速连续重渲染时旧 promise 尚未
  // resolve、unlisten 未赋值就被 cleanup 跳过 → 监听器永久泄漏。useMemo 固定实例。
  const appWindow = useMemo(() => getCurrentWindow(), [])
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    const sync = () => {
      appWindow.isMaximized().then((v) => { if (!disposed) setMaximized(v) }).catch(() => {})
    }
    // onResized 在拖拽边缘调整窗口大小时每秒触发几十次，每次都发一轮
    // isMaximized() IPC 往返。最大化状态切换只在拖拽告一段落后确认即可，
    // 防抖 150ms 把事件风暴压成一次。
    const debounced = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(sync, 150)
    }
    sync()
    appWindow
      .onResized(debounced)
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => {})
    return () => {
      disposed = true
      unlisten?.()
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-drag" data-tauri-drag-region>
        <svg
          className="titlebar-logo"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="mdtitlebar-lg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#5b9dff" />
              <stop offset="1" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <rect
            x="1.5"
            y="1.5"
            width="21"
            height="21"
            rx="6"
            fill="url(#mdtitlebar-lg)"
            fillOpacity="0.22"
            stroke="url(#mdtitlebar-lg)"
            strokeWidth="1.4"
          />
          <path
            d="M6.2 16.5v-9h1.9l3.9 5 3.9-5h1.9v9h-2v-5.6l-3.8 4.9-3.8-4.9v5.6z"
            fill="url(#mdtitlebar-lg)"
          />
        </svg>
        <span className="titlebar-title" data-tauri-drag-region>
          MyMdEdit
        </span>
        <span className="titlebar-sub" data-tauri-drag-region>
          波哥自研
        </span>
      </div>

      {children}

      <div className="titlebar-controls">
        <button className="titlebar-btn" title="最小化" onClick={() => appWindow.minimize()}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        <button
          className="titlebar-btn"
          title={maximized ? '向下还原' : '最大化'}
          onClick={() => appWindow.toggleMaximize()}
        >
          {maximized ? (
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <rect x="2.2" y="3.6" width="6.2" height="6.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.1" />
              <path d="M4.2 3.6V2.6a1 1 0 0 1 1-1h4.2a1 1 0 0 1 1 1V6.8a1 1 0 0 1-1 1h-1" fill="none" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <rect x="2.4" y="2.4" width="7.2" height="7.2" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          )}
        </button>

        <button className="titlebar-btn close" title="关闭" onClick={() => appWindow.close()}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}