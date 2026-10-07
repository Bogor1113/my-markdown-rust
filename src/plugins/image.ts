import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import type { Node } from '@milkdown/kit/prose/model'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { $nodeSchema, $prose } from '@milkdown/kit/utils'
import { toDisplayImageSrc, toDisplaySvgSrc, isSvgSrc, toLocalAbsPath, registerSvgRerender, notifySvgRerender } from '../services/imageDisplay'
import { readFile, writeFile, base64ToBytes, bytesToBase64 } from '../services/fs'
import { useAppStore } from '../stores/useAppStore'
import { afterBlockPos, openSvgSourceEditor } from './svgSourceEditor'

/**
 * 图片节点 schema 覆盖（在 commonmark 之后注册，upsertById 替换内置 image）：
 *
 * 在 src/alt/title 基础上增加可选 width/height（px），支持：
 * - 拖拽边角缩放后持久化尺寸；
 * - Markdown 序列化用 Typora 风格尾缀 ` =宽x高`（如 `![alt](pic.png =400x300)`），
 *   仅宽度时 ` =400`（高度按比例）；
 * - 解析时仅在 URL 无查询串/锚点时拆分尾缀，避免误伤 `a.png?w=300` 这类链接。
 */
export const imageResizeSchema = $nodeSchema('image', () => ({
  inline: true,
  group: 'inline',
  selectable: true,
  draggable: true,
  marks: '',
  atom: true,
  defining: true,
  isolating: true,
  attrs: {
    src: { default: '', validate: 'string' },
    alt: { default: '', validate: 'string' },
    title: { default: '', validate: 'string' },
    // 尺寸可不填（自然大小）；拖拽缩放后写入。不设 validate，避免依赖 PM 内部校验串语义
    width: { default: null },
    height: { default: null },
  },
  parseDOM: [
    {
      tag: 'img[src]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return {}
        const w = dom.getAttribute('width')
        const h = dom.getAttribute('height')
        return {
          src: dom.getAttribute('src') || '',
          alt: dom.getAttribute('alt') || '',
          title: dom.getAttribute('title') || dom.getAttribute('alt') || '',
          width: w ? parseInt(w, 10) || null : null,
          height: h ? parseInt(h, 10) || null : null,
        }
      },
    },
  ],
  toDOM: (node) => {
    const attrs: Record<string, string | number> = {
      src: node.attrs.src as string,
      alt: node.attrs.alt as string,
      title: (node.attrs.title as string) || '',
    }
    if (node.attrs.width) attrs.width = node.attrs.width as number
    if (node.attrs.height) attrs.height = node.attrs.height as number
    return ['img', attrs]
  },
  parseMarkdown: {
    match: ({ type }) => type === 'image',
    runner: (state, node, type) => {
      const url = String(node.url ?? '')
      let src = url
      let width: number | null = null
      let height: number | null = null
      // 拆分 `url =300x200` 尾缀（Typora 风格，等号前必须有空格，
      // 避免把 `https://x.com/a=300` 这类 URL 误拆）
      if (!url.includes('?') && !url.includes('#')) {
        const m = /^(.*?)\s+=(\d+)(?:x(\d+))?$/.exec(url)
        if (m && m[1]) {
          src = m[1].trim()
          width = parseInt(m[2], 10) || null
          height = m[3] ? parseInt(m[3], 10) || null : null
        }
      }
      state.addNode(type, {
        src,
        alt: String(node.alt ?? ''),
        title: String(node.title ?? ''),
        width,
        height,
      })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'image',
    runner: (state, node) => {
      let url = String(node.attrs.src ?? '')
      const w = node.attrs.width as number | null
      const h = node.attrs.height as number | null
      if (w) url += ` =${w}${h ? `x${h}` : ''}`
      state.addNode('image', undefined, undefined, {
        title: String(node.attrs.title ?? ''),
        url,
        alt: String(node.attrs.alt ?? ''),
      })
    },
  },
}))

/**
 * 图片节点视图：
 * - 把文档里保存的相对/绝对文件路径转成 asset 协议 URL 显示（见 services/imageDisplay.ts），
 *   不改动文档里保存的原始 src（markdown 序列化仍走 attrs）；
 * - SVG 图片改为读取文本转 data URL 显示（保存后能立即刷新，避开 asset 协议缓存问题）；
 * - 单击 SVG 图片直接进入编辑模式（见 openSvgEditorFromNode）：本地文件写回磁盘，
 *   内联 data URL 更新节点 src；
 * - 选中后四角出现缩放手柄：拖拽等比缩放；按住 Shift 可自由拉伸，松手时若当前
 *   尺寸偏离锁定比例会弹出「保持比例 / 自由尺寸」选择（写入 width/height attrs 持久化）；
 * - 点击选中后可拖动移动位置；从资源管理器拖入图片由 upload 插件处理；
 * - 文件缺失时显示占位样式。
 */
export const imageNodeViewPlugin = $prose(() => {
  const createImageView = (
    node: Node,
    view: EditorView,
    getPos: () => number | undefined,
  ): NodeView => {
    const wrap = document.createElement('span')
    wrap.className = 'mditor-image-wrap'

    /** 四角缩放手柄（拖拽时按图片缩放后的角动态定位） */
    const handles: Record<'nw' | 'ne' | 'sw' | 'se', HTMLElement> = {
      nw: null!,
      ne: null!,
      sw: null!,
      se: null!,
    }

    const img = document.createElement('img')
    img.className = 'mditor-image'
    img.draggable = true
    // 不发送 Referer：CSDN 等图床有防盗链，带 WebView 来源（localhost/tauri://）的
    // Referer 会返回 403 导致在线图片裂图；其他工具能加载是因为不带 Referer。
    img.referrerPolicy = 'no-referrer'
    // 懒加载：大文档可能引用大量/大尺寸本地图片，全部立即解码进内存会吃掉
    // 数 GB（每张图浏览器会解码成完整位图驻留）。lazy + async 让浏览器只解码
    // 视口内图片、且不阻塞主线程。
    img.loading = 'lazy'
    img.decoding = 'async'
    wrap.appendChild(img)

    /** 拖拽为 transform 预览模式：wrap 固定初始尺寸占位、img 用 scale 缩放、手柄跟随角。
     *  松手/重渲染时全部还原，让布局回到真实尺寸。 */
    const resetResizeUi = () => {
      img.style.removeProperty('transform')
      img.style.removeProperty('transform-origin')
      wrap.style.removeProperty('width')
      wrap.style.removeProperty('height')
      for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
        const h = handles[corner]
        if (h) {
          h.style.removeProperty('left')
          h.style.removeProperty('top')
        }
      }
    }

    /** 用节点 attrs 同步 DOM（src 转显示地址；width/height 转内联样式）。
     *  每次只在值真正变化时才写 DOM，避免 setAttribute → MutationRecord →
     *  PM DOMObserver flush → view.update → render → setAttribute 的无限循环。 */
    const render = () => {
      const src = String(node.attrs.src ?? '')
      const alt = String(node.attrs.alt ?? '')
      const title = String(node.attrs.title ?? '')
      const w = node.attrs.width as number | null
      const h = node.attrs.height as number | null

      if (isSvgSrc(src)) {
        img.dataset.renderSrc = src
        void toDisplaySvgSrc(src).then((url) => {
          if (view.isDestroyed || img.dataset.renderSrc !== src) return
          if (img.getAttribute('src') !== url) img.setAttribute('src', url)
        })
      } else {
        const displaySrc = toDisplayImageSrc(src)
        if (img.getAttribute('src') !== displaySrc) img.setAttribute('src', displaySrc)
      }
      if (img.getAttribute('alt') !== alt) img.setAttribute('alt', alt)
      if (title) {
        if (img.getAttribute('title') !== title) img.setAttribute('title', title)
      } else if (img.hasAttribute('title')) {
        img.removeAttribute('title')
      }

      const nextW = w ? `${w}px` : ''
      const nextH = h ? `${h}px` : ''
      if (img.style.width !== nextW) { if (w) img.style.width = nextW; else img.style.removeProperty('width') }
      if (img.style.height !== nextH) { if (h) img.style.height = nextH; else img.style.removeProperty('height') }
      resetResizeUi()
    }
    render()

    // ── SVG 图片：保存后由全局通知刷新显示（注册渲染回调，销毁时注销）──
    const unregisterSvgRender = registerSvgRerender(render)

    // 加载失败（文件被移动/删除）→ 占位样式；恢复后移除
    img.addEventListener('error', () => img.classList.add('mditor-image-error'))
    img.addEventListener('load', () => img.classList.remove('mditor-image-error'))

    // ── 单击 SVG 图片 → 直接在文档内打开源码编辑条 ──
    const onImgClick = (e: MouseEvent) => {
      const src = String(node.attrs.src ?? '')
      if (!isSvgSrc(src)) return
      e.preventDefault()
      e.stopPropagation()
      openSvgEditorFromNode(view, node, getPos)
    }
    img.addEventListener('click', onImgClick)

    // ── 四角缩放手柄 ──
    // 拖拽默认锁定宽高比；按住 Shift 可自由拉伸（宽、高独立）。松手时若当前尺寸
    // 偏离锁定比例（即仍按着 Shift 自由拉伸过）会弹出「保持比例 / 自由尺寸」选择
    // （见 showResizeChoice）；中途松开 Shift 会回到锁定比例、不弹窗。
    const startResize = (e: MouseEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
      e.preventDefault()
      e.stopPropagation()
      // 起始尺寸：以实际渲染尺寸为准（可能被容器 max-width 缩小，与自然尺寸不一致）。
      // 用显示尺寸作起点，拖拽过程才不会一拖就跳回自然尺寸。
      const rect = img.getBoundingClientRect()
      let startW = rect.width || ((node.attrs.width as number | null) ?? img.naturalWidth) || 400
      let startH = rect.height || ((node.attrs.height as number | null) ?? img.naturalHeight) || 300
      const ratio = startW / startH
      const startX = e.clientX
      const startY = e.clientY
      const editor = wrap.closest('.ProseMirror')
      // 拖拽上限：宽取编辑器可视宽度，高取视口高度（防止拉出容器后看不见）
      const maxW = Math.max(200, editor?.clientWidth ?? 1200)
      const maxH = Math.max(200, window.innerHeight - 120)
      const MIN = 24

      // 预览模式：拖拽期间不动真实布局（避免每帧 reflow 造成闪屏/内容跳动）。
      // wrap 固定为初始尺寸占位，img 用 transform scale 做图形缩放（GPU 合成层），
      // 手柄同步跟随缩放后的角；松手后再换算成真实 width/height 写入。
      img.style.transformOrigin = '0 0'
      wrap.style.width = `${startW}px`
      wrap.style.height = `${startH}px`
      const settle = (w: number, h: number) => {
        // 把预览结果原地落成真实尺寸：视觉与布局一致，无跳变
        img.style.removeProperty('transform')
        img.style.removeProperty('transform-origin')
        img.style.width = `${w}px`
        img.style.height = `${h}px`
        wrap.style.width = `${w}px`
        wrap.style.height = `${h}px`
      }

      const apply = (clientX: number, clientY: number, free: boolean) => {
        const dx = clientX - startX
        const dy = clientY - startY
        // 右侧手柄（se/ne）向右拖变大，左侧手柄（nw/sw）向左拖变大
        let w = corner === 'se' || corner === 'ne' ? startW + dx : startW - dx
        w = Math.max(MIN, Math.min(maxW, w))
        let h: number
        if (free) {
          // 自由拉伸：宽高独立；下方手柄（se/sw）向下拖变高，上方手柄（ne/nw）向上拖变高
          h = corner === 'se' || corner === 'sw' ? startH + dy : startH - dy
          h = Math.max(MIN, Math.min(maxH, h))
        } else {
          // 默认锁定宽高比：宽为主、高按比例
          h = Math.round(w / ratio)
        }
        // transform 只做图形缩放不改布局：无 reflow、无闪屏
        img.style.transform = `scale(${w / startW}, ${h / startH})`
        // 手柄跟随图片缩放后的角（transform 以左上角为原点）
        const hw = 5
        handles.nw.style.left = `${0 - hw}px`
        handles.nw.style.top = `${0 - hw}px`
        handles.ne.style.left = `${w - hw}px`
        handles.ne.style.top = `${0 - hw}px`
        handles.sw.style.left = `${0 - hw}px`
        handles.sw.style.top = `${h - hw}px`
        handles.se.style.left = `${w - hw}px`
        handles.se.style.top = `${h - hw}px`
        return { w: Math.round(w), h: Math.round(h) }
      }

      const commit = (w: number, h: number) => {
        if (view.isDestroyed) return
        const pos = getPos()
        // 弹窗停留期间文档可能被改（如图片被删/位移）：位置已不是图片节点时放弃写入
        if (pos == null || view.state.doc.nodeAt(pos)?.type.name !== 'image') return
        // 把最终尺寸写入节点 attrs（持久化到 Markdown）
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: w, height: h }),
        )
        view.focus()
      }

      let rafId = 0
      const onMove = (ev: MouseEvent) => {
        // RAF 节流：mousemove 远高于刷新率，每帧只应用一次避免高频 reflow 卡顿
        if (rafId) return
        const x = ev.clientX
        const y = ev.clientY
        const free = ev.shiftKey
        rafId = requestAnimationFrame(() => {
          rafId = 0
          apply(x, y, free)
        })
      }
      const onUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        if (rafId) {
          cancelAnimationFrame(rafId)
          rafId = 0
        }
        document.body.classList.remove('mditor-resizing')
        document.body.style.removeProperty('cursor')
        if (view.isDestroyed) return
        const result = apply(ev.clientX, ev.clientY, ev.shiftKey)
        // 把预览转换为真实布局尺寸（transform 模式只改图形，落盘前需还原布局）
        settle(result.w, result.h)
        const ratioH = Math.round(result.w / ratio)
        // 当前显示尺寸与锁定比例一致（没自由拉伸，或最后又切回了比例）：直接落盘
        if (Math.abs(result.h - ratioH) <= 1) {
          commit(result.w, result.h)
          return
        }
        // 自由拉伸过：弹窗让用户选择保持比例还是用自由尺寸（所见即所得）
        showResizeChoice(ev.clientX, ev.clientY, {
          ratio: { w: result.w, h: ratioH },
          free: result,
          commit,
        })
      }

      document.body.classList.add('mditor-resizing')
      document.body.style.cursor =
        corner === 'ne' || corner === 'sw' ? 'nesw-resize' : 'nwse-resize'
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    /**
     * 自由拉伸（Shift）松手后的小弹窗：选择「保持比例」还是「自由尺寸」。
     * Esc / 点击弹窗外 → 默认按自由尺寸应用（所见即所得）。
     */
    const showResizeChoice = (
      x: number,
      y: number,
      opts: {
        ratio: { w: number; h: number }
        free: { w: number; h: number }
        commit: (w: number, h: number) => void
      },
    ) => {
      const pop = document.createElement('div')
      pop.className = 'mditor-resize-choice'

      const title = document.createElement('div')
      title.className = 'mditor-resize-choice-title'
      title.textContent = '缩放完成，如何应用？'
      pop.appendChild(title)

      const close = (final?: { w: number; h: number }) => {
        window.removeEventListener('keydown', onKey, true)
        window.removeEventListener('mousedown', onDown, true)
        pop.remove()
        if (final) opts.commit(final.w, final.h)
      }
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          ev.preventDefault()
          ev.stopPropagation()
          close(opts.free)
        }
      }
      const onDown = (ev: MouseEvent) => {
        if (pop.contains(ev.target as Element)) return
        close(opts.free)
      }

      const btnRatio = document.createElement('button')
      btnRatio.type = 'button'
      btnRatio.className = 'mditor-resize-choice-btn primary'
      btnRatio.textContent = `保持比例 ${opts.ratio.w} × ${opts.ratio.h}`
      btnRatio.addEventListener('click', (ev) => {
        ev.stopPropagation()
        close(opts.ratio)
      })

      const btnFree = document.createElement('button')
      btnFree.type = 'button'
      btnFree.className = 'mditor-resize-choice-btn'
      btnFree.textContent = `自由尺寸 ${opts.free.w} × ${opts.free.h}`
      btnFree.addEventListener('click', (ev) => {
        ev.stopPropagation()
        close(opts.free)
      })

      pop.appendChild(btnRatio)
      pop.appendChild(btnFree)
      document.body.appendChild(pop)

      // 定位：优先放在光标右下方，贴近视口边缘时翻转
      pop.style.visibility = 'hidden'
      const rect = pop.getBoundingClientRect()
      let px = x + 12
      let py = y + 12
      if (px + rect.width > window.innerWidth - 8) px = x - rect.width - 12
      if (py + rect.height > window.innerHeight - 8) py = y - rect.height - 12
      pop.style.left = `${Math.max(8, px)}px`
      pop.style.top = `${Math.max(8, py)}px`
      pop.style.visibility = 'visible'

      window.addEventListener('keydown', onKey, true)
      // 触发本次弹窗的事件是 mouseup，不会误触发 mousedown 关闭，可直接注册
      window.addEventListener('mousedown', onDown, true)
    }

    /**
     * 单击 SVG 图片 → 在文档内直接打开源码编辑条（不弹窗）。
     * - 本地 .svg 文件：直接读文件内容，保存时写回磁盘；
     * - data:image/svg+xml 内联图：解析出源码，保存时更新文档里的节点 src；
     * - URL（http/https/asset）SVG：无法写回，提示不支持。
     */
    const openSvgEditorFromNode = (
      view: EditorView,
      node: Node,
      getPos: () => number | undefined,
    ) => {
      const showToast = useAppStore.getState().showToast
      const s = String(node.attrs.src ?? '').trim()
      const pos = getPos()
      if (pos == null || view.isDestroyed || view.state.doc.nodeAt(pos)?.type.name !== 'image') {
        showToast('图片位置已变动')
        return
      }

      // 内联 data URL：SVG 源码就嵌在文档里 → 编辑后回写节点 src
      if (/^data:image\/svg\+xml/i.test(s)) {
        const comma = s.indexOf(',')
        if (comma < 0) {
          showToast('无法解析该内联 SVG')
          return
        }
        const head = s.slice(0, comma)
        const body = s.slice(comma + 1)
        const isB64 = /;base64$/i.test(head)
        let text: string
        try {
          text = isB64 ? new TextDecoder().decode(base64ToBytes(body)) : decodeURIComponent(body)
        } catch {
          showToast('无法解析该内联 SVG')
          return
        }
        openSvgSourceEditor(view, {
          pos: afterBlockPos(view, pos),
          source: text,
          onApply: (newSource) => {
            const curPos = getPos()
            if (view.isDestroyed || curPos == null || view.state.doc.nodeAt(curPos)?.type.name !== 'image') {
              showToast('图片位置已变动，保存失败')
              return false
            }
            const base = s.slice(0, comma + 1)
            const nextSrc = isB64
              ? `${base}${bytesToBase64(new TextEncoder().encode(newSource))}`
              : `${base}${encodeURIComponent(newSource)}`
            view.dispatch(
              view.state.tr.setNodeMarkup(curPos, undefined, { ...node.attrs, src: nextSrc }),
            )
            showToast('SVG 已更新')
            return true
          },
        })
        return
      }

      // 本地文件：解析绝对路径 → 读源码 → 保存写回磁盘
      const abs = toLocalAbsPath(s)
      if (!abs) {
        showToast('仅支持编辑本地 SVG 文件（URL 图片无法写回）')
        return
      }
      readFile(abs)
        .then((source) =>
          openSvgSourceEditor(view, {
            pos: afterBlockPos(view, pos),
            source,
            onApply: async (newSource) => {
              try {
                await writeFile(abs, newSource)
                notifySvgRerender()
                showToast('SVG 已保存')
                return true
              } catch (e) {
                showToast(`保存失败：${String(e)}`)
                return false
              }
            },
          }),
        )
        .catch((e) => showToast(`无法读取 SVG 文件：${String(e)}`))
    }

    for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
      const handle = document.createElement('div')
      handle.className = `mditor-resize-handle ${corner}`
      handle.addEventListener('mousedown', (e) => startResize(e, corner))
      handles[corner] = handle
      wrap.appendChild(handle)
    }

    return {
      dom: wrap,
      update: (newNode) => {
        if (newNode.type.name !== 'image') return false
        node = newNode
        render()
        return true
      },
      selectNode: () => wrap.classList.add('mditor-image-selected'),
      deselectNode: () => wrap.classList.remove('mditor-image-selected'),
      // 自己同步的 DOM 属性（src/alt/title/class/style）：无论谁写入都忽略，
      // 不要触发 PM 重新渲染——这是切断 MutationObserver ↔ view.update 无限循环的
      // 关键：setNodeMarkup / render 会写属性，忽略后 PM 不会再从 DOM 回读差异。
      ignoreMutation: (mutation) =>
        mutation.type === 'attributes' &&
        (mutation.attributeName === 'src' ||
          mutation.attributeName === 'alt' ||
          mutation.attributeName === 'title' ||
          mutation.attributeName === 'class' ||
          mutation.attributeName === 'style'),
      // 缩放手柄事件由节点视图自己处理，不交给 ProseMirror（选中/拖拽逻辑）
      stopEvent: (event) =>
        event.target instanceof HTMLElement &&
        event.target.closest('.mditor-resize-handle') !== null,
      destroy: () => {
        img.removeEventListener('click', onImgClick)
        unregisterSvgRender()
      },
    }
  }

  return new Plugin({
    props: {
      nodeViews: {
        image: createImageView,
      },
    },
  })
})

/**
 * 光标点击修复：自定义图片节点视图（contenteditable=false 内联原子 + 手柄）在部分
 * Chromium 版本下会让浏览器原生光标放置/拖选失效——点击或拖拽时光标先落到正确位置，
 * 随后被浏览器内部机制拉回文档末尾/PM 原选区（无 dispatch、无 preventDefault，属浏览器竞态）。
 *
 * 解决：
 * - 单击（detail=1 且本次未拖动）：mouseup 时主动把折叠光标钉在点击位置（幂等），
 *   即使点击前已有选中/旧选区也能正确落光标；
 * - 拖拽中（mousedown→mousemove→mouseup）：原生拖选被破坏时，改为由 PM 手动按
 *   「锚点 → 当前坐标」重建选区，保证跨行拖选正常；
 * - 双击选词/三击选段（detail>1）不干预，图片点击（wrapper/手柄）不干预，
 *   表格/数学/代码块等非内联内容不干预；
 * 不 preventDefault、不拦截事件，Shift/修饰键扩展、右键菜单等原生行为不受影响。
 */
export const caretClickFixPlugin = $prose(() => {
  /** 记录左键拖拽的起始锚点（按编辑器隔离，闭包内状态） */
  let dragAnchor: { view: EditorView; pos: number } | null = null
  /** 本次手势是否发生过拖拽（有 mousemove 重建过选区） */
  let dragMoved = false

  /** 是否为可被本次修复接管的事件：普通左键、无修饰键、不落在图片/手柄上 */
  const isPlainTextClick = (view: EditorView, e: MouseEvent): boolean => {
    if (e.button !== 0 || view.isDestroyed) return false
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false
    const t = e.target as HTMLElement | null
    if (t && (t.closest('.mditor-image-wrap') || t.closest('.mditor-resize-handle'))) return false
    return true
  }

  /** 点击位置解析后是否落在内联内容里（段落/标题/列表项；跳过代码块/表格/数学块等） */
  const posInInline = (view: EditorView, pos: number): boolean => {
    if (view.isDestroyed) return false
    const $pos = view.state.doc.resolve(pos)
    return $pos.parent.inlineContent
  }

  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown: (view, event) => {
          const e = event as MouseEvent
          if (!isPlainTextClick(view, e) || e.detail > 1) return false
          const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })
          if (!pos || !posInInline(view, pos.pos)) return false
          dragAnchor = { view, pos: pos.pos }
          dragMoved = false
          return false
        },
        mousemove: (view, event) => {
          const e = event as MouseEvent
          if (!dragAnchor || dragAnchor.view !== view || view.isDestroyed) return false
          if (!(e.buttons & 1)) {
            dragAnchor = null
            return false
          }
          const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })
          if (!pos || !posInInline(view, pos.pos)) return false
          // 手动重建拖选范围：锚点 → 当前光标（原生拖选在此环境下被浏览器竞态破坏）
          const { doc } = view.state
          const next = TextSelection.create(doc, dragAnchor.pos, pos.pos)
          // 位置未变化时跳过，避免拖拽中反复触发无意义事务
          if (view.state.selection.eq(next)) return false
          dragMoved = true
          view.dispatch(view.state.tr.setSelection(next))
          return false
        },
        mouseup: (view, event) => {
          const e = event as MouseEvent
          const handledDrag = dragAnchor !== null && dragAnchor.view === view && dragMoved
          dragAnchor = null
          dragMoved = false
          if (!isPlainTextClick(view, e)) return false
          // 本次手势拖过（拖选范围已由 mousemove 重建）或双击/三击（选词/选段）→ 不干预
          if (handledDrag || e.detail > 1) return false
          const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })
          if (!pos || !posInInline(view, pos.pos)) return false
          // 把折叠光标钉在点击位置（幂等：已在该位置时无副作用）
          const $pos = view.state.doc.resolve(pos.pos)
          view.dispatch(view.state.tr.setSelection(TextSelection.near($pos, 1)))
          return false
        },
      },
    },
  })
})

/// 图片插件组：schema 覆盖 + 节点视图 + 光标点击修复
export const imagePlugin: MilkdownPlugin[] = [imageResizeSchema, imageNodeViewPlugin, caretClickFixPlugin].flat()
