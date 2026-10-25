import { useRef, useEffect } from 'react'
import {
  Editor,
  rootCtx,
  editorViewCtx,
  parserCtx,
  schemaCtx,
  editorStateOptionsCtx,
  prosePluginsCtx,
  serializerCtx,
  remarkStringifyOptionsCtx,
} from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import {
  commonmark,
  remarkHtmlTransformer,
  remarkPreserveEmptyLinePlugin,
  syncListOrderPlugin,
  syncHeadingIdPlugin,
  wrapInHeadingInputRule,
  wrapInBlockquoteInputRule,
  createCodeBlockInputRule,
  insertImageInputRule,
} from '@milkdown/kit/preset/commonmark'
import { gfm, strikethroughInputRule } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { TextSelection, EditorState, Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { search } from 'prosemirror-search'
import { codeHighlightPlugin } from '../../plugins/codeHighlight'
import { listOrderPlugin } from '../../plugins/listOrder'
import { headingIdPlugin, withHeadingIds } from '../../plugins/headingId'
import { upload, uploadConfig } from '@milkdown/plugin-upload'
import type { Node, Schema } from '@milkdown/kit/prose/model'
import type { OutlineItem } from '../../types'
import { useAppStore } from '../../stores/useAppStore'
import { useSettingsStore } from '../../stores/settings'
import { saveImageToAssets } from '../../services/images'
import { contextMenuPlugin } from '../ContextMenu/contextMenuPlugin'
import { languageBadgePlugin } from '../ContextMenu/languageBadgePlugin'
import { math } from '../../plugins/math'
import { overrideListCommands } from '../../plugins/list'
import { highlight as markHighlightPlugin, markConfig } from '../../plugins/mark'
import { copyButtonPlugin } from '../../plugins/copyButton'
import { imagePlugin } from '../../plugins/image'
import { htmlPlugin } from '../../plugins/html'
import { underlinePlugin } from '../../plugins/underline'
import { dropEmptyLineBreakPlugin } from '../../plugins/mdClean'
import { htmlSvgEditPlugin } from '../../plugins/htmlSvgEdit'
import { svgSourceEditorMilkdownPlugin } from '../../plugins/svgSourceEditor'
import { autoPairPlugin } from '../../plugins/autoPair'
import { typoraKeymap } from '../../plugins/typoraKeys'
import {
  typoraHeadingInputRule,
  typoraBlockquoteInputRule,
  typoraNestedList,
  blockquoteSpaceGuard,
  typoraCodeFenceInputRule,
  typoraStrikethroughInputRule,
  mdAutoConvertPlugin,
} from '../../plugins/typoraInput'
import { calloutPlugin } from '../../plugins/callout'
import { codeBlockLineNumbers } from '../../plugins/codeBlockLineNumbers'
import { codeBlockCaretPlugin } from '../../plugins/codeBlockCaret'
import { mermaidPlugin } from '../../plugins/mermaid'
import { emojiAutocompletePlugin } from '../../plugins/emojiAutocomplete'
import { excelPastePlugin } from '../../plugins/excelPaste'
import { footnotePlugin } from '../../plugins/footnote'
import { tablePlugin } from '../../plugins/table'
import { tableClipboardPlugin } from '../../plugins/tableClipboard'
import { tableDragReorderPlugin } from '../../plugins/tableDragReorder'
import { taskTogglePlugin } from '../../plugins/taskToggle'
import { typewriterPlugin } from '../../plugins/typewriter'
import { sanitizeCodeBlockTrailingNewlines } from '../../utils/markdown'
import { BlockMarkdownCache } from '../../utils/blockMarkdown'
import { installPmPerfPatches } from '../../utils/pmPerf'
import { viewportTopPos } from '../../utils/viewportPos'

// 视图层补丁（DecorationSet.forChild 二分查找）尽早安装：必须在编辑器创建前生效。
installPmPerfPatches()


/**
 * 粘贴/拖拽图片 → 保存到当前文档的 <文件名>.assets → 插入相对路径引用
 */
async function imageUploader(files: FileList, schema: Schema): Promise<Node[]> {
  const nodes: Node[] = []
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const src = await saveImageToAssets(file.name || '', file.type, bytes)
      if (!src) continue
      const node = schema.nodes.image.createAndFill({
        src,
        alt: file.name || '',
        title: '',
      })
      if (node) nodes.push(node)
    } catch (e) {
      console.error('Failed to paste image:', e)
    }
  }
  return nodes
}

/** 查找替换用搜索插件（查询状态由 FindReplace 组件通过 setSearchState 更新） */
const searchPlugin = $prose(() => search())

/** 遍历 ProseMirror 文档，收集所有标题节点，并记录每个标题对应的 DOM 元素（供 scroll-spy 计算） */
function collectOutline(
  view: EditorView,
  doms: Map<number, HTMLElement>,
): OutlineItem[] {
  const items: OutlineItem[] = []
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const itemPos = pos + 1
      items.push({
        level: node.attrs.level as number,
        text: node.textContent,
        pos: itemPos,
      })
      // nodeDOM 以节点所在位置（pos，不含 +1）取渲染出的 DOM；未渲染（如显示为块）时跳过
      const dom = view.nodeDOM(pos)
      if (dom instanceof HTMLElement) doms.set(itemPos, dom)
    }
  })
  return items
}

interface Props {
  docKey: string
  content: string
  /** 外部修改重新加载的触发计数（store.externalReload），递增时从磁盘内容重载文档 */
  reloadTick?: number
  onChange: (markdown: string) => void
}

/** 启用 content-visibility 虚拟化的顶层块数阈值：低于它全量渲染（滚动条完全跟手），
 *  达到它才虚拟化（牺牲滚动条跟手换取大文档渲染性能）。理由见 index.css
 *  .milkdown-virtualized 的注释。 */
const VIRTUALIZE_BLOCK_THRESHOLD = 3000

/** 按文档顶层块数动态切换 .milkdown-virtualized 类 */
const applyVirtualization = (view: EditorView, root: HTMLDivElement | null) => {
  if (!root) return
  root.classList.toggle('milkdown-virtualized', view.state.doc.childCount >= VIRTUALIZE_BLOCK_THRESHOLD)
}

const MilkdownEditor = ({ docKey, content, reloadTick, onChange }: Props) => {
  const contentRef = useRef(content)
  contentRef.current = content

  const editorRef = useRef<Editor | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  /** 程序化加载窗口：此期间的 doc 变化不算用户编辑（不标脏、不回写） */
  const loadingRef = useRef(false)
  /** 当前 docKey：供插件与延时任务读取最新值 */
  const docKeyRef = useRef(docKey)
  docKeyRef.current = docKey

  /** 每个标签自己的回写回调：切标签后仍必须把旧文档写回旧标签，
   *  不能复用 onChangeRef（它已指向新标签，会把旧内容写进新标签）。 */
  const onChangeByKeyRef = useRef(new Map<string, (markdown: string) => void>())
  onChangeByKeyRef.current.set(docKey, onChange)

  /** 每个标签的「按顶层块」序列化缓存。切回标签时直接复用，
   *  不再为同一篇文档重复预热。 */
  const cachesRef = useRef(new Map<string, BlockMarkdownCache>())
  const CACHES_MAX = 16
  /** 加载后的空闲预热定时器 */
  const seedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 预热期间用户已编辑：缓存就绪后需要补一次回写 */
  const pendingFlushRef = useRef(false)
  /** 组件卸载标记（startSeed 可能在卸载后触发） */
  const cancelledRef = useRef(false)

  /** 取/建某个标签的增量序列化缓存 */
  const getOrCreateCache = (ctx: Ctx, key: string): BlockMarkdownCache => {
    const existing = cachesRef.current.get(key)
    if (existing) return existing
    const serialize = ctx.get(serializerCtx)
    const schema = ctx.get(schemaCtx)
    const cache = new BlockMarkdownCache((node) => serialize(schema.topNodeType.create(null, node)))
    cachesRef.current.set(key, cache)
    while (cachesRef.current.size > CACHES_MAX) {
      const oldest = cachesRef.current.keys().next().value
      if (oldest === undefined || oldest === key) break
      cachesRef.current.delete(oldest)
    }
    return cache
  }

  /** 把当前 doc 增量序列化进缓存；budgetMs 内没做完返回 null（未就绪） */
  const serializeCurrent = (ctx: Ctx, key: string, budgetMs = Infinity): string | null => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return null
    const cache = getOrCreateCache(ctx, key)
    return cache.sync(view.state.doc, budgetMs) ? cache.markdown : null
  }

  /**
   * 该标签自「载入 / 保存」以来是否真的被用户改过。
   *
   * 没改过就**不要回写**。原因是序列化是有损归一化的：remark 会把表格单元格
   * 补齐成固定列宽（`| A1  |` → `| A1 |`）、把列表符号统一成 '-'、末尾补换行……
   * 于是「打开文件 → 切到别的标签」打一次回写，内容就和磁盘不一致了，
   * 标签被误标脏、关闭时弹「有未保存的修改」，退出时更会把整篇文件按归一化
   * 格式重写一遍。用户明明一个字都没改。
   *
   * dirtyTracker 在用户第一次真实编辑时就会 markDirty（同步，早于 200ms 防抖回写），
   * 所以这里用 isDirty 判断「有没有改过」是可靠的。
   */
  const isTouched = (key: string) => !!useAppStore.getState().tabs.find((t) => t.id === key)?.isDirty

  /** 把某个标签的最新内容回写 store（只调用该标签自己的 onChange） */
  const flushKey = (ctx: Ctx, key: string, budgetMs = Infinity): boolean => {
    const md = serializeCurrent(ctx, key, budgetMs)
    if (md == null) return false
    if (isTouched(key)) onChangeByKeyRef.current.get(key)?.(sanitizeCodeBlockTrailingNewlines(md))
    pendingFlushRef.current = false
    return true
  }

  /** 加载后空闲预热：每 tick 最多 10ms，避免一次性冻结主线程。
   *  大文档逐块序列化总量约 1.2s，分摊到空闲时间片后，用户真正开始输入时
   *  缓存通常已就绪，第一次停顿不会再卡 1 秒。 */
  const startSeed = (editor: Editor) => {
    if (seedTimerRef.current) return
    const tick = () => {
      seedTimerRef.current = null
      if (cancelledRef.current || editorRef.current !== editor) return
      let ready = false
      editor.action((ctx) => {
        const key = docKeyRef.current
        ready = serializeCurrent(ctx, key, 10) != null
        if (ready && pendingFlushRef.current) {
          pendingFlushRef.current = false
          flushKey(ctx, key)
        }
      })
      if (!ready) seedTimerRef.current = setTimeout(tick, 0)
    }
    seedTimerRef.current = setTimeout(tick, 0)
  }

  /** 每个标签的状态快照（按 docKey）：切走时保存 EditorState + 滚动位置，
   *  切回来直接 updateState 还原，跳过 remark 解析与 EditorState.create。
   *
   *  实测（663KB / 2000 标题，共 ~5000 顶层块）：切标签总耗时 ~2s，其中
   *  纯解析占 ~1.1s（约 55%）。缓存后切回命中只需 decorations + DOM diff，
   *  解析归零；同时保留每个标签各自的撤销栈与选区，比原来 flush=true 每次
   *  清空撤销栈的行为更合理。
   *
   *  内存预算：doc.nodeSize ≈ 文档字符数，单篇 600KB 文档的树就有几十 MB，
   *  全部常驻会压垮低配机器，所以条数与总量双重约束、按 LRU 淘汰。
   */
  const SNAPSHOTS_MAX = 16
  const SNAPSHOT_DOCSIZE_MAX = 1_500_000
  const snapshotRef = useRef<Map<string, { state: EditorState; scrollTop: number; size: number }>>(new Map())
  /** 外部磁盘重载时需绕过快照：快照里的 doc 已不是磁盘最新内容 */
  const bypassCacheRef = useRef(false)

  /** 存入/刷新一个快照；超出条数或总量预算时按 LRU 从最旧淘汰 */
  const putSnapshot = (key: string, state: EditorState, scrollTop: number) => {
    const m = snapshotRef.current
    m.delete(key) // 先删再存，保证 LRU 顺序
    m.set(key, { state, scrollTop, size: state.doc.nodeSize })
    while (m.size > SNAPSHOTS_MAX) {
      const oldest = m.keys().next().value
      if (oldest === undefined) break
      m.delete(oldest)
    }
    let total = 0
    for (const entry of m.values()) total += entry.size
    while (total > SNAPSHOT_DOCSIZE_MAX && m.size > 1) {
      const oldest = m.keys().next().value
      if (oldest === undefined) break
      total -= m.get(oldest)!.size
      m.delete(oldest)
    }
  }

  /** 保存指定标签此刻的状态快照（内容没变则跳过） */
  const snapshotDoc = (editor: Editor, key: string) => {
    const view = editor.action((ctx) => ctx.get(editorViewCtx) ?? null)
    if (!view || view.isDestroyed) return
    const doc = view.state.doc
    const prev = snapshotRef.current.get(key)
    if (prev && prev.state.doc === doc) return
    putSnapshot(key, view.state, rootRef.current?.scrollTop ?? 0)
  }

  /** 上一个 docKey：切标签时用旧 key 存快照（此刻闭包里的 docKey 已是新值） */
  const prevDocKeyRef = useRef(docKey)

  /** 程序化加载文档内容，并记录加载后的 doc。
   *
   *  flush 语义必须保留（updateState 而非 dispatch tr.replace）：否则程序化
   *  加载会被 prosemirror-history 记入撤销栈，切标签 A→B 后 Ctrl+Z 会把 A 的
   *  内容留在 B 里，进而被 Ctrl+S / 自动保存写进 B 的文件。
   *
   *  代价：updateState 不走 dispatch，Milkdown 的 updated / markdownUpdated
   *  监听收不到这条加载事务，所以大纲必须由下面的 setTimeout 手动补收集。
   */
  const applyLoaded = (editor: Editor, md: string) => {
    loadingRef.current = true
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!view || view.isDestroyed) return
      try {
        const snap = bypassCacheRef.current ? undefined : snapshotRef.current.get(docKey)
        if (snap) {
          // 快照命中：直接换状态，解析成本归零。撤销栈 / 选区随快照一起还原。
          view.updateState(snap.state)
          // DOM 写入是同步的，但布局在下一帧；延后到帧末再还原滚动位置，
          // 否则 scrollTop 可能因内容高度未就绪而失效
          requestAnimationFrame(() => {
            const root = rootRef.current
            if (root && !view.isDestroyed) root.scrollTop = snap.scrollTop
          })
        } else {
          const parsed = ctx.get(parserCtx)(sanitizeCodeBlockTrailingNewlines(md))
          if (!parsed) return
          // 标题 id 在这里一次写好（O(n) 树重建）。留给插件在载入后补，会是一个
          // 含上千个 setNodeMarkup 的事务，ProseMirror 逐步骤重放退化成 O(n²)，
          // 大文件表现为「打开后敲第一个字卡一秒」。
          const doc = withHeadingIds(ctx, parsed)
          // 首帧前就切虚拟化 class：applyVirtualization 原本在 updateState 之后才调，
          // 于是 4345 个块的首次布局/绘制全都按「可见」处理了一遍。提前打上这个类，
          // 浏览器在首次布局时就能跳过视口外的块（实测 updateState 从 1.2s → 0.5s）。
          rootRef.current?.classList.toggle(
            'milkdown-virtualized',
            doc.childCount >= VIRTUALIZE_BLOCK_THRESHOLD,
          )
          const state = EditorState.create(
            ctx.get(editorStateOptionsCtx)({
              schema: ctx.get(schemaCtx),
              doc,
              plugins: ctx.get(prosePluginsCtx),
            }),
          )
          view.updateState(state)
          // 缓存本次解析结果：下次切回这个标签不必再解析一遍
          putSnapshot(docKey, state, rootRef.current?.scrollTop ?? 0)
        }
      } catch (err) {
        // 渲染管线中任一节点 toDOM 抛错（如 KaTeX 遇非法 LaTeX、HTML 节点解析异常等）
        // 会冒泡到此处。若不兜底，编辑器会停在半加载状态、界面卡死。
        console.error('[Milkdown] load render failed:', err)
        useAppStore.getState().showToast('文档渲染失败，请检查异常公式 / HTML 等内容后重试')
      }
      applyVirtualization(view, rootRef.current)
      // 补收集大纲：updateState 绕过 dispatch，updated 监听收不到加载事务。
      // 延后一帧：DOM 写入要等下一个 paint 才反映到布局，
      // 立即 nodeDOM() 拿到的标题位置可能还是旧的
      setTimeout(() => {
        if (view.isDestroyed) return
        collectOutlineNow(view)
      }, 0)
    })
    // 加载结束（同步部分已完成）后解除“程序化加载”标记
    setTimeout(() => { loadingRef.current = false }, 0)
    // 空闲预热该标签的增量序列化缓存
    startSeed(editor)
  }

  const setOutline = useAppStore((s) => s.setOutline)
  const setActiveOutlinePos = useAppStore((s) => s.setActiveOutlinePos)
  const registerJumpHandler = useAppStore((s) => s.registerJumpHandler)
  const registerEditor = useAppStore((s) => s.registerEditor)
  const hideContextMenu = useAppStore((s) => s.hideContextMenu)
  /** 标题 pos → 标题 DOM 元素（大纲重算时刷新），供点击大纲跳转定位 */
  const headingDomsRef = useRef<Map<number, HTMLElement>>(new Map())
  /** 标题 pos 升序数组：scroll-spy 用它做二分查找，避免逐标题读几何 */
  const headingPosRef = useRef<number[]>([])
  /** 上次收集大纲时的 doc 引用：纯光标移动（选区事务）不重扫。
   *  放组件级而非 effect 局部变量：程序化加载路径（applyLoaded）也要读它，
   *  否则加载后手动收集与防抖定时器之间会互相覆盖 */
  const lastOutlineDocRef = useRef<Node | null>(null)
  /** 大纲跳转后的 scroll-spy 抑制截止时间（见 syncActiveHeading 的说明） */
  const jumpSuppressUntilRef = useRef(0)

  /** 根据滚动位置找出当前应高亮的标题 pos（最后一个还没滚出容器顶部的标题）
   *
   *  旧实现对每个标题调 getBoundingClientRect 直到找到第一个超出容器顶部的——
   *  616KB / 1125 个标题的文档滚到中后段时，一帧要读上千次几何（实测 ~147ms/帧），
   *  滚动直接卡成幻灯片。现在改成「一次 posAtCoords 拿视口顶部文档位置 +
   *  对标题位置数组二分查找」，单帧成本从 O(标题数) 降到 O(log 标题数)，
   *  且与代码块行号同步共用同一次命中测试（见 utils/viewportPos）。 */
  const syncActiveHeading = () => {
    const root = rootRef.current
    if (!root) return
    // 用户刚点了大纲项：程序化滚动引发的 scroll 事件会在同一两帧内陆续到达，
    // 此刻视口顶部可能还没落到目标标题上（padding、虚拟化估算高度都会让
    // posAtCoords 先给出一个偏前的位置），让 scroll-spy 覆盖刚刚设定的高亮，
    // 表现就是「点第 2 项，亮的却是第 1 项」。跳转后的 350ms 内以显式设定为准。
    if (performance.now() < jumpSuppressUntilRef.current) return
    const positions = headingPosRef.current
    if (positions.length === 0) {
      setActiveOutlinePos(null)
      return
    }
    const editor = editorRef.current
    if (!editor) return
    const topPos = editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!view || view.isDestroyed) return null
      return viewportTopPos(view, root)
    })
    // 视口落在内边距/空白里（posAtCoords 给不出位置）→ 保持上一次高亮，不抖动
    if (topPos == null) return
    // 找最后一个 pos <= topPos 的标题。
    // +1 容差是必需的：posAtCoords 落在块的**上边界**时会返回「块前一位」
    // （实测标题 pos=19，命中返回 18），不留容差就永远高亮到上一个标题——
    // 表现为点大纲最后一项，高亮却停在倒数第二项。
    // 同样修掉另一个边界：文档滚到最顶部时 topPos=0、首标题 pos=1，
    // 不留容差则首个标题永远不高亮。
    let lo = 0
    let hi = positions.length - 1
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (positions[mid] <= topPos + 1) {
        ans = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    setActiveOutlinePos(ans >= 0 ? positions[ans] : null)
  }

  /**
   * 收集一次大纲并同步激活标题。
   *
   * 正常输入路径由 updated 监听的防抖定时器调用；程序化加载路径必须显式调用
   * ——见 applyLoaded 里对 flush=true 的说明。
   */
  const collectOutlineNow = (view: EditorView) => {
    // 内容未变（纯光标移动/选区变化触发的事务）→ 跳过全量遍历
    if (view.state.doc === lastOutlineDocRef.current) return
    lastOutlineDocRef.current = view.state.doc
    // 每次重算都刷新标题 DOM 映射：文档内容变化后旧引用失效
    const doms = new Map<number, HTMLElement>()
    const next = collectOutline(view, doms)
    headingDomsRef.current = doms
    headingPosRef.current = next.map((i) => i.pos)
    const prev = useAppStore.getState().outline
    const changed =
      next.length !== prev.length ||
      next.some((a, i) => a.pos !== prev[i].pos || a.level !== prev[i].level || a.text !== prev[i].text)
    if (changed) setOutline(next)
    syncActiveHeading()
  }

  // 仅挂载时创建一次编辑器
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let cancelled = false
    // StrictMode 会「挂载→卸载→再挂载」复用同一个组件实例：ref 会保留，
    // 必须复位，否则第二次挂载后空闲预热会误以为已卸载而永不启动。
    cancelledRef.current = false
    /** 大纲收集防抖：连续输入时只在停顿后重算，避免每次按键全量遍历文档 */
    let outlineTimer: ReturnType<typeof setTimeout> | null = null
    /** 内容回写防抖：连续输入只在停顿 200ms 后回写一次 */
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    // 用户编辑 → 立即标脏（外部文件监听据此判断能否覆盖），并在停顿后回写内容。
    //
    // 不用 Milkdown 的 listener 插件，原因有二：
    //   1. 它的 updated 回调传入的是「最后一次用户事务的 doc」；列表编号、表格对齐等
    //      appendTransaction 会在这之后继续改 doc，导致 doc !== view.state.doc，
    //      整次回写被防护判断跳过（实测大文件里内容会写不回 store）。
    //   2. 它的 state.init 会对整篇文档完整序列化一次，大文件加载时白白多花约 1 秒。
    // 这里改为「事务后防抖，回写时取 view.state.doc」，既拿到最终文档，又保留
    // 切标签保护（定时器触发时 docKey 已变，说明旧标签已被 flush，本次作废）。
    const dirtyTracker = $prose((ctx) =>
      new Plugin({
        key: new PluginKey('mditor-dirty-tracker'),
        view: () => ({
          update: (v, prev) => {
            if (v.state.doc === prev.doc) return
            if (loadingRef.current) return
            useAppStore.getState().markDirty(docKeyRef.current)
            const key = docKeyRef.current

            if (flushTimer) clearTimeout(flushTimer)
            flushTimer = setTimeout(() => {
              flushTimer = null
              if (cancelled) return
              const view = ctx.get(editorViewCtx)
              if (!view || view.isDestroyed) return
              // 期间切了标签：旧文档已由切标签流程 flush，本次作废
              if (docKeyRef.current !== key) return

              // 内容回写（增量序列化，通常 <3ms）
              const cache = getOrCreateCache(ctx, key)
              if (cache.sync(view.state.doc, 8)) {
                const md = cache.markdown
                if (md != null) {
                  onChangeByKeyRef.current.get(key)?.(sanitizeCodeBlockTrailingNewlines(md))
                }
              } else {
                pendingFlushRef.current = true
                const ed = editorRef.current
                if (ed) startSeed(ed)
              }

              // 大纲：再等 150ms，仍无输入才全量遍历（大文档 nodeDOM 较贵）
              if (outlineTimer) clearTimeout(outlineTimer)
              outlineTimer = setTimeout(() => {
                if (cancelled) return
                const v2 = ctx.get(editorViewCtx)
                if (!v2 || v2.isDestroyed) return
                applyVirtualization(v2, rootRef.current)
                if (v2.state.doc === lastOutlineDocRef.current) return
                collectOutlineNow(v2)
              }, 150)
            }, 200)
          },
        }),
      }),
    )

    const editor = Editor.make()
      .config((ctx: Ctx) => {
        ctx.set(rootCtx, root)
      })
      .config((ctx) => {
        // 无序列表统一序列化成 "-"。
        // remark-stringify 默认输出 "*"，而绝大多数 Markdown（含 Windows 上常见的
        // 各种编辑器产出）写的是 "-"。不改这一步的话，「打开文件 → 切到别的标签」
        // 触发的回写序列化会把 "- 项" 变成 "* 项"，与磁盘内容不一致 →
        // 标签被误标脏、关闭时弹「有未保存的修改」，退出时甚至会把整篇文件的
        // 列表符号批量改写。保持 "-" 才能让「没改过的文件」真正等于磁盘内容。
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({
          ...prev,
          bullet: '-' as const,
          handlers: {
            ...(prev as { handlers?: Record<string, unknown> }).handlers,
            // 下划线：Markdown 无原生语法，输出 HTML 的 <u>…</u>（与 Typora 一致）。
            // 内容交给 containerPhrasing 递归序列化，这样 <u>里的**粗体**</u>
            // 能正确带上标记，而不是把 markdown 源码当字面量吐出来。
            underline: (node: unknown, _parent: unknown, st: unknown) => {
              const state = st as {
                enter: (name: string) => () => void
                containerPhrasing: (parent: unknown, info: unknown) => string
              }
              const exit = state.enter('underline')
              const inner = state.containerPhrasing(node, { before: '<', after: '>' })
              exit()
              return `<u>${inner}</u>`
            },
          } as typeof prev.handlers,
        }))
      })
      .config(markConfig)
      .config((ctx) => {
        // 保留默认 uploadWidgetFactory，仅覆盖 uploader 与 HTML 上传开关
        ctx.set(uploadConfig.key, {
          ...ctx.get(uploadConfig.key),
          uploader: imageUploader,
          enableHtmlFileUploader: true,
        })
      })
      // 剔除 remarkHtmlTransformer：块级 HTML 由 htmlPlugin 的 htmlBlock 节点
      // 以真实 DOM 渲染（默认实现只把源码当纯文本展示，且会把块级 HTML 包进
      // paragraph 导致无法区分块级/行内）。$Remark 是 [optionsCtx, plugin] 元组，
      // commonmark 数组里存放的是它扁平化后的两个成员，需按成员引用过滤。
      // 同时替换 commonmark 自带的插件：
      // 1) syncListOrderPlugin → 增量版（每个事务全量扫描文档，大文档约 14ms/键，见 plugins/listOrder.ts）。
      // 2) syncHeadingIdPlugin → 防抖版（每次文档变化都按文本重算 slug 并 setNodeMarkup，
      //    打标题时每键重建 <h4> 约 25-34ms，见 plugins/headingId.ts）。
      // 3) 四条输入规则 → Typora 版（见 plugins/typoraInput.ts）：
      //    标题 `#+` 不限级数会造出 level=7 的非法节点、引用强制要求空格、
      //    代码围栏不认 ~~~ 与 c++ 这类语言名、图片规则要求必须带 title。
      .use(
        commonmark
          .map((p) => (p === syncListOrderPlugin ? listOrderPlugin : p))
          .map((p) => (p === syncHeadingIdPlugin ? headingIdPlugin : p))
          .map((p) => (p === wrapInHeadingInputRule ? typoraHeadingInputRule : p))
          .map((p) => (p === wrapInBlockquoteInputRule ? typoraBlockquoteInputRule : p))
          .map((p) => (p === createCodeBlockInputRule ? typoraCodeFenceInputRule : p))
          // 图片规则直接剔除：上游那条要求地址后必须带 "title"，手写 `![a](u)`
          // 永远匹配不上；改用 mdAutoConvertPlugin 统一处理。
          .filter((p) => p !== insertImageInputRule)
          // 空段落不要序列化成 `<br />`：只保留解析侧「吃掉孤立 <br />」的容错，
          // 序列化侧由 mdClean.ts 的插件接管。详见该文件顶部注释。
          // 注意 $remark 的返回值是 [plugin, options] 两元组，经过 commonmark 的
          // .flat() 后变成两个独立成员，所以必须按成员引用过滤（同 remarkHtmlTransformer）。
          .filter(
            (p) =>
              !([remarkPreserveEmptyLinePlugin[0], remarkPreserveEmptyLinePlugin[1]] as unknown[]).includes(p),
          )
          .filter(
            (p) => !([remarkHtmlTransformer[0], remarkHtmlTransformer[1]] as unknown[]).includes(p),
          ),
      )
      .use(typoraKeymap)  // Typora 键位：Ctrl+1..6 / Ctrl+= / Ctrl+- / Ctrl+Shift+K 等
      // 列表项里敲 `- ` 生成嵌套子列表；引用块内空段落的行首空格吞掉。
      // 这两条都不替换上游规则，是**新增**的（上游在这两种场景下静默失效），
      // 所以必须单独注册，不能只靠上面 commonmark.map 的引用替换。
      .use(typoraNestedList)
      .use(blockquoteSpaceGuard)
      .use(overrideListCommands)  // override built-in: wrapInList instead of wrapIn
      // 手写语法的收尾转换（上游没有）：`[文字](地址)`→链接、`![图](地址)`→图片、
      // `[^1]`→脚注引用。放在 gfm 之后注册，等它的表格/任务列表规则先跑。
      .use(mdAutoConvertPlugin)
      // gfm 的删除线规则会把 `~~~` 当成「删除线套一个 ~」吃掉，导致 Typora 的
      // `~~~` 代码围栏永远成型不了 —— 换成 plugins/typoraInput.ts 里的加固版。
      .use(gfm.map((p) => (p === strikethroughInputRule ? typoraStrikethroughInputRule : p)))
      .use(history)
      .use(codeHighlightPlugin)
      .use(upload)
      .use(searchPlugin)
      .use(contextMenuPlugin)
      .use(languageBadgePlugin)
      .use(math)
      .use(markHighlightPlugin)
      .use(copyButtonPlugin)
      .use(imagePlugin)
      .use(htmlPlugin)
      .use(underlinePlugin)  // Ctrl+U：underline mark ↔ <u>…</u>
      .use(dropEmptyLineBreakPlugin)  // 解析容错：吃掉老文件里孤立的 <br />
      .use(htmlSvgEditPlugin)
      .use(svgSourceEditorMilkdownPlugin)
      .use(autoPairPlugin)
      .use(calloutPlugin)
      .use(codeBlockLineNumbers)
      .use(codeBlockCaretPlugin)
      // mermaid 代码块渲染成图表。插件本体只依赖 Milkdown 轻模块，
      // mermaid 库在 plugins/mermaid.ts 内部 await import('mermaid') 按需加载，
      // 注册它不影响启动速度（vite 也把它拆成独立 chunk）。
      .use(mermaidPlugin)
      .use(emojiAutocompletePlugin)
      .use(excelPastePlugin)
      .use(footnotePlugin)
      .use(tablePlugin)
      .use(tableClipboardPlugin)
      .use(tableDragReorderPlugin)
      .use(taskTogglePlugin)
      .use(typewriterPlugin)
      .use(dirtyTracker)

    // 编辑器创建过程中会触发空文档的 updated；此时还没加载真实文档，
    // applyLoaded 会置位 loadingRef 挡住这次误标脏。
    editor
      .create()
      .then((e) => {
        if (cancelled) {
          e.destroy()
          return
        }
        editorRef.current = e
        registerEditor(e)
        // 打开文档时收起可能残留的右键菜单
        hideContextMenu()
        // 编辑器就绪后加载当前文档内容（大纲由 applyLoaded 手动补收集）
        applyLoaded(e, contentRef.current)
      })
      .catch(console.error)

    return () => {
      cancelled = true
      cancelledRef.current = true
      if (outlineTimer) clearTimeout(outlineTimer)
      if (flushTimer) clearTimeout(flushTimer)
      if (seedTimerRef.current) {
        clearTimeout(seedTimerRef.current)
        seedTimerRef.current = null
      }
      // 卸载前把当前标签的最新内容同步回 store（切源码模式 / 关闭标签时防丢）。
      // 增量序列化通常 <3ms；缓存未就绪时才可能多花一点时间，属于兜底。
      const flushing = editorRef.current
      if (flushing) flushing.action((ctx) => { flushKey(ctx, docKeyRef.current, Infinity) })
      setOutline([])
      setActiveOutlinePos(null)
      registerEditor(null)
      hideContextMenu()
      const created = editorRef.current
      editorRef.current = null
      if (created) created.destroy().catch(() => {})
      else editor.destroy().catch(() => {})
    }
  }, [setOutline, setActiveOutlinePos, registerEditor, hideContextMenu])

  // 注册大纲点击跳转处理器
  useEffect(() => {
    registerJumpHandler((pos) => {
      const editor = editorRef.current
      if (!editor) return
      // 先置抑制窗口，再滚动：dispatch 触发的 scrollIntoView 会同步改 scrollTop
      jumpSuppressUntilRef.current = performance.now() + 350
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        if (!view || view.isDestroyed) return
        const $pos = view.state.doc.resolve(pos)
        const tr = view.state.tr
          .setSelection(TextSelection.near($pos))
          .scrollIntoView()
        view.dispatch(tr)
        view.focus()
        // 让目标标题对齐滚动容器顶部，并立即高亮对应大纲项
        const root = rootRef.current
        const el = headingDomsRef.current.get(pos)
        if (root && el?.isConnected) {
          const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
          root.scrollTop = Math.max(0, top - 8)
        }
        setActiveOutlinePos(pos)
      })
    })
    return () => registerJumpHandler(null)
  }, [registerJumpHandler, setActiveOutlinePos])

  // 滚动监听（scroll-spy）：滚动内容时同步大纲高亮。
  // 使用 requestAnimationFrame 节流，避免每次滚动事件都调用 getBoundingClientRect。
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let rafId = 0
    const throttled = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        syncActiveHeading()
      })
    }
    root.addEventListener('scroll', throttled, { passive: true })
    syncActiveHeading()
    return () => {
      root.removeEventListener('scroll', throttled)
      if (rafId) cancelAnimationFrame(rafId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // docKey 变化（切换标签）时替换文档内容，不重建编辑器实例。
  // 切走前先用「旧 key」把最新内容增量序列化回旧标签，再存快照：
  // 此刻闭包里的 docKey 已是新值，若直接用它会把上一个标签的 doc 存进新标签名下。
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const oldKey = prevDocKeyRef.current
    if (oldKey !== docKey) {
      // 增量序列化通常 <3ms；只有缓存尚未预热完才需要兜底全量（很少见）
      editor.action((ctx) => { flushKey(ctx, oldKey) })
      snapshotDoc(editor, oldKey)
    }
    prevDocKeyRef.current = docKey
    applyLoaded(editor, content)
  }, [docKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // 保存前强制把编辑器里尚未回写的最新内容同步到 store。
  // 输入内容只在停顿 200ms 后回写；若用户敲完立刻 Ctrl+S / 自动保存 / 退出，
  // saveTab 会先调用这个 flusher，保证落盘的是最新内容而不是上一次防抖结果。
  const registerContentFlusher = useAppStore((s) => s.registerContentFlusher)
  useEffect(() => {
    registerContentFlusher(() => {
      const editor = editorRef.current
      if (!editor) return
      editor.action((ctx) => { flushKey(ctx, docKeyRef.current, Infinity) })
    })
    return () => registerContentFlusher(null)
  }, [registerContentFlusher])

  // 拼写检查：同步 spellcheck 属性到编辑器 contenteditable 元素
  const spellcheck = useSettingsStore((s) => s.spellcheck)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ce = root.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (ce) ce.spellcheck = spellcheck
  }, [spellcheck])

  // 外部文件修改 → 从磁盘重新加载文档。
  const lastReloadTickRef = useRef(0)
  useEffect(() => {
    if (!reloadTick || reloadTick === lastReloadTickRef.current) return
    lastReloadTickRef.current = reloadTick
    const editor = editorRef.current
    if (!editor) return
    // 磁盘内容已变：绕过快照缓存，否则还原的是旧状态、外部修改不生效
    bypassCacheRef.current = true
    applyLoaded(editor, contentRef.current)
    // 兜底复位：加载结束后恢复正常编辑判定
    setTimeout(() => {
      bypassCacheRef.current = false
    }, 0)
  }, [reloadTick]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={rootRef} className="milkdown h-full overflow-auto" />
}

export default MilkdownEditor