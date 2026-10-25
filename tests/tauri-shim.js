/**
 * 浏览器内 Tauri IPC 模拟层。
 *
 * 目的：把真实的 App 挂到无头 Chrome 里跑，从而既能量化「打开大文件 + 编辑」的真实耗时，
 * 也能逐个点击界面按钮做功能回归。只在测试页里通过 <script> 先加载，
 * 不参与 tauri 构建产物。
 *
 * 虚拟文件系统挂在 MEM 里，初值由测试页通过 __seed 注入（内容从 dev server 抓取）。
 */
;(() => {
  let cbId = 0
  const callbacks = new Map()
  const listeners = new Map() // event -> Map<handlerId, cb>
  const calls = []
  const MEM = new Map() // path -> { isDir, content }
  const presets = { openPath: null, savePath: null, askResult: true }

  const norm = (p) => String(p).replace(/\//g, '\\').replace(/\\+$/, '')
  const dirname = (p) => {
    const s = norm(p)
    const i = s.lastIndexOf('\\')
    return i > 0 ? s.slice(0, i) : s
  }
  const basename = (p) => norm(p).split('\\').pop()
  const ext = (p) => {
    const b = basename(p)
    const i = b.lastIndexOf('.')
    return i > 0 ? b.slice(i + 1) : null
  }
  const enc = (s) => new TextEncoder().encode(s).length

  const ensureDir = (p) => {
    const s = norm(p)
    if (!s) return
    if (!MEM.has(s)) MEM.set(s, { isDir: true, content: '' })
  }

  const api = {
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { windowLabel: 'main', label: 'main' },
    },
    convertFileSrc: (p) => p,
    transformCallback(cb, once) {
      const id = ++cbId
      callbacks.set(id, { cb, once })
      return id
    },
    unregisterCallback(id) {
      callbacks.delete(id)
    },
    unregisterListener(id) {
      for (const m of listeners.values()) m.delete(id)
      return null
    },
    async invoke(cmd, args = {}) {
      calls.push({ cmd, args })
      switch (cmd) {
        // ---------- 文件 ----------
        case 'read_file': {
          const e = MEM.get(norm(args.path))
          if (!e || e.isDir) throw 'Failed to read file: ' + args.path
          return e.content
        }
        case 'write_file': {
          ensureDir(dirname(args.path))
          MEM.set(norm(args.path), { isDir: false, content: args.content ?? '' })
          return null
        }
        case 'file_size': {
          const e = MEM.get(norm(args.path))
          if (!e) throw 'not found: ' + args.path
          return enc(e.content)
        }
        case 'list_directory': {
          const dir = norm(args.path)
          const out = []
          for (const [p, e] of MEM) {
            if (p === dir) continue
            if (dirname(p) !== dir) continue
            out.push({ name: basename(p), path: p, isDir: e.isDir, extension: e.isDir ? null : ext(p) })
          }
          out.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
          out.sort((a, b) => Number(b.isDir) - Number(a.isDir))
          return out
        }
        case 'create_file': {
          ensureDir(dirname(args.path))
          MEM.set(norm(args.path), { isDir: false, content: args.content ?? '' })
          return null
        }
        case 'create_directory': {
          ensureDir(args.path)
          return null
        }
        case 'rename_path': {
          const from = norm(args.oldPath)
          const to = norm(args.newPath)
          const e = MEM.get(from)
          if (!e) throw 'not found'
          MEM.delete(from)
          MEM.set(to, e)
          return null
        }
        case 'delete_path': {
          MEM.delete(norm(args.path))
          return { recycled: true }
        }
        case 'set_dirty_files':
        case 'quit_now':
          return null
        case 'take_pending_open_files':
          return presets.pendingFiles || []
        case 'read_file_b64':
          return ''
        case 'save_image_b64': {
          ensureDir(dirname(args.path))
          MEM.set(norm(args.path), { isDir: false, content: '' })
          return null
        }
        case 'search_files': {
          const q = String(args.query || '')
          const out = []
          for (const [p, e] of MEM) {
            if (e.isDir || !/\.(md|markdown)$/i.test(p)) continue
            e.content.split('\n').forEach((line, i) => {
              let idx = line.indexOf(q)
              while (idx >= 0 && out.length < (args.maxResults || 200)) {
                out.push({
                  path: p,
                  name: basename(p),
                  line: i + 1,
                  content: line,
                  matchStart: idx,
                  matchEnd: idx + q.length,
                })
                idx = line.indexOf(q, idx + q.length)
              }
            })
          }
          return out
        }
        case 'replace_files': {
          const q = String(args.query || '')
          const rep = String(args.replacement ?? '')
          const out = []
          for (const [p, e] of MEM) {
            if (e.isDir || !/\.(md|markdown)$/i.test(p)) continue
            const n = q ? e.content.split(q).length - 1 : 0
            if (n > 0) {
              e.content = e.content.split(q).join(rep)
              out.push({ path: p, count: n })
            }
          }
          return out
        }
        case 'watch_directory':
        case 'stop_watching':
          return null
        case 'temp_dir':
          return 'C:\\Temp'
        case 'export_pdf':
          return null
        case 'check_md_association':
          return { registered: true, exePath: 'C:\\App\\mymdedit.exe' }
        case 'set_md_association':
          return { registered: true, exePath: 'C:\\App\\mymdedit.exe' }
        case 'plugin:event|listen': {
          const { event, handler } = args
          if (!listeners.has(event)) listeners.set(event, new Map())
          listeners.get(event).set(handler, callbacks.get(handler)?.cb)
          // 真实 Tauri 返回的是监听 id；这里直接复用回调 id，unlisten 时按同一键删除
          return handler
        }
        case 'plugin:event|unlisten': {
          listeners.get(args.event)?.delete(args.eventId)
          return null
        }
        case 'plugin:dialog|open':
          return presets.openPath
        case 'plugin:dialog|save':
          return presets.savePath
        case 'plugin:dialog|ask':
          return presets.askResult
        // ask()/confirm() 在带自定义按钮文案时走的是 message，
        // 把返回值与 okLabel **字符串**严格比较——返回 null/布尔值都会被判成「取消」，
        // 于是「删除文件」「关闭未保存标签」这类确认流程在测试里永远走不通。
        // 自定义文案的实际参数形状是 { OkCancelCustom: [okLabel, cancelLabel] }。
        case 'plugin:dialog|message': {
          const b = args.buttons
          if (b === 'YesNo') return presets.askResult ? 'Yes' : 'No'
          if (b === 'OkCancel') return presets.askResult ? 'Ok' : 'Cancel'
          if (b && Array.isArray(b.OkCancelCustom)) {
            return presets.askResult ? b.OkCancelCustom[0] : b.OkCancelCustom[1]
          }
          return null
        }
        case 'plugin:opener|open_url':
        case 'plugin:opener|open_path':
        case 'plugin:opener|reveal_item_in_dir':
          calls.push({ cmd: 'OPENER', args })
          return null
        case 'plugin:window|show':
        case 'plugin:window|minimize':
        case 'plugin:window|maximize':
        case 'plugin:window|unmaximize':
        case 'plugin:window|toggle_maximize':
        case 'plugin:window|set_title':
        case 'plugin:window|start_dragging':
        case 'plugin:window|set_focus':
          return null
        case 'plugin:window|is_maximized':
          return false
        default:
          if (typeof cmd === 'string' && cmd.startsWith('plugin:')) {
            calls.push({ cmd: 'UNKNOWN:' + cmd, args })
            return null
          }
          throw 'unknown command: ' + cmd
      }
    },
  }

  window.__TAURI_INTERNALS__ = api

  // @tauri-apps/api 的 event 模块在 unlisten 时用的是这个全局
  // （由 tauri 运行时注入，不是 __TAURI_INTERNALS__）。
  // 缺了它，React 严格模式下 listen 的清理会在卸载时抛
  // TypeError: Cannot read properties of undefined (reading 'unregisterListener')。
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener(event, eventId) {
      listeners.get(event)?.delete(eventId)
      callbacks.delete(eventId)
    },
  }

  window.__MOCK__ = {
    MEM,
    calls,
    presets,
    seed(files) {
      for (const [p, content] of Object.entries(files)) {
        ensureDir(dirname(p))
        MEM.set(norm(p), { isDir: false, content })
      }
    },
    mkdir(p) {
      ensureDir(p)
    },
    emit(event, payload) {
      const m = listeners.get(event)
      if (!m) return 0
      let n = 0
      for (const cb of m.values()) {
        if (typeof cb === 'function') {
          cb({ event, id: ++n, payload })
          n++
        }
      }
      return n
    },
    reset() {
      calls.length = 0
    },
    dump() {
      return [...MEM.entries()].map(([p, e]) => ({ path: p, isDir: e.isDir, len: e.content.length }))
    },
  }
})()
