import { useRef, useEffect } from 'react'
import {
  Editor,
  rootCtx,
  editorViewCtx,
  parserCtx,
  schemaCtx,
  editorStateOptionsCtx,
  prosePluginsCtx,
} from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { commonmark, remarkHtmlTransformer } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { history } from '@milkdown/kit/plugin/history'
import { TextSelection, EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { search } from 'prosemirror-search'
import { highlight as highlightPlugin, highlightPluginConfig } from '@milkdown/plugin-highlight'
import { upload, uploadConfig } from '@milkdown/plugin-upload'
import type { Node, Schema } from '@milkdown/kit/prose/model'
import { highlightParser } from '../../config/lowlight'
import type { OutlineItem } from '../../types'
import { useAppStore } from '../../stores/useAppStore'
import { useSettingsStore } from '../../stores/settings'
import { saveImageToAssets } from '../../services/images'
import { contextMenuPlugin } from '../ContextMenu/contextMenuPlugin'
import { languageBadgePlugin } from '../ContextMenu/languageBadgePlugin'
import { math } from '../../plugins/math'
import { frontmatter } from '../../plugins/frontmatter'
import { overrideListCommands } from '../../plugins/list'
import { highlight as markHighlightPlugin, markConfig } from '../../plugins/mark'
import { copyButtonPlugin } from '../../plugins/copyButton'
import { imagePlugin } from '../../plugins/image'
import { htmlPlugin } from '../../plugins/html'
import { htmlSvgEditPlugin } from '../../plugins/htmlSvgEdit'
import { svgSourceEditorMilkdownPlugin } from '../../plugins/svgSourceEditor'
import { autoPairPlugin } from '../../plugins/autoPair'
import { calloutPlugin } from '../../plugins/callout'
import { codeBlockLineNumbers } from '../../plugins/codeBlockLineNumbers'
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
  // 保持最新引用，避免闭包过期
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const contentRef = useRef(content)
  contentRef.current = content

const editorRef = useRef<Editor | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  /** 程序化加载后的 doc：用于识别"非用户编辑"的同步，避免打开文件就误标未保存 */
  const loadedDocRef = useRef<Node | null>(null)
  const skipSyncRef = useRef(false)

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
    skipSyncRef.current = true
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!view || view.isDestroyed) return
      try {
        const snap = bypassCacheRef.current ? undefined : snapshotRef.current.get(docKey)
        if (snap) {
          // 快照命中：直接换状态，解析成本归零。撤销栈 / 选区随快照一起还原。
          view.updateState(snap.state)
          loadedDocRef.current = snap.state.doc
          // DOM 写入是同步的，但布局在下一帧；延后到帧末再还原滚动位置，
          // 否则 scrollTop 可能因内容高度未就绪而失效
          requestAnimationFrame(() => {
            const root = rootRef.current
            if (root && !view.isDestroyed) root.scrollTop = snap.scrollTop
          })
        } else {
          const doc = ctx.get(parserCtx)(sanitizeCodeBlockTrailingNewlines(md))
          if (!doc) return
          const state = EditorState.create(
            ctx.get(editorStateOptionsCtx)({
              schema: ctx.get(schemaCtx),
              doc,
              plugins: ctx.get(prosePluginsCtx),
            }),
          )
          view.updateState(state)
          loadedDocRef.current = view.state.doc
          // 缓存本次解析结果：下次切回这个标签不必再解析一遍
          putSnapshot(docKey, state, rootRef.current?.scrollTop ?? 0)
        }
      } catch (err) {
        // 渲染管线中任一节点 toDOM 抛错（如 KaTeX 遇非法 LaTeX、HTML 节点解析异常等）
        // 会冒泡到此处。若不兜底，编辑器会停在半加载状态、界面卡死。
        console.error('[Milkdown] load render failed:', err)
        loadedDocRef.current = null
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
    setTimeout(() => { skipSyncRef.current = false }, 0)
  }

  const setOutline = useAppStore((s) => s.setOutline)
  const setActiveOutlinePos = useAppStore((s) => s.setActiveOutlinePos)
  const registerJumpHandler = useAppStore((s) => s.registerJumpHandler)
  const registerEditor = useAppStore((s) => s.registerEditor)
  const hideContextMenu = useAppStore((s) => s.hideContextMenu)
  /** 标题 pos → 标题 DOM 元素（大纲重算时刷新），scroll-spy 计算用 */
  const headingDomsRef = useRef<Map<number, HTMLElement>>(new Map())
  /** 上次收集大纲时的 doc 引用：纯光标移动（选区事务）不重扫。
   *  放组件级而非 effect 局部变量：程序化加载路径（applyLoaded）也要读它，
   *  否则加载后手动收集与防抖定时器之间会互相覆盖 */
  const lastOutlineDocRef = useRef<Node | null>(null)

  /** 根据滚动位置找出当前应高亮的标题 pos（最后一个还没滚出容器顶部的标题） */
  const syncActiveHeading = () => {
    const root = rootRef.current
    if (!root) return
    const doms = headingDomsRef.current
    if (doms.size === 0) {
      setActiveOutlinePos(null)
      return
    }
    const rootTop = root.getBoundingClientRect().top
    const viewTop = root.scrollTop + 8 // 标题距容器顶部 8px 内视为"当前"
    let active: number | null = null
    // doms 按文档顺序插入（collectOutline 的 descendants 顺序），找到第一个超出即停止
    for (const [pos, el] of doms) {
      if (!el.isConnected) continue
      const top = el.getBoundingClientRect().top - rootTop + root.scrollTop
      if (top <= viewTop) active = pos
      else break
    }
    setActiveOutlinePos(active)
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
    /** 大纲收集防抖：连续输入时只在停顿后重算，避免每次按键全量遍历文档 */
    let outlineTimer: ReturnType<typeof setTimeout> | null = null

    const editor = Editor.make()
      .config((ctx: Ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(highlightPluginConfig.key, { parser: highlightParser })
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
      .config((ctx) => {
        const l = ctx.get(listenerCtx)
        // 内容更新 → 回写 store：实时同步大纲（防抖：停顿 150ms 后才重算）
        l.updated((ctx2) => {
          const view = ctx2.get(editorViewCtx)
          if (!view) return
          const doc = view.state.doc
          // 程序化加载后的首次同步：内容与加载时完全一致（非用户编辑）→ 标记本次跳过回写。
          // loadedDocRef 是一次性“加载窗口”标记，无论是否匹配都在首次 updated 后清空。
          if (loadedDocRef.current) {
            if (doc.eq(loadedDocRef.current)) skipSyncRef.current = true
            loadedDocRef.current = null
          }
          // 防抖收集大纲：避免每次按键都全量遍历文档（大文档输入时是主要 CPU 热点）。
          if (outlineTimer) clearTimeout(outlineTimer)
          outlineTimer = setTimeout(() => {
            if (cancelled) return
            const v = ctx2.get(editorViewCtx)
            if (!v) return
            applyVirtualization(v, rootRef.current)
            // 内容未变（纯光标移动/选区变化触发的事务）→ 跳过全量遍历
            if (v.state.doc === lastOutlineDocRef.current) return
            collectOutlineNow(v)
          }, 150)
        })
        // Markdown 变化 → 通知父组件（跳过程序化加载的回显，避免打开即“未保存”）
        l.markdownUpdated((_ctx, md) => {
          if (skipSyncRef.current) {
            skipSyncRef.current = false
            return
          }
          const clean = sanitizeCodeBlockTrailingNewlines(md)
          onChangeRef.current(clean)
        })
      })
      // 剔除 remarkHtmlTransformer：块级 HTML 由 htmlPlugin 的 htmlBlock 节点
      // 以真实 DOM 渲染（默认实现只把源码当纯文本展示，且会把块级 HTML 包进
      // paragraph 导致无法区分块级/行内）。$Remark 是 [optionsCtx, plugin] 元组，
      // commonmark 数组里存放的是它扁平化后的两个成员，需按成员引用过滤。
      .use(
        commonmark.filter(
          (p) => !([remarkHtmlTransformer[0], remarkHtmlTransformer[1]] as unknown[]).includes(p),
        ),
      )
      .use(overrideListCommands)  // override built-in: wrapInList instead of wrapIn
      .use(gfm)
      .use(history)
      .use(listener)
      .use(highlightPlugin)
      .use(upload)
      .use(searchPlugin)
      .use(contextMenuPlugin)
      .use(languageBadgePlugin)
      .use(math)
      .use(frontmatter)
      .use(markHighlightPlugin)
      .use(copyButtonPlugin)
      .use(imagePlugin)
      .use(htmlPlugin)
      .use(htmlSvgEditPlugin)
      .use(svgSourceEditorMilkdownPlugin)
      .use(autoPairPlugin)
      .use(calloutPlugin)
      .use(codeBlockLineNumbers)
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

    // 编辑器创建过程中会触发空文档的 updated → markdownUpdated，
    // 先置位 skipSync 防止空内容覆盖 store，applyLoaded 会重新置位并复位。
    skipSyncRef.current = true
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
      if (outlineTimer) clearTimeout(outlineTimer)
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
  // 切走前先用「旧 key」存快照：此刻闭包里的 docKey 已是新值，
  // 若直接用它会把上一个标签的 doc 存进新标签名下。
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (prevDocKeyRef.current !== docKey) snapshotDoc(editor, prevDocKeyRef.current)
    prevDocKeyRef.current = docKey
    applyLoaded(editor, content)
  }, [docKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // 拼写检查：同步 spellcheck 属性到编辑器 contenteditable 元素
  const spellcheck = useSettingsStore((s) => s.spellcheck)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ce = root.querySelector('[contenteditable="true"]') as HTMLElement | null
    if (ce) ce.spellcheck = spellcheck
  }, [spellcheck])

  // 外部文件修改 → 从磁盘重新加载文档。
  // 用 skipSync 标记跳过 markdownUpdated 回写：加载内容即为磁盘原文，
  // 若回写会与编辑器序列化结果比较而可能误标未保存。
  const lastReloadTickRef = useRef(0)
  useEffect(() => {
    if (!reloadTick || reloadTick === lastReloadTickRef.current) return
    lastReloadTickRef.current = reloadTick
    const editor = editorRef.current
    if (!editor) return
    // 磁盘内容已变：绕过快照缓存，否则还原的是旧状态、外部修改不生效
    bypassCacheRef.current = true
    skipSyncRef.current = true
    applyLoaded(editor, contentRef.current)
    // 兜底复位：若加载内容与当前 doc 完全一致（未触发 markdownUpdated），
    // 避免吞掉后续用户编辑的同步
    setTimeout(() => {
      bypassCacheRef.current = false
      skipSyncRef.current = false
    }, 0)
  }, [reloadTick]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={rootRef} className="milkdown h-full overflow-auto" />
}

export default MilkdownEditor