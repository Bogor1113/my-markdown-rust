import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import type { Selection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { updateDecorations } from '../utils/incrementalDecorations'

/**
 * Mermaid 块的「图表 / 源码」双态渲染（对齐 Typora）。
 *
 * 老实现只在 code_block 前挂一个 SVG widget，源码块本体照常渲染，于是每个图下面
 * 都跟着一段 ```mermaid 代码。现在：
 *   - 预览态：用 Decoration.node 给 mermaid 的 code_block 加
 *     `mditor-mermaid-source-hidden`（CSS display:none），只留 widget 里的图；
 *   - 编辑态：点击图把选区放进该 code_block，插件自动去掉隐藏类、显示 CodeMirror
 *     源码，widget 换成一条「返回图表」工具条；
 *   - 选区离开该块（点击别处 / 方向键越界）自动回到预览态。
 *
 * 为什么用「选区派生」而不是自己存一个 editing 标志：ProseMirror 的光标导航不理会
 * CSS，若隐藏的块里进了光标却没展开，用户会看到光标凭空消失。让 editing 恒等于
 * 「当前选区所在的 mermaid 块」，任何路径进入该块都会自动展开，不存在隐形光标。
 * 唯一的例外是显式点「返回图表」：用 FORCE_PREVIEW meta 覆盖，保证即使光标暂时
 * 无法移出（整个文档只有这一个块）也一定能回到图。
 *
 * 编辑态下图不渲染：mermaid.render 是 20–80ms 的同步布局计算，编辑源码时每敲一个
 * 字符都重画一遍会明显卡顿；退出编辑态时再按新源码渲染一次即可（svgCache 命中则同步）。
 */

let mermaidLib: any = null
let mermaidIdCounter = 0
/** mermaid.initialize 当前生效的主题（init 只需在主题变化时重跑） */
let initializedTheme = ''

function currentMermaidTheme(): string {
  const t = document.documentElement.getAttribute('data-theme')
  return t === 'light' || t === 'paper' ? 'default' : 'dark'
}

async function getMermaid() {
  if (!mermaidLib) {
    const mod = await import('mermaid')
    mermaidLib = (mod as any).default || mod
  }
  // 每次渲染前核对主题：旧实现只在首次 import 时 initialize 一次，
  // 主题被永久固定，切换亮/暗后图表永远是旧配色。
  const theme = currentMermaidTheme()
  if (theme !== initializedTheme) {
    mermaidLib.initialize({
      startOnLoad: false,
      theme,
      securityLevel: 'strict',
    })
    initializedTheme = theme
  }
  return mermaidLib
}

/** 渲染结果缓存上限。单张 mermaid SVG 字符串可达数十 KB，60 张时最坏可积到
 *  数 MB 的常驻字符串；真实文档同时需要的去重图表很少，24 张已经富余。 */
const SVG_CACHE_LIMIT = 24
const svgCache = new Map<string, string>()
/**
 * 渲染纪元：主题切换时 +1，widget 缓存里旧纪元的 DOM 全部作废重建
 * （仅清 svgCache 不够——同位置同源码的 widget 会直接复用旧主题的容器 DOM）。
 */
let renderEpoch = 0

/** 存活的编辑器视图：主题切换时派发空事务触发 decorations 重算 */
const liveViews = new Set<EditorView>()

/** 进行中的点击收尾函数：编辑器销毁时统一执行，撤销 document 监听与兜底 timer */
const pendingClickCleanups = new Set<() => void>()

/** 进行中的渲染任务：导出前必须等它们落定，否则克隆到的图容器还是空的 */
const pendingRenders = new Set<Promise<void>>()

/** 显式「强制回到预览」事务标记（见文件头注释） */
const forcePreviewKey = new PluginKey<boolean>('mermaid-force-preview')

/**
 * 进入编辑态后的选区保护窗口。
 *
 * 点击图的这次鼠标操作结束后，浏览器仍会把原生 DOM 选区同步回 ProseMirror
 * （selectionchange / click 的收尾事务），把光标改到点击落点附近的段落。
 * 这段时间内若照常「选区派生」，刚展开的源码会被同一次点击立刻收回去。
 * 窗口只拦「选区跑到块外」这一种回跳；用户之后真正点别处仍能正常退出。
 */
let selectionGuardUntil = 0

/**
 * 主题切换后调用（applyTheme）：旧主题的 SVG 全部失效，
 * 所有存活的 mermaid 图按新主题重新渲染。
 */
export function refreshMermaidTheme() {
  // mermaid 尚未加载（还没渲染过图）：无需处理，首次渲染自动按当前主题
  if (!mermaidLib) return
  if (currentMermaidTheme() === initializedTheme) return
  svgCache.clear()
  renderEpoch++
  for (const view of liveViews) {
    if (view.isDestroyed) continue
    // 空事务（无 doc 变更）驱动 decorations 重算 → build 检测到 epoch 变化重建 widget
    view.dispatch(view.state.tr)
  }
}

function renderInto(container: HTMLElement, code: string, id: string) {
  // 缓存键带上主题：切主题时 refreshMermaidTheme() 会 clear + epoch++，但**在途**
  // 的 mermaid.render 若晚于 clear 落定，旧主题 SVG 会被写进缓存，后续同源码的图
  // 一直命中脏缓存。主题做键 + 写入前校验主题未变，双保险。
  const themeAtStart = currentMermaidTheme()
  const cacheKey = `${themeAtStart}:${code}`
  const cached = svgCache.get(cacheKey)
  if (cached !== undefined) {
    container.innerHTML = cached
    container.classList.remove('mermaid-loading')
    container.classList.add('mermaid-rendered')
    return
  }

  const task: Promise<void> = getMermaid()
    .then((m: any) => m.render(id, code))
    .then(({ svg }: { svg: string }) => {
      // 渲染期间主题已切换：这次结果属于旧主题，既不写缓存也不写 DOM。
      // refreshMermaidTheme 已 dispatch 空事务重建 widget，会按新主题重新渲染。
      if (currentMermaidTheme() !== themeAtStart) return
      // 缓存（Map 保持插入顺序，超限淘汰最旧的，避免长会话内存无限增长）
      if (svgCache.size >= SVG_CACHE_LIMIT) {
        const oldest = svgCache.keys().next().value
        if (oldest !== undefined) svgCache.delete(oldest)
      }
      svgCache.set(cacheKey, svg)

      // 容器可能已被 ProseMirror 销毁（编辑/切换标签）：只缓存，不写 DOM
      if (!container.isConnected) return
      container.innerHTML = svg
      container.classList.remove('mermaid-loading')
      container.classList.add('mermaid-rendered')
    })
    .catch((err: any) => {
      if (!container.isConnected) return
      // 错误信息可能含尖括号，用 textContent 避免把内容当 HTML 解析
      container.textContent = `Mermaid 渲染错误: ${String(err)}`
      container.classList.remove('mermaid-loading')
      container.classList.add('mermaid-error-wrap')
    })
  pendingRenders.add(task)
  void task.finally(() => pendingRenders.delete(task))
}

/** 等所有在途渲染完成（新渲染可能由「退出编辑态」触发，故循环收敛） */
export async function waitForMermaidRenders() {
  for (let i = 0; i < 10 && pendingRenders.size; i++) {
    await Promise.all([...pendingRenders])
  }
}

const key = new PluginKey<MermaidState>('mermaid-render')

interface MermaidState {
  doc: PMNode
  epoch: number
  /** 当前处于源码编辑态的 mermaid 块起点；null = 全部预览 */
  editing: number | null
  /** 显式「返回图表」后的强制预览，直到光标再次进入某个 mermaid 块 */
  force: boolean
  set: DecorationSet
}

type BuildFn = (doc: PMNode, from: number, to: number) => Decoration[]

/** 当前选区所在的 mermaid 块起点；不在任何 mermaid 块内则返回 null */
function editingPosFor(selection: Selection): number | null {
  const $from = selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'code_block' && node.attrs.language === 'mermaid') {
      return $from.before(d)
    }
  }
  // NodeSelection 整块选中（PM 对无 contentDOM 的 code_block NodeView 会用它）
  const selected = (selection as unknown as { node?: PMNode }).node
  if (selected?.type.name === 'code_block' && selected.attrs.language === 'mermaid') {
    return selection.from
  }
  return null
}

/** 编辑态下 widget 变成一条工具条（图隐藏，源码块显示） */
function buildEditBar(el: HTMLElement) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'mditor-mermaid-back'
  btn.textContent = '◀ 返回图表'
  const hint = document.createElement('span')
  hint.className = 'mditor-mermaid-hint'
  hint.textContent = 'Mermaid 源码 · 点击文档别处也可返回预览'
  el.append(btn, hint)
}

/**
 * 只扫描 [from, to) 区间内的 mermaid 代码块并生成 decoration。
 *
 * 关键：widget 的 toDOM 传**新建的 DOM 元素**、且不设 spec.key。ProseMirror 靠
 * toDOM 引用相等判定 widget 是否相同——未改动的块由 DecorationSet.map 平移复用，
 * DOM 不会重建；只有真正变化的块才会重新构造容器并重跑渲染。
 */
function build(doc: PMNode, from: number, to: number, editing: number | null): Decoration[] {
  const decos: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'code_block') return
    if ((node.attrs.language as string) !== 'mermaid') return false

    const isEditing = editing === pos
    const el = document.createElement('div')
    if (isEditing) {
      el.className = 'mermaid-container mditor-mermaid-editing'
      buildEditBar(el)
    } else {
      const code = node.textContent
      el.className = 'mermaid-container mermaid-loading'
      el.dataset.mermaidId = `mermaid-${++mermaidIdCounter}`
      el.title = '点击编辑 Mermaid 源码'
      renderInto(el, code, el.dataset.mermaidId)
    }
    el.addEventListener('mousedown', onWidgetMouseDown)
    // 传 DOM 元素而非函数：未改动的块由 StepMap 平移复用，DOM 不会重建
    decos.push(Decoration.widget(pos, el, { side: 1 }))
    decos.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: isEditing ? 'mditor-mermaid-source-visible' : 'mditor-mermaid-source-hidden',
      }),
    )
    return false
  })
  return decos
}

/** 局部刷新指定块的 decorations（切换编辑态时不动其它块，避免重建全篇 widget） */
function refreshBlocks(
  set: DecorationSet,
  doc: PMNode,
  positions: (number | null)[],
  buildFn: BuildFn,
): DecorationSet {
  let next = set
  const seen = new Set<number>()
  for (const pos of positions) {
    if (pos == null || seen.has(pos)) continue
    seen.add(pos)
    const node = doc.nodeAt(pos)
    if (!node || node.type.name !== 'code_block' || node.attrs.language !== 'mermaid') continue
    const end = pos + node.nodeSize
    // find 的区间是闭区间；右端用 end-1，避免把「下一块块首」的 widget 一并删掉
    const stale = next.find(pos, Math.max(pos, end - 1))
    if (stale.length) next = next.remove(stale)
    next = next.add(doc, buildFn(doc, pos, end))
  }
  return next
}

/** 从 decoration set 反查 widget 容器当前对应的块位置（比 posAtDOM 稳定，不受布局影响） */
function findWidgetPos(view: EditorView, el: HTMLElement): number | null {
  const state = key.getState(view.state)
  if (!state) return null
  const hit = state.set.find(0, view.state.doc.content.size + 1).find((d) => {
    const type = (d as unknown as { type?: { toDOM?: unknown } }).type
    return type?.toDOM === el
  })
  return hit ? hit.from : null
}

/** 点击图：把选区放进该 code_block → apply 自动切到源码编辑态 */
function enterEditing(view: EditorView, pos: number) {
  const doc = view.state.doc
  const node = doc.nodeAt(pos)
  if (!node || node.type.name !== 'code_block' || node.attrs.language !== 'mermaid') return
  selectionGuardUntil = performance.now() + 400
  const tr = view.state.tr
    .setSelection(TextSelection.create(doc, pos + 1))
    .setMeta(forcePreviewKey, false)
    .scrollIntoView()
  view.dispatch(tr)
  view.focus()
}

/** 点「返回图表」：先把选区尽量移出该块，再强制预览（覆盖选区仍在块内的边界情况） */
function exitEditing(view: EditorView, pos: number) {
  const doc = view.state.doc
  const node = doc.nodeAt(pos)
  let tr = view.state.tr
  if (node) {
    const end = pos + node.nodeSize
    const after = TextSelection.near(doc.resolve(Math.min(end, doc.content.size)), 1)
    if (after.from >= end || after.to <= pos) {
      tr = tr.setSelection(after)
    } else {
      const before = TextSelection.near(doc.resolve(Math.max(0, pos)), -1)
      if (before.to <= pos) tr = tr.setSelection(before)
    }
  }
  tr = tr.setMeta(forcePreviewKey, true)
  view.dispatch(tr)
  // CodeMirror 是独立焦点域，先让它失焦，避免预览态下键盘仍打进隐藏的源码块
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  view.focus()
}

/**
 * 导出 / 富文本复制前调用：把所有 mermaid 块强制切回预览态，并等图渲染落定。
 * 否则正编辑源码时导出，克隆到的 DOM 会只有代码没有图。
 */
export async function ensureMermaidPreview(view: EditorView | null | undefined) {
  if (!view || view.isDestroyed) return
  const state = key.getState(view.state)
  if (state?.editing != null || state?.force) {
    const tr = view.state.tr.setMeta(forcePreviewKey, true)
    view.dispatch(tr)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }
  await waitForMermaidRenders()
}

/**
 * 点击图 / 点「返回图表」：直接绑在 widget 自己身上。
 *
 * 为什么不走 PM 的 handleDOMEvents：
 *  1) 真实鼠标点击落在 contenteditable=false 的 widget 上时，PM 的 mousedown 会先把
 *     选区挪到附近并可能滚动视图，mouseup 因此落在别的元素上，浏览器常常根本不派发
 *     click（实测事件序列只有 mousedown + mouseup）——只监听 click 时好时坏；
 *  2) 多个插件都注册了 handleDOMEvents.mousedown，someProp 只要有一个返回 truthy
 *     就停止，widget 的 handler 会被别的插件抢先。
 *
 * 为什么 mousedown 只登记、真正切换放到 mouseup：切换会把几百 px 高的图换成一条
 * 工具条，文档高度骤变，mouseup 必然落到别的元素上，PM 随即把选区改走，
 * 「选区派生」的编辑态会被同一次点击立刻撤销。等 mouseup 结束再 dispatch，
 * 并用 preventDefault 挡住 PM 对 mousedown / mouseup / click 的干预。
 * preventDefault（而非 stopPropagation）让 document 上的其它 UI 监听照常收到事件。
 */
function onWidgetMouseDown(event: MouseEvent) {
  if (event.button !== 0) return
  const el = event.currentTarget as HTMLElement | null
  if (!el) return
  const target = event.target as HTMLElement | null
  const isBack = !!target?.closest('.mditor-mermaid-back')
  if (!isBack && el.classList.contains('mditor-mermaid-editing')) return

  let view: EditorView | null = null
  for (const v of liveViews) {
    if (!v.isDestroyed && v.dom.contains(el)) {
      view = v
      break
    }
  }
  if (!view) return
  const pos = findWidgetPos(view, el)
  if (pos == null) return

  event.preventDefault()

  const activeView = view
  let done = false
  let cleanupTimer = 0
  const cleanup = () => {
    document.removeEventListener('mouseup', onUp, true)
    document.removeEventListener('click', onClick, true)
    if (cleanupTimer) {
      clearTimeout(cleanupTimer)
      cleanupTimer = 0
    }
    pendingClickCleanups.delete(cleanup)
  }
  const onUp = (e: MouseEvent) => {
    cleanup()
    if (done) return
    done = true
    // 按下图后立刻切源码模式 / 关标签：editor.destroy() 已跑过，此时再 dispatch
    // 会打到已销毁的 view；widget DOM 也可能已被 ProseMirror 移除。
    if (activeView.isDestroyed || !el.isConnected) return
    e.preventDefault()
    if (isBack) exitEditing(activeView, pos)
    else enterEditing(activeView, pos)
  }
  const onClick = (e: MouseEvent) => {
    // 同一次点击剩余的 click：别让 PM 再把选区改到落点元素
    if (!activeView.isDestroyed) e.preventDefault()
    cleanup()
  }
  document.addEventListener('mouseup', onUp, true)
  document.addEventListener('click', onClick, true)
  // 按下后没抬起（切窗口 / 拖出浏览器）时兜底清理。收尾函数登记到模块级集合，
  // 编辑器 destroy() 时统一执行，否则 document 上的一对监听会永久残留。
  cleanupTimer = window.setTimeout(cleanup, 3000)
  pendingClickCleanups.add(cleanup)
}

export const mermaidPlugin = $prose(() => {
  return new Plugin<MermaidState>({
    key,
    state: {
      init: (_config, state) => {
        const editing = editingPosFor(state.selection)
        return {
          doc: state.doc,
          epoch: renderEpoch,
          editing,
          force: false,
          set: DecorationSet.create(state.doc, build(state.doc, 0, state.doc.content.size, editing)),
        }
      },
      apply: (tr, value) => {
        const epochChanged = value.epoch !== renderEpoch
        const forceMeta = tr.getMeta(forcePreviewKey) as boolean | undefined
        const selEditing = editingPosFor(tr.selection)
        let force = value.force
        if (forceMeta === true) force = true
        else if (forceMeta === false || selEditing !== null) force = false
        let editing: number | null
        if (force) editing = null
        else if (selEditing !== null) editing = selEditing
        else if (value.editing !== null && performance.now() < selectionGuardUntil) editing = value.editing
        else editing = null
        const editingChanged = value.editing !== editing

        // 只移动光标且状态没变：连 decorations 都不用碰
        if (!tr.docChanged && !epochChanged && !editingChanged && force === value.force) return value

        const buildFn: BuildFn = (doc, from, to) => build(doc, from, to, editing)
        let set: DecorationSet
        if (epochChanged) {
          set = DecorationSet.create(tr.doc, buildFn(tr.doc, 0, tr.doc.content.size))
        } else if (tr.docChanged) {
          set = updateDecorations(value.doc, tr.doc, value.set, buildFn)
          // 旧编辑块若不在本次变化区间里（例如同时点了别处），仍要切回预览并重画
          if (editingChanged && value.editing != null) {
            const mapped = tr.mapping.map(value.editing, -1)
            set = refreshBlocks(set, tr.doc, [mapped], buildFn)
          }
        } else {
          set = refreshBlocks(value.set, tr.doc, [value.editing, editing], buildFn)
        }
        return { doc: tr.doc, epoch: renderEpoch, editing, force, set }
      },
    },
    props: {
      decorations: (state) => key.getState(state)!.set,
    },
    view: (view) => {
      liveViews.add(view)
      return {
        update: (v) => {
          // 同一次点击的收尾事务会把 DOM 选区同步到落点附近的段落。保护窗口内
          // 把光标放回刚展开的源码块，否则用户看到源码却打不进字。
          // 窗口过后不再纠正：那时选区变化就是用户真的点了别处，应正常回到图。
          if (v.isDestroyed || performance.now() >= selectionGuardUntil) return
          const editing = key.getState(v.state)?.editing ?? null
          if (editing == null) return
          const node = v.state.doc.nodeAt(editing)
          if (!node || node.type.name !== 'code_block' || node.attrs.language !== 'mermaid') return
          const inside = editing + 1
          const sel = v.state.selection
          if (sel.from >= inside && sel.from < editing + node.nodeSize) return
          v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, inside)))
          v.focus()
        },
        destroy: () => {
          liveViews.delete(view)
          // 仍在等待 mouseup 的点击收尾必须立刻执行：它会撤销 document 上的
          // mouseup/click 监听和 3s 兜底 timer，避免回调打到已销毁的 view。
          if (liveViews.size === 0) {
            for (const fn of pendingClickCleanups) fn()
            pendingClickCleanups.clear()
          }
          svgCache.clear()
        },
      }
    },
  })
})
