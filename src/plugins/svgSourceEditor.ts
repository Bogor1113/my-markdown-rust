import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { serializerCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { useAppStore } from '../stores/useAppStore'

/// SVG 源码弹窗编辑器：单击 SVG 图片后弹出居中的源码编辑弹窗
/// （textarea + 实时预览 + 应用/放弃），编辑完成后回写文档并落盘。
///
/// 实现方式：编辑 DOM 挂在 document.body 上（浮层，覆盖编辑器），不写文档节点。
/// 会话状态通过插件 state（open 标志）追踪：外部事务改动文档（重载/别处编辑）
/// 会自动关闭弹窗，保证不会发生「弹窗开着但内容已被替换」的悬空状态。
///
/// 保存：onApply 回写用 setNodeMarkup 更新 htmlBlock/image 节点（触发 milkdown 的
/// markdownUpdated → store.updateContent），应用成功后立即 saveTab 落盘，保证修改进文件。

const svgSourceEditorKey = new PluginKey<{ open: boolean }>('mditor-svg-source-editor')

interface OpenOptions {
  pos: number
  source: string
  /** 用户点「应用」：把新源码回写到节点 / 文件；返回 true（或 resolve true）表示成功并收起弹窗 */
  onApply: (newSource: string) => boolean | Promise<boolean>
}

/// 计算 nodePos 所在块结束后的文档位置（历史遗留，供传入 pos；弹窗不再使用）
export const afterBlockPos = (view: EditorView, nodePos: number): number => {
  const doc = view.state.doc
  const clamped = Math.max(0, Math.min(nodePos, doc.content.size))
  const $pos = doc.resolve(clamped)
  let d = $pos.depth
  while (d > 0 && !$pos.node(d).isBlock) d--
  const start = d === 0 ? 0 : $pos.before(d)
  return start + $pos.node(d).nodeSize
}

/** 当前挂在 body 上的弹窗根元素（一次只允许一个） */
let persistentEditorRoot: HTMLElement | null = null

const removePersistentRoot = () => {
  if (persistentEditorRoot?.parentNode) {
    persistentEditorRoot.parentNode.removeChild(persistentEditorRoot)
  }
  persistentEditorRoot = null
}

export const svgSourceEditorPlugin = new Plugin<{ open: boolean }>({
  key: svgSourceEditorKey,
  state: {
    init: () => ({ open: false }),
    apply: (tr, value) => {
      const meta = tr.getMeta(svgSourceEditorKey)
      if (meta !== undefined) {
        // 显式开关：打开 / 关闭（关闭时同步摘下浮层）
        if (!meta) removePersistentRoot()
        return { open: !!meta }
      }
      // 文档被外部事务改动（应用回写 / 重载内容 / 用户编辑别处）→ 收起弹窗
      if (tr.docChanged && value?.open) {
        removePersistentRoot()
        return { open: false }
      }
      return { open: value?.open ?? false }
    },
  },
  props: {},
})

/** 编辑器上下文：应用成功时同步序列化当前文档并显式落盘（见 applySaveNow） */
let editorCtx: Ctx | null = null

/** 应用成功 → 立即保存：不依赖 markdownUpdated 的 200ms 防抖 / 30s 自动保存定时器 */
const applySaveNow = (view: EditorView) => {
  const store = useAppStore.getState()
  const id = store.activeTabId
  if (!id) return
  const trySave = () => store.saveTab(id).catch((e) => store.showToast(`保存失败：${String(e)}`))
  if (!editorCtx) {
    trySave()
    return
  }
  try {
    // 用与 markdownUpdated 相同的序列化器同步生成最新 markdown → 标记脏 → 立即写盘。
    // 内容未变化（本地 .svg 文件场景不写文档）时 updateContent 短路，saveTab 也因
    // !isDirty 跳过，不会产生多余写入。
    const md = String(editorCtx.get(serializerCtx)(view.state.doc))
    store.updateContent(id, md)
    trySave()
  } catch {
    // 序列化异常 → 回退：等待既有 markdownUpdated → 自动保存链路兜底
  }
}

export const svgSourceEditorMilkdownPlugin = $prose((ctx) => {
  editorCtx = ctx
  return svgSourceEditorPlugin
})

/** 校验文本是否为合法 XML（含 parsererror 说明解析失败），与旧弹窗口径一致 */
function xmlInValid(text: string): boolean {
  try {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
    return !!doc.querySelector('parsererror')
  } catch {
    return true
  }
}

function buildEditorDom(
  source: string,
  onApply: (newSource: string) => boolean | Promise<boolean>,
  onCancel: () => void,
): HTMLElement {
  const dialog = document.createElement('div')
  dialog.className = 'mditor-svg-source'
  dialog.contentEditable = 'false'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')

  const bar = document.createElement('div')
  bar.className = 'mditor-svg-source-bar'

  const title = document.createElement('span')
  title.className = 'mditor-svg-source-title'
  title.textContent = 'SVG 源码'

  const hint = document.createElement('span')
  hint.className = 'mditor-svg-source-hint'
  hint.textContent = 'Esc 放弃 · Ctrl+Enter 应用'

  const warn = document.createElement('span')
  warn.className = 'mditor-svg-source-warn'

  const okBtn = document.createElement('button')
  okBtn.type = 'button'
  okBtn.className = 'mditor-dialog-btn primary'
  okBtn.textContent = '应用'

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'mditor-dialog-btn'
  cancelBtn.textContent = '放弃'

  const actions = document.createElement('span')
  actions.className = 'mditor-svg-source-actions'
  actions.append(okBtn, cancelBtn)
  bar.append(title, hint, warn, actions)

  const body = document.createElement('div')
  body.className = 'mditor-svg-source-body'

  const code = document.createElement('textarea')
  code.className = 'mditor-svg-source-code'
  code.spellcheck = false
  code.autocomplete = 'off'
  code.autocapitalize = 'off'
  code.value = source

  const preview = document.createElement('div')
  preview.className = 'mditor-svg-source-preview'
  const previewImg = document.createElement('img')
  previewImg.alt = 'SVG 预览'
  preview.appendChild(previewImg)

  body.append(code, preview)
  dialog.append(bar, body)

  const refreshPreview = () => {
    const text = code.value
    warn.textContent = xmlInValid(text) ? '当前内容不是合法 XML/SVG，应用需谨慎' : ''
    previewImg.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
  }
  previewImg.addEventListener('error', () => preview.classList.add('mditor-svg-source-preview-error'))
  previewImg.addEventListener('load', () => preview.classList.remove('mditor-svg-source-preview-error'))

  let previewTimer: ReturnType<typeof setTimeout> | null = null
  code.addEventListener('input', () => {
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = setTimeout(refreshPreview, 150)
  })

  let applying = false
  const runApply = () => {
    if (applying) return
    applying = true
    okBtn.disabled = true
    Promise.resolve(onApply(code.value)).then((ok) => {
      applying = false
      okBtn.disabled = false
      if (ok) onCancel()
    })
  }
  okBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    runApply()
  })
  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onCancel()
  })
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      e.stopPropagation()
      runApply()
    }
  })

  refreshPreview()
  return dialog
}

/** 打开 SVG 源码编辑弹窗（同一时间只存在一个；重复打开会替换上一个） */
export const openSvgSourceEditor = (view: EditorView, opts: OpenOptions) => {
  if (view.isDestroyed) return
  removePersistentRoot()

  const cancel = () => {
    closeSvgSourceEditor(view)
    view.focus()
  }

  const dom = buildEditorDom(
    opts.source,
    (newSource) => {
      const result = opts.onApply(newSource)
      Promise.resolve(result).then((ok) => {
        if (ok) {
          applySaveNow(view)
          closeSvgSourceEditor(view)
          view.focus()
        }
      })
      return result
    },
    cancel,
  )

  const mask = document.createElement('div')
  mask.className = 'mditor-dialog-mask mditor-svg-source-mask'
  mask.addEventListener('mousedown', (e) => {
    // 点击遮罩（弹窗以外）＝放弃；弹窗内部（dialog 上）不触发
    if (e.target === mask) {
      e.stopPropagation()
      cancel()
    }
  })
  mask.appendChild(dom)
  document.body.appendChild(mask)
  persistentEditorRoot = mask

  // 通过插件 state 登记「弹窗已打开」：外部任何 docChange 会自动摘除浮层
  view.dispatch(view.state.tr.setMeta(svgSourceEditorKey, true))

  // 聚焦源码区（延迟到浮层渲染后）
  requestAnimationFrame(() => {
    const ta = dom.querySelector('textarea')
    ta?.focus()
  })
}

/** 收起当前 SVG 源码编辑弹窗 */
export const closeSvgSourceEditor = (view: EditorView) => {
  if (view.isDestroyed) return
  removePersistentRoot()
  if (svgSourceEditorKey.getState(view.state)?.open) {
    view.dispatch(view.state.tr.setMeta(svgSourceEditorKey, false))
  }
}