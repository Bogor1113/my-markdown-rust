import { useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import AppLayout from './components/Layout/AppLayout'
import { syncDirtyFiles, takePendingOpenFiles, createFile } from './services/fs'
import { setupFsWatcher, watchDirectory, stopWatching } from './services/watcher'
import { useAppStore } from './stores/useAppStore'
import { useSettingsStore } from './stores/settings'
import { useShortcutsStore } from './stores/shortcuts'
import { joinPath, basenameOf } from './utils/files'

/** 待打开文件 Promise：模块级缓存，StrictMode 双挂载时两个 effect 运行共享同一 Promise，
 *  避免第一次运行取走文件列表后被 cancelled 丢弃、第二次运行拿到空列表 */
let pendingFilesPromise: Promise<string[]> | null = null

function App() {
  /** 会话恢复 Promise：多个启动流程共享，保证只恢复一次、不互相覆盖 */
  const sessionRef = useRef<Promise<void> | null>(null)

  // 窗口创建即显示（visible: true），背景色 backgroundColor 已兜底防白屏，
  // 避免「隐藏窗口再 show()」在 Windows WebView2 上造成的输入命中失效问题。
  useEffect(() => {
    getCurrentWindow()
      .show()
      .catch(() => {
        /* 极端情况下 IPC 失败：忽略，窗口保持当前可见状态 */
      })
  }, [])

  // 暴露 store 到 window，供 lint 插件等非 React 代码更新状态
  useEffect(() => {
    ;(window as any).__MIDITOR_STORE__ = useAppStore
  }, [])

  // 启动时恢复上次会话：目录 + 已打开文件 + 活动标签。
  // 必须兜住 rejection：localStorage 数据损坏时 restoreSession 抛错会连带
  // 打断后面「启动参数打开文件」的 await 链，双击 .md 打开文件的入口失效。
  useEffect(() => {
    sessionRef.current = useAppStore.getState().restoreSession().catch((e) => {
      console.error('[App] restoreSession failed:', e)
    })
  }, [])

  // 文件系统监听：事件监听注册一次；根目录变化时启停 Rust 侧 watcher，
  // 外部修改文件 → 自动刷新文件树与已打开的标签（防抖合并处理）
  const rootPath = useAppStore((s) => s.rootPath)
  useEffect(() => {
    let unlisten: UnlistenFn | null = null
    let cancelled = false
    void setupFsWatcher().then((fn) => {
      if (cancelled) {
        fn()
        return
      }
      unlisten = fn
    })
    if (rootPath) {
      // 串行化启停：cleanup 与新 effect 各自发出的 stop/watch 是独立 IPC，
      // Rust 侧执行顺序不受 invoke 发出顺序保证——若 stop 晚于 watch 执行，
      // 新目录的监听会被旧目录的 stop 关掉，此后外部改动永远不刷新。
      // 先 await stop 完成（幂等）再启动新目录的 watch，时序即得到保证。
      void (async () => {
        try {
          await stopWatching()
        } catch {
          /* 尚无监听器时失败无害 */
        }
        if (cancelled) return
        try {
          await watchDirectory(rootPath)
        } catch {
          useAppStore.getState().showToast('无法监听目录')
        }
      })()
    }
    return () => {
      cancelled = true
      unlisten?.()
      void stopWatching().catch(() => {})
    }
  }, [rootPath])

  // 处理启动参数：双击 .md 文件（文件关联）启动时，自动打开传入的文件
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (pendingFilesPromise === null) pendingFilesPromise = takePendingOpenFiles()
      const files = await pendingFilesPromise
      if (cancelled || files.length === 0) return
      // 先等会话恢复完成再打开传入文件，避免会话覆盖活动标签
      await sessionRef.current
      if (cancelled) return
      const store = useAppStore.getState()
      for (const f of files) {
        try {
          // 启动期自动打开：跳过大文件确认弹窗，避免窗口未就绪时弹框
          await store.openFile(f, { skipLargeConfirm: true })
        } catch {
          /* 读取失败（文件可能已被移动）：静默跳过 */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 屏蔽浏览器原生右键菜单（刷新/检查/返回等），仅保留应用自绘菜单
  useEffect(() => {
    const suppress = (e: MouseEvent) => e.preventDefault()
    document.addEventListener('contextmenu', suppress)
    return () => document.removeEventListener('contextmenu', suppress)
  }, [])

  // 后台/非激活时暂停全局背景动效（body::before 的 md-atmos 光晕）。
  //
  // 原先只看 document.hidden，只能覆盖「最小化到托盘/被完全遮挡」；
  // 窗口可见但失去焦点（用户切到别的应用）时动画照跑，仍然白耗 CPU。
  // 现在只要「不可见 或 无焦点」就加 atmos-paused，动画一律停。
  // 注：氛围动效默认本就是关闭的（设置里可开），此处是第二道保险。
  useEffect(() => {
    const update = () =>
      document.body.classList.toggle('atmos-paused', document.hidden || !document.hasFocus())
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    update()
    return () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
    }
  }, [])

  // 启动时应用标题自动编号设置
  useEffect(() => {
    document.documentElement.dataset.headingNumbering = String(useSettingsStore.getState().headingNumbering)
  }, [])

  // Ctrl/Cmd + 滚轮：调整编辑器字号（与设置面板的字号滑杆联动）
  useEffect(() => {
    let lastStep = 0
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault() // 阻止 WebView 页面级缩放
      // 触控板高频滚动会瞬间触发大量 wheel 事件，节流为每 60ms 一步
      const now = performance.now()
      if (now - lastStep < 60) return
      lastStep = now
      const dir = e.deltaY < 0 ? 1 : -1
      useSettingsStore.getState().setFontSize(useSettingsStore.getState().fontSize + dir)
    }
    window.addEventListener('wheel', handler, { passive: false })
    return () => window.removeEventListener('wheel', handler)
  }, [])

  // 全局搜索快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 模态弹窗打开时屏蔽全局快捷键（与 EditorArea 同规则）：
      // 否则弹窗内按键会穿透触发搜索，Esc 也会双重触发
      if (useAppStore.getState().promptDialog) return
      const key = useShortcutsStore.getState().getKey('search')
      const parts = key.split('+')
      const needCtrl = parts.includes('Ctrl')
      const needShift = parts.includes('Shift')
      const needAlt = parts.includes('Alt')
      const mainKey = parts[parts.length - 1]
      // 严格匹配每个修饰键：旧写法 `(hasCtrl === needCtrl || !needCtrl)` 在用户把
      // 快捷键自定义为不含 Ctrl 的组合时放行任意 Ctrl/Alt 叠加，误触发搜索
      const hasCtrl = e.ctrlKey || e.metaKey
      if (needCtrl !== hasCtrl) return
      if (needShift !== e.shiftKey) return
      if (needAlt !== e.altKey) return
      if (e.key.toLowerCase() !== mainKey.toLowerCase()) return
      e.preventDefault()
      useAppStore.getState().openSearch()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // 窗口关闭确认由 Rust 主进程实现（on_window_event + 原生 MessageBox），
  // 这里只需在未保存状态变化时同步给 Rust。
  //
  // 用 subscribeWithSelector 的选择性订阅：selector 产出 dirty 名单的拼接串，
  // 只有这个串变了（真正的增删改）才会调 listener 发 IPC。
  // 之前裸 subscribe 会对每一次 setState（含 toast/大纲/右键菜单开合）都跑一遍
  // filter+map+join，且zustand v5 裸 subscribe 无法按切片过滤。
  useEffect(() => {
    const unsub = useAppStore.subscribe(
      (s) => s.tabs.filter((t) => t.isDirty).map((t) => t.name).join('\n'),
      (key) => {
        void syncDirtyFiles(key ? key.split('\n') : []).catch(() => {})
      },
    )
    return unsub
  }, [])

  // 托盘菜单「新建文件」：用户点击托盘 → Rust 呼出主界面并广播 tray-new-file，
  // 这里复用侧边栏的新建文件交互（名称校验 + 在根目录创建 .md）
  useEffect(() => {
    let unlisten: UnlistenFn | null = null
    // 与 TreeContextMenu 保持一致的文件名校验规则
    const nameValidate = (label: string) => (value: string) => {
      const v = value.trim()
      if (!v) return `${label}不能为空`
      if (/[\\/:*?"<>|]/.test(v)) return `${label}不能包含 \\ / : * ? " < > |`
      return null
    }
    void listen('tray-new-file', () => {
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
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [])

  // 拖入打开：Rust 侧监听到文件/文件夹拖入窗口后，分别处理
  useEffect(() => {
    let unlistenFile: UnlistenFn | null = null
    let unlistenFolder: UnlistenFn | null = null
    void listen<string[]>('app-drag-drop', (event) => {
      const store = useAppStore.getState()
      const paths = event.payload
      for (const p of paths) {
        void store.openFile(p, { skipLargeConfirm: true }).catch(() => {
          store.showToast(`无法打开文件：${p}`)
        })
      }
    }).then((fn) => {
      unlistenFile = fn
    })
    void listen<string[]>('app-drag-drop-folder', (event) => {
      const store = useAppStore.getState()
      const folders = event.payload
      if (folders.length > 0) {
        const dir = folders[0]
        store.setRootPath(dir)
        void store.loadDirectory(dir).catch(() => {
          store.showToast(`无法打开文件夹：${dir}`)
        })
      }
    }).then((fn) => {
      unlistenFolder = fn
    })
    return () => {
      unlistenFile?.()
      unlistenFolder?.()
    }
  }, [])

  // 单实例模式：当用户双击 .md 文件时，如果应用已在运行，第二个实例会通过 single-instance 插件
  // 将文件路径发送给主实例，主实例通过此事件接收并打开文件
  useEffect(() => {
    let unlisten: UnlistenFn | null = null
    void listen<string[]>('single-instance-open-files', (event) => {
      const store = useAppStore.getState()
      const paths = event.payload
      for (const p of paths) {
        void store.openFile(p, { skipLargeConfirm: true }).catch(() => {
          store.showToast(`无法打开文件：${p}`)
        })
      }
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [])

  return <AppLayout />
}

export default App