/**
 * 真实 App 测试宿主：加载 tauri-shim 后挂载 <App />，并暴露 window.__H 给 CDP 驱动脚本。
 *
 * 与 functest.tsx 的区别：这里跑的是**完整应用**（工具栏 / 侧栏 / 标签 / 大纲 / 状态栏 / 弹窗
 * 全部真实），因此既能测「打开大文件 + 输入」的端到端耗时，也能逐按钮点击做功能回归。
 */
import '../src/index.css'
import { createRoot } from 'react-dom/client'
import App from '../src/App'
import { useAppStore } from '../src/stores/useAppStore'
import { useSettingsStore } from '../src/stores/settings'
import {
  editorViewCtx as EV,
  parserCtx as PC,
  schemaCtx as SC,
  editorStateOptionsCtx as ESOC,
  prosePluginsCtx as PPC,
  serializerCtx as SERC,
} from '@milkdown/kit/core'
import { EditorState as ES } from '@milkdown/kit/prose/state'
import { headingIdGenerator as HID, headingSchema as HS } from '@milkdown/kit/preset/commonmark'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Sample {
  t: number
  dt: number
}

const frames: Sample[] = []
const longTasks: { start: number; dur: number }[] = []
let sampling = false
let last = 0
let rafId = 0

function loop(t: number) {
  if (!sampling) return
  if (last) frames.push({ t, dt: t - last })
  last = t
  rafId = requestAnimationFrame(loop)
}

try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) longTasks.push({ start: e.startTime, dur: e.duration })
  }).observe({ entryTypes: ['longtask'] })
} catch {
  /* 不支持 longtask 时退化为帧间隔分析 */
}

/** 输入事件耗时（Event Timing API）：能真实反映「一次按键 → 处理完成」的延迟 */
const inputEvents: { name: string; dur: number; t: number }[] = []
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as any[]) {
      if (e.name === 'keydown' || e.name === 'beforeinput' || e.name === 'input') {
        inputEvents.push({ name: e.name, dur: e.duration, t: e.startTime })
      }
    }
  }).observe({ type: 'event', durationThreshold: 0, buffered: false } as any)
} catch {
  /* ignore */
}

const pct = (arr: number[], p: number) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))]
}
const r1 = (n: number) => Math.round(n * 10) / 10

const H = {
  store: useAppStore,
  settings: useSettingsStore,
  ready: false,
  sleep,
  /** 供探针脚本复用的编辑器内部 ctx 与工厂 */
  m: {
    editorViewCtx: EV,
    parserCtx: PC,
    schemaCtx: SC,
    editorStateOptionsCtx: ESOC,
    prosePluginsCtx: PPC,
    serializerCtx: SERC,
    EditorState: ES,
    headingIdGenerator: HID,
    headingSchema: HS,
  },
  async waitFor(fn: () => boolean, timeout = 30000, label = '') {
    const t0 = performance.now()
    while (performance.now() - t0 < timeout) {
      try {
        if (fn()) return performance.now() - t0
      } catch {
        /* ignore */
      }
      await sleep(50)
    }
    throw new Error('waitFor timeout: ' + label)
  },
  startSampling() {
    frames.length = 0
    longTasks.length = 0
    inputEvents.length = 0
    sampling = true
    last = 0
    rafId = requestAnimationFrame(loop)
  },
  stopSampling() {
    sampling = false
    cancelAnimationFrame(rafId)
    const dts = frames.map((f) => f.dt).filter((d) => d > 0)
    return {
      frames: dts.length,
      frameP50: r1(pct(dts, 0.5)),
      frameP90: r1(pct(dts, 0.9)),
      frameP99: r1(pct(dts, 0.99)),
      frameMax: r1(Math.max(0, ...dts)),
      jank: dts.filter((d) => d > 33).length,
      jankPct: r1((dts.filter((d) => d > 33).length / Math.max(1, dts.length)) * 100),
      longTasks: longTasks.map((l) => r1(l.dur)),
      longTaskTotal: r1(longTasks.reduce((a, b) => a + b.dur, 0)),
      input: inputEvents.map((e) => ({ n: e.name, d: r1(e.dur) })),
      inputP50: r1(pct(inputEvents.map((e) => e.dur), 0.5)),
      inputP90: r1(pct(inputEvents.map((e) => e.dur), 0.9)),
      inputMax: r1(Math.max(0, ...inputEvents.map((e) => e.dur))),
    }
  },
  /** 编辑器视图（供测试脚本读取文档结构） */
  async view() {
    const ed = useAppStore.getState().editor
    if (!ed) return null
    const { editorViewCtx } = await import('@milkdown/kit/core')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ed as any).action((ctx: any) => ctx.get(editorViewCtx))
  },
  editorDom() {
    return document.querySelector('.milkdown [contenteditable="true"]') as HTMLElement | null
  },
  scrollEl() {
    return document.querySelector('.milkdown') as HTMLElement | null
  },
  /** 把光标放到指定类型顶层块的第一个文本位置（默认取靠中间的那个） */
  async caretToBlockByType(type: string) {
    const store = useAppStore.getState()
    const ed = store.editor
    if (!ed) throw new Error('no editor')
    const { editorViewCtx } = await import('@milkdown/kit/core')
    const { TextSelection } = await import('@milkdown/kit/prose/state')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ed as any).action((ctx: any) => {
      const view = ctx.get(editorViewCtx)
      const doc = view.state.doc
      const hits: { pos: number; nodeSize: number; size: number }[] = []
      let pos = 0
      doc.forEach((node: any) => {
        if (node.type.name === type && (type !== 'heading' || node.textContent.length > 6)) {
          hits.push({ pos, nodeSize: node.nodeSize, size: node.content.size })
        }
        pos += node.nodeSize
      })
      if (!hits.length) throw new Error('no block of type ' + type)
      const h = hits[Math.floor(hits.length / 2)]
      const sel = TextSelection.near(doc.resolve(h.pos + 2))
      view.dispatch(view.state.tr.setSelection(sel).scrollIntoView())
      view.focus()
      return { type, count: hits.length, pos: sel.from, size: h.size }
    })
  },
  /** 光标进入第一个表格的首个单元格 */
  async caretToTableCell() {
    const ed = useAppStore.getState().editor
    if (!ed) throw new Error('no editor')
    const { editorViewCtx } = await import('@milkdown/kit/core')
    const { TextSelection } = await import('@milkdown/kit/prose/state')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ed as any).action((ctx: any) => {
      const view = ctx.get(editorViewCtx)
      const doc = view.state.doc
      let found = -1
      let rows = 0
      let cells = 0
      doc.descendants((n: any, p: number) => {
        if (found >= 0) return false
        if (n.type.name === 'table') {
          rows = n.childCount
          cells = n.child(0)?.childCount ?? 0
          n.descendants((c: any, cp: number) => {
            if (found < 0 && c.type.name === 'paragraph' && c.content.size > 2) {
              found = p + 1 + cp + 1
              return false
            }
            return true
          })
          return false
        }
        return true
      })
      if (found < 0) throw new Error('no table')
      const sel = TextSelection.near(doc.resolve(found))
      view.dispatch(view.state.tr.setSelection(sel).scrollIntoView())
      view.focus()
      return { pos: sel.from, rows, cells }
    })
  },
  async caretToBlock(index: number) {
    const store = useAppStore.getState()
    const ed = store.editor
    if (!ed) throw new Error('no editor')
    const { editorViewCtx } = await import('@milkdown/kit/core')
    const { TextSelection } = await import('@milkdown/kit/prose/state')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ed as any).action((ctx: any) => {
      const view = ctx.get(editorViewCtx)
      const doc = view.state.doc
      const idx = Math.min(Math.max(0, index), doc.childCount - 1)
      let pos = 1
      for (let i = 0; i < idx; i++) pos += doc.child(i).nodeSize
      let target = pos + 1
      // 落到块内第一个文本位置
      const node = doc.child(idx)
      node.descendants((n: any, p: number) => {
        if (n.isText) {
          target = pos + 1 + p
          return false
        }
        return true
      })
      const sel = TextSelection.near(doc.resolve(Math.min(target, doc.content.size)))
      view.dispatch(view.state.tr.setSelection(sel).scrollIntoView())
      view.focus()
      return { block: idx, pos: sel.from, type: node.type.name }
    })
  },
  /** 打开工作区（虚拟 FS） */
  async openWorkspace(root: string) {
    const s = useAppStore.getState()
    s.setRootPath(root)
    await s.loadDirectory(root)
  },
  async open(path: string, opts?: { skipLargeConfirm?: boolean }) {
    return useAppStore.getState().openFile(path, opts)
  },
  state() {
    const s = useAppStore.getState()
    return {
      tabs: s.tabs.map((t) => ({ name: t.name, dirty: t.isDirty, src: !!t.sourceMode, len: t.content.length })),
      active: s.activeTabId,
      outline: s.outline.length,
      root: s.rootPath,
      toast: s.toast,
    }
  },
  dump() {
    return (window as any).__MOCK__.dump()
  },
  calls() {
    return (window as any).__MOCK__.calls.map((c: any) => c.cmd)
  },
}

;(window as any).__H = H

async function boot() {
  const q = new URLSearchParams(location.search)
  const files: Record<string, string> = {}
  // 大文件从 dev server 抓取后灌进虚拟 FS
  const want = (q.get('files') || 'big5.md,big.md').split(',').filter(Boolean)
  for (const f of want) {
    try {
      const r = await fetch('/' + f)
      if (r.ok) files['C:\\work\\' + f] = await r.text()
    } catch {
      /* ignore */
    }
  }
  ;(window as any).__MOCK__.seed(files)
  ;(window as any).__MOCK__.mkdir('C:\\work\\notes')
  useAppStore.setState({ sidebarVisible: true } as any)
  createRoot(document.getElementById('root')!).render(<App />)
  H.ready = true
}

void boot()
