import { Plugin } from '@milkdown/kit/prose/state'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { isSvgSrc, toLocalAbsPath, notifySvgRerender } from '../services/imageDisplay'
import { readFile, writeFile, base64ToBytes, bytesToBase64 } from '../services/fs'
import { useAppStore } from '../stores/useAppStore'
import { Fragment } from '@milkdown/kit/prose/model'
import type { Node } from '@milkdown/kit/prose/model'
import { afterBlockPos, openSvgSourceEditor } from './svgSourceEditor'
import { fixHtmlImages } from './html'

/// 在 HTML 源码字符串中定位第 n 个（0 基）「顶层」<svg>…</svg> 的 [start, end) 区间。
/// 顶层 = 其祖先链直到块根都没有其它 <svg>（与 DOM 里「不含 svg 祖先」的口径一致）。
/// 跳过注释、<script>/<style> 内容、<?…> / <!…>，避免误匹配文本里的 <svg 字样。
/// 返回值下标基于 markdown/HTML 中保存的原始字符串，这正是 htmlBlock 节点 value 所用。
export function findNthSvgSpan(value: string, n: number): { start: number; end: number; autoClosed?: boolean } | null {
  const len = value.length
  let i = 0
  let depth = 0
  let topSeen = 0
  let start = -1
  // 扫描期间是否"吞掉剩余内容直到字符串结尾"（未闭合的注释/CDATA/script/style 等）。
  // 这种破坏性结构下浏览器不会渲染该 svg，不能把它当成可定位的未闭合 svg。
  let eofSwallowed = false

  const skipRaw = (endTag: string): number => {
    const at = value.toLowerCase().indexOf(endTag, i)
    if (at < 0) {
      eofSwallowed = true
      return len
    }
    return at + endTag.length
  }

  while (i < len) {
    const lt = value.indexOf('<', i)
    if (lt < 0) break
    if (value.startsWith('<!--', lt)) {
      const close = value.indexOf('-->', lt + 4)
      if (close < 0) eofSwallowed = true
      i = close < 0 ? len : close + 3
      continue
    }
    // <![CDATA[ … ]]>：内容里的 <svg/</svg> 是字符数据，不是结构；如脚本/样式里的
    // 示例代码含 "</svg>" 时，漏掉会误关 svg 或误认嵌套。
    if (value.startsWith('<![CDATA[', lt)) {
      const close = value.indexOf(']]>', lt + 9)
      if (close < 0) eofSwallowed = true
      i = close < 0 ? len : close + 3
      continue
    }
    if (value.startsWith('<!', lt) || value.startsWith('<?', lt)) {
      let j = lt
      while (j < len && value[j] !== '>') j++
      if (j >= len) eofSwallowed = true
      i = j + 1
      continue
    }
    // 标签名（href="#a<b" 之类带 < 的文本不会走到这里，因为 < 在引号内）
    let j = lt + 1
    // 闭合标签：吞掉开头的 '/'，让它保留在 tagName 里（/text、/svg），
    // 但自闭合 <svg/> 之类的 '/' 仍会终止标签名读取（保持自身标签名 'svg'）。
    if (value[j] === '/') j++
    while (j < len && !/[\s/>]/.test(value[j])) j++
    const tagName = value.slice(lt + 1, j).toLowerCase()

    // 找到本标签的结束 >（尊重引号，避免属性值里的 > 提前结束）
    let k = j
    let quote = ''
    while (k < len) {
      const c = value[k]
      if (quote) {
        if (c === quote) quote = ''
      } else if (c === '"' || c === "'") {
        quote = c
      } else if (c === '>') {
        break
      }
      k++
    }
    if (k >= len) break
    const tag = value.slice(lt + 1, k)
    const nxt = k + 1
    const selfClose = /\/\s*$/.test(tag)

    // <script>/<style>：HTML 原始文本，内容里可能出现字面 <svg/</svg>，整段跳过
    // 直到各自的闭合标签（自闭合的 script/style 无内容，正常按标签处理）。
    // 同理 <desc>/<text>/<title>/<tspan>/<metadata> 的元素文本里也可能出现字面的
    // "</svg>"、<svg 等字符串（示例代码/说明文字），也必须整段跳过，
    // 否则可能把 </svg> 误当成闭合标签、把 <svg 误当作嵌套 svg，导致定位区间错位。
    const rawText = ['script', 'style', 'desc', 'text', 'title', 'tspan', 'metadata']
    if (rawText.includes(tagName) && !selfClose) {
      // 只有找到真正的闭合标签才整段跳过。若写成“无闭合标签”的 rawText 元素
      // （desc/metadata 等，浏览器会自动闭合、仍能渲染），跳过会把后面的 </svg>
      // 一起吞掉、认定找不到 svg；此时退回普通扫描，让 </svg> 按浏览器口径闭合，
      // 使定位区间与 DOM 渲染结果一致。script/style 例外：无闭合时整段吞掉到末尾
      // 与 HTML 解析器一致（之后的 <svg> 其实是脚本/样式文本，DOM 也不会渲染它）。
      const closeAt = value.toLowerCase().indexOf(`</${tagName}>`, i)
      if (closeAt >= 0 || tagName === 'script' || tagName === 'style') {
        i = skipRaw(`</${tagName}>`)
        continue
      }
    }

    if (tagName === 'svg') {
      if (depth === 0) {
        if (topSeen === n) start = lt
        else topSeen++
      }
      depth++
      if (selfClose) {
        depth--
        if (depth === 0 && start >= 0) return { start, end: nxt }
      }
    } else if (tagName === '/svg') {
      // 游离的 </svg>（不在任何 svg 内的文本/残留）浏览器会忽略，不能把 depth 减
      // 成负数，否则其后真实的 <svg> 会因 depth≠0 而永远不被计为顶层、导致找不到。
      if (depth > 0) depth--
      if (depth === 0 && start >= 0) return { start, end: nxt }
    }
    i = nxt
  }
  // 顶层 <svg> 已开启但到字符串末尾仍未闭合（常见：文件保存时被截断丢了 </svg>，
  // 浏览器会按 HTML 规则自动闭合、仍能正常渲染）：视为 span = [start, len)。
  // 编辑后回写该区间即可把缺失的 </svg> 一并补回文件。
  // 但若期间因未闭合的注释/CDATA/script/style 吞掉了剩余内容，DOM 实际不渲染该
  // svg，保持返回 null（避免把坏文档当成可编辑的 svg）。
  // 但若期间因未闭合的注释/CDATA/script/style 吞掉了剩余内容，DOM 实际不渲染该
  // svg，保持返回 null（避免把坏文档当成可编辑的 svg）。
  // 标记 autoClosed：该区间"到值末尾仍未闭合"，仅可在打开时作为编辑区间用；
  // 通用替换 replaceNthSvg 必须忽略它（值里的未闭合 也可能是 remark 拆分片段）。
  if (!eofSwallowed && start >= 0 && depth > 0) return { start, end: len, autoClosed: true }
  return null
}

/** 把 html 节点 value 里第 n 个顶层 svg 替换为 newSource */
function replaceNthSvg(value: string, n: number, newSource: string): string | null {
  const span = findNthSvgSpan(value, n)
  if (!span || span.autoClosed) return null
  return value.slice(0, span.start) + newSource + value.slice(span.end)
}

/** 在 SVG 源码的根 <svg> 开标签上设置/替换 width/height 属性（不重新解析，保留原始格式） */
function setSvgRootSize(source: string, w: number, h: number): string {
  const open = /<svg\b/i.exec(source)
  if (!open) return source
  const s = open.index
  let i = s + 4
  let quote = ''
  let tagEnd = -1
  while (i < source.length) {
    const c = source[i]
    if (quote) { if (c === quote) quote = '' }
    else if (c === '"' || c === "'") quote = c
    else if (c === '>') { tagEnd = i; break }
    i++
  }
  if (tagEnd < 0) return source
  let tag = source.slice(s, tagEnd)
  tag = upsertSvgAttr(tag, 'width', String(w))
  tag = upsertSvgAttr(tag, 'height', String(h))
  return source.slice(0, s) + tag + '>' + source.slice(tagEnd + 1)
}

/** 在 <svg 开标签内替换或添加属性（前面需有空白，避免误匹配 strokeWidth 等） */
function upsertSvgAttr(tag: string, attr: string, value: string): string {
  const re = new RegExp(`(\\s)${attr}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'i')
  if (re.test(tag)) return tag.replace(re, `$1${attr}="${value}"`)
  return tag.replace(/^(<svg\b)/i, `$1 ${attr}="${value}"`)
}

/// 定位 wrap 元素对应的 htmlBlock / html 节点。返回权威的 nodePos —— 之后对
/// 节点的所有读取/回写都以该位置为准（见 getNodeValueAt / spliceInlineRange），
/// 不再依赖点击时刻捕获、可能在后续渲染中被替换的 DOM wrap 引用。
const findHtmlNode = (
  view: EditorView,
  wrap: HTMLElement,
): { node: Node; nodePos: number } | null => {
  if (view.isDestroyed) return null
  const pos = view.posAtDOM(wrap, 0)
  if (pos == null) return null
  const doc = view.state.doc
  const direct = doc.nodeAt(pos)
  if (direct && (direct.type.name === 'htmlBlock' || direct.type.name === 'html')) {
    return { node: direct, nodePos: pos }
  }
  const $pos = doc.resolve(pos)
  for (let d = $pos.depth; d >= 0; d--) {
    const nn = $pos.node(d)
    if (nn.type.name === 'htmlBlock' || nn.type.name === 'html') {
      return { node: nn, nodePos: $pos.before(d) }
    }
  }
  return null
}

/** 读取指定 nodePos 处 html 节点的原始 value 字符串；位置已不再指向 html 节点则返回 null */
const getNodeValueAt = (view: EditorView, nodePos: number): string | null => {
  if (view.isDestroyed) return null
  const n = view.state.doc.nodeAt(nodePos)
  if (!n || (n.type.name !== 'htmlBlock' && n.type.name !== 'html')) return null
  return String(n.attrs.value ?? '')
}

/** 收集 dom 内的顶层 svg（祖先链直到 dom 根不含其它 svg）——与 openFromSvg 序号口径一致 */
const collectTopLevelSvgs = (dom: HTMLElement): SVGElement[] => {
  const result: SVGElement[] = []
  dom.querySelectorAll('svg').forEach((el) => {
    let p: Element | null = el.parentElement
    while (p && p !== dom) {
      if (p instanceof SVGElement) return
      p = p.parentElement
    }
    result.push(el as SVGElement)
  })
  return result
}

/** 给 html 节点 DOM 内每个顶层 svg 包裹缩放手柄 wrap（hover 显示四角手柄，拖拽等比缩放） */
const attachSvgResizeHandles = (dom: HTMLElement, view: EditorView, getPos: () => number | undefined) => {
  const topLevel = collectTopLevelSvgs(dom)
  topLevel.forEach((svg) => {
    if (svg.parentElement?.classList.contains('mditor-svg-wrap')) return
    const wrap = document.createElement('span')
    wrap.className = 'mditor-svg-wrap'
    svg.parentNode!.insertBefore(wrap, svg)
    wrap.appendChild(svg)
    for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
      const handle = document.createElement('span')
      handle.className = `mditor-resize-handle ${corner}`
      handle.addEventListener('mousedown', (e) => startSvgResize(e, corner, svg, wrap, dom, view, getPos))
      wrap.appendChild(handle)
    }
  })
}

/** 拖拽 svg 四角手柄 → 等比缩放（Shift 自由拉伸）→ 松手提交 width/height 到节点 value */
const startSvgResize = (
  e: MouseEvent,
  corner: 'nw' | 'ne' | 'sw' | 'se',
  svg: SVGElement,
  wrapEl: HTMLElement,
  dom: HTMLElement,
  view: EditorView,
  getPos: () => number | undefined,
) => {
  e.preventDefault()
  e.stopPropagation()
  // 起始尺寸优先取实际渲染尺寸（getBoundingClientRect），含 enhanceSvgDisplay 设的 CSS 放大量
  const rect = svg.getBoundingClientRect()
  let startW = rect.width || parseFloat(svg.getAttribute('width') || '') || 300
  let startH = rect.height || parseFloat(svg.getAttribute('height') || '') || 200
  if (!startW || !startH) { startW = 300; startH = 200 }
  const ratio = startW / startH
  const startX = e.clientX
  const startY = e.clientY
  const editor = wrapEl.closest('.ProseMirror')
  const maxW = Math.max(200, (editor?.clientWidth ?? 1200) - 40)
  const maxH = Math.max(200, window.innerHeight - 120)
  const MIN = 24

  const apply = (clientX: number, clientY: number, free: boolean) => {
    const dx = clientX - startX
    const dy = clientY - startY
    let w = corner === 'se' || corner === 'ne' ? startW + dx : startW - dx
    w = Math.max(MIN, Math.min(maxW, w))
    let h: number
    if (free) {
      h = corner === 'se' || corner === 'sw' ? startH + dy : startH - dy
      h = Math.max(MIN, Math.min(maxH, h))
    } else {
      h = Math.round(w / ratio)
    }
    svg.style.width = `${Math.round(w)}px`
    svg.style.height = `${Math.round(h)}px`
    return { w: Math.round(w), h: Math.round(h) }
  }

  // mousemove 每帧最多应用一次：直接在 onMove 里写 style 会每条事件同步 reflow，
  // 大 SVG 拖拽卡顿（与 image.ts 缩放同款 RAF 节流）。
  let raf = 0
  let pending: { x: number; y: number; shift: boolean } | null = null
  const applyPending = () => {
    raf = 0
    if (!pending) return
    const { x, y, shift } = pending
    pending = null
    apply(x, y, shift)
  }
  const onMove = (ev: MouseEvent) => {
    pending = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey }
    if (!raf) raf = requestAnimationFrame(applyPending)
  }
  const onUp = (ev: MouseEvent) => {
    if (raf) { cancelAnimationFrame(raf); raf = 0 }
    pending = null
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    document.body.classList.remove('mditor-resizing')
    document.body.style.removeProperty('cursor')
    if (view.isDestroyed || !svg.isConnected) return
    const result = apply(ev.clientX, ev.clientY, ev.shiftKey)
    commitSvgResize(view, getPos, dom, svg, result.w, result.h)
  }

  document.body.classList.add('mditor-resizing')
  document.body.style.cursor = corner === 'ne' || corner === 'sw' ? 'nesw-resize' : 'nwse-resize'
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

/** 提交 svg 缩放：在节点 value 里定位第 n 个顶层 svg，用 setSvgRootSize 改 width/height 属性 */
const commitSvgResize = (
  view: EditorView,
  getPos: () => number | undefined,
  dom: HTMLElement,
  svg: SVGElement,
  w: number,
  h: number,
) => {
  if (view.isDestroyed) return
  const pos = getPos()
  if (pos == null) return
  const cur = view.state.doc.nodeAt(pos)
  if (!cur || (cur.type.name !== 'htmlBlock' && cur.type.name !== 'html')) return
  const value = String(cur.attrs.value ?? '')
  const topLevel = collectTopLevelSvgs(dom)
  const ordinal = topLevel.indexOf(svg)
  if (ordinal < 0) return
  const span = findNthSvgSpan(value, ordinal)
  if (!span) return
  const origSource = value.slice(span.start, span.end)
  const newSource = setSvgRootSize(origSource, w, h)
  if (!newSource.includes('<svg')) return
  const newValue = value.slice(0, span.start) + newSource + value.slice(span.end)
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { value: newValue }))
}

/** 纯数字属性值才处理（避免 parseFloat('100%') 误当像素，破坏百分比尺寸 SVG） */
const isNumericAttr = (v: string | null): boolean => /^\d+(\.\d+)?$/.test((v || '').trim())

/** 增强顶层 svg 显示：补 viewBox（使 CSS 宽高能缩放内容）+ 太小的放大到合理尺寸 */
const enhanceSvgDisplay = (dom: HTMLElement) => {
  collectTopLevelSvgs(dom).forEach((svg) => {
    const wRaw = svg.getAttribute('width')
    const hRaw = svg.getAttribute('height')
    // 只有 width/height 都是纯数字（不带 %/px/auto 等单位）才处理，避免破坏内部坐标
    const attrW = isNumericAttr(wRaw) ? parseFloat(wRaw || '') : 0
    const attrH = isNumericAttr(hRaw) ? parseFloat(hRaw || '') : 0
    if (attrW <= 0 || attrH <= 0) return
    // 缺 viewBox 时补上（依据 width/height 属性），否则 CSS width/height 只改画布不改内容
    if (!svg.getAttribute('viewBox')) {
      svg.setAttribute('viewBox', `0 0 ${attrW} ${attrH}`)
    }
    // 太小的 SVG（如 200×200）放大到至少 400px 宽，仅改 CSS 不改源码
    const MIN_DISPLAY = 400
    if (attrW < MIN_DISPLAY) {
      const scale = MIN_DISPLAY / attrW
      svg.style.width = `${Math.round(attrW * scale)}px`
      svg.style.height = `${Math.round(attrH * scale)}px`
    }
  })
}

/** htmlBlock / html 节点视图：渲染 HTML 源码 + 给顶层 svg 加缩放手柄 */
function createHtmlNodeView(
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
  typeName: 'htmlBlock' | 'html',
): NodeView {
  const isBlock = typeName === 'htmlBlock'
  const dom = document.createElement(isBlock ? 'div' : 'span')
  dom.className = isBlock ? 'mditor-html-block' : 'mditor-html-inline'
  dom.dataset.type = typeName

  const render = () => {
    const value = String(node.attrs.value ?? '')
    dom.dataset.value = value
    dom.innerHTML = value
    fixHtmlImages(dom)
    enhanceSvgDisplay(dom)
    attachSvgResizeHandles(dom, view, getPos)
  }
  render()

  return {
    dom,
    update: (newNode) => {
      if (newNode.type.name !== typeName) return false
      if (newNode.attrs.value === node.attrs.value) return true
      node = newNode
      render()
      return true
    },
    ignoreMutation: () => true,
    stopEvent: (event) => {
      const t = event.target
      return t instanceof HTMLElement && t.closest('.mditor-resize-handle') !== null
    },
  }
}

/// 编辑 HTML 块/行内里直接渲染的 <svg> 或 <img src="*.svg">：
/// - <svg>：把元素源码交给内联源码编辑条，保存时回写进 htmlBlock/html 节点的 value；
/// - <img>：本地文件写回磁盘；data URL 回写 value 中的 src；URL 不支持写回（提示）。
export const htmlSvgEditPlugin = $prose(() => {
  /** 在 html 节点（块/行内）value 内回写新的 src 文本 */
  const replaceValueSrc = (value: string, oldSrc: string, nextSrc: string): string | null => {
    if (!oldSrc) return null
    const idx = value.indexOf(oldSrc)
    if (idx < 0) return null
    return value.slice(0, idx) + nextSrc + value.slice(idx + oldSrc.length)
  }

  /**
   * 提交前安全检查：回写结果不能丢失原有的 svg 结构。
   * 原 value/源码里有 <svg/</svg> 而回写结果没了 → 说明定位/替换出了问题，
   * 静默地把内容写飞会把用户文档删坏，这里必须拒绝并给出明确提示。
   */
  const guardSvgPreserved = (
    original: string,
    next: string,
    showToast: (msg: string) => void,
  ): boolean => {
    const hadOpen = original.includes('<svg')
    const hadClose = original.includes('</svg')
    const lost = (hadOpen && !next.includes('<svg')) || (hadClose && !next.includes('</svg'))
    if (lost) {
      console.warn('[svgSourceEdit] 回写结果异常，拒绝提交（原内容含 svg 而回写结果不含）：', {
        original,
        next,
      })
      showToast('保存失败：回写结果异常（SVG 丢失），文档未改动')
      return false
    }
    return true
  }

  /** 打开内联 SVG 源码编辑条（img 场景：data URL 回写 value，本地文件写盘，URL 提示） */
  const openFromImg = (
    view: EditorView,
    wrap: HTMLElement,
    _img: HTMLImageElement,
    mdSrc: string,
  ) => {
    const showToast = useAppStore.getState().showToast
    const s = String(mdSrc ?? '').trim()

    const anchor = findHtmlNode(view, wrap)
    if (!anchor) {
      showToast('无法定位该 SVG 图片')
      return
    }
    const nodePos = anchor.nodePos
    const openAt = afterBlockPos(view, nodePos)

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
        pos: openAt,
        source: text,
        onApply: (newSource) => {
          const value = getNodeValueAt(view, nodePos)
          if (value == null) {
            showToast('保存失败：位置已变动')
            return false
          }
          if (!guardSvgPreserved(value, value, showToast)) return false
          const base = s.slice(0, comma + 1)
          const nextSrc = isB64
            ? `${base}${bytesToBase64(new TextEncoder().encode(newSource))}`
            : `${base}${encodeURIComponent(newSource)}`
          const next = replaceValueSrc(value, s, nextSrc)
          if (next == null) {
            showToast('保存失败：未能定位图片 src')
            return false
          }
          // 回写结果的校验必须在 next 计算之后：原实现把 (value, value) 传入恒为 true，
          // 防止「SVG 源码在回写中丢失」的保险在该路径上是死代码。
          if (!guardSvgPreserved(value, next, showToast)) return false
          const ok = commitNodeValue(view, nodePos, next, showToast)
          if (ok) showToast('SVG 已更新')
          return ok
        },
      })
      return
    }

    const abs = toLocalAbsPath(s)
    if (!abs) {
      showToast('仅支持编辑本地 SVG 文件（URL 图片无法写回）')
      return
    }
    readFile(abs)
      .then((source) =>
        openSvgSourceEditor(view, {
          pos: openAt,
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

  /** 把回写结果提交到 PM 文档（htmlBlock / html 节点 setNodeMarkup 触发原子重渲染），
   *  成功返回 true（触发 markdownUpdated → 自动保存），失败返回 false。 */
  const commitNodeValue = (
    view: EditorView,
    nodePos: number,
    nextValue: string | null,
    showToast: (msg: string) => void,
  ): boolean => {
    if (nextValue == null) {
      showToast('保存失败：未能定位 SVG 在源码中的位置')
      return false
    }
    if (view.isDestroyed) return false
    // 提交前确认 nodePos 处仍是 html 节点（期间被外部改动 → 放弃，绝不写错位置）
    const cur = view.state.doc.nodeAt(nodePos)
    if (!cur || (cur.type.name !== 'htmlBlock' && cur.type.name !== 'html')) {
      showToast('保存失败：图片位置已变动')
      return false
    }
    view.dispatch(
      view.state.tr.setNodeMarkup(nodePos, undefined, { value: nextValue }),
    )
    return true
  }

/** 收集被 remark 拆成多个相邻节点的内联 SVG：从 nodePos 起一直
     收集到累计源码含 </svg> 为止，返回区间与拼接源码（供源码编辑条展示与保存）。
     允许 html/text/break 相邻内联节点（remark 可能把 svg 围栏、换行拆成不同节点），
     遇到块级节点或其它内联类型（image 等）则放弃。 */
  const collectInlineRange = (
    view: EditorView,
    nodePos: number,
  ): { nodePos: number; endPos: number; source: string } | null => {
    const allowed = ['html', 'text', 'break']
    const doc = view.state.doc
    let p = nodePos
    let acc = ''
    let endPos = -1
    let guard = 0
    while (p < doc.content.size && guard < 60) {
      guard++
      const n = doc.nodeAt(p)
      if (!n || n.isBlock || !allowed.includes(n.type.name)) break
      acc += String(n.attrs.value ?? (n.type.name === 'text' ? n.text : ''))
      p += n.nodeSize
      if (acc.includes('</svg')) {
        endPos = p
        break
      }
    }
    if (endPos < 0) return null
    return { nodePos, endPos, source: acc }
  }

  /** 回写被拆分的内联 SVG：把收集到的连续节点整段替换为单个 html 节点。 */
  const spliceInlineRange = (
    view: EditorView,
    nodePos: number,
    newSource: string,
  ): boolean => {
    const range = collectInlineRange(view, nodePos)
    if (!range) return false
    const typeNode = view.state.doc.nodeAt(range.nodePos)
    if (!typeNode) return false
    let tr = view.state.tr
    tr.delete(range.nodePos, range.endPos)
    const gapPos = tr.mapping.map(range.nodePos)
    tr.insert(gapPos, Fragment.from(typeNode.type.create({ value: newSource })))
    view.dispatch(tr)
    return true
  }

  /** <svg> 场景：按块内「顶层 svg」序号回写（内联源码编辑条，不弹窗） */
  const openFromSvg = (view: EditorView, wrap: HTMLElement, svg: SVGElement) => {
    const showToast = useAppStore.getState().showToast
    // 被点击的可能是嵌套 svg：锁定到父链上没有 svg 的最外层 svg
    let editEl: SVGElement = svg
    while (editEl.parentElement && editEl.parentElement instanceof SVGElement) {
      editEl = editEl.parentElement
    }
    const topLevel: SVGElement[] = []
    wrap.querySelectorAll('svg').forEach((el) => {
      let p: Element | null = el.parentElement
      while (p && p !== wrap) {
        if (p instanceof SVGElement) return
        p = p.parentElement
      }
      topLevel.push(el as SVGElement)
    })
    const ordinal = topLevel.indexOf(editEl)
    if (ordinal < 0) {
      showToast('无法定位该 SVG')
      return
    }
    const anchor = findHtmlNode(view, wrap)
    if (!anchor) {
      showToast('无法定位该 SVG')
      return
    }
    const nodePos = anchor.nodePos
    // 编辑条展示的源码必须取自已保存文档（html 节点 value），绝不能等于浏览器渲染出的
    // outerHTML：HTML 解析器会按 HTML 规则重解析 value（例如 <desc>/<text>/<title> 里
    // 出现字面的 "</svg>" 会被当作真正的闭合标签），导致 outerHTML 丢尾、变残缺；若以
    // 残缺 outerHTML 作为「保存」的内容回写，就会把文件里的 svg 源头数据写坏。
    // 所以：优先用 value 里按序号切出的原始区间；span 在打开时就锁定，应用时直接按
    // 原下标回写（弹窗打开期间任何文档改动都会自动收起弹窗，value 不会变，无需再次
    // 定位，避免“打开能定位、应用却定位不到”）。
    const rawValue = getNodeValueAt(view, nodePos)
    let span: { start: number; end: number; autoClosed?: boolean } | null = null
    let source = ''
    if (rawValue != null) {
      span = findNthSvgSpan(rawValue, ordinal)
      const spansToEnd = !!span && span.end >= rawValue.length
      if (!span || spansToEnd) {
        // value 里没有"在值内完整闭合"的 svg。两种可能：
        //   a) remark 把内联 svg 拆成了开标签/子元素/</svg> 多个相邻节点 —— 先试着把
        //      它们拼起来，若拼出的源码含 </svg>，这条路能还原完整元素（走整段替换）；
        //   b) 文件本来就缺 </svg>（浏览器自动补全后仍能渲染）—— 拼不出来，就按
        //      "未闭合到值结尾"处理（span 为 [start, len)），编辑后回写可把 </svg> 补回。
        const range = collectInlineRange(view, nodePos)
        if (range && range.source.includes('</svg')) {
          span = null
          source = range.source
          console.log('[svgSourceEdit] open inline 多节点拼接 svg', { nodePos, ordinal, sourceLen: source.length })
        } else if (span) {
          source = rawValue.slice(span.start, span.end)
          // 文件缺失 </svg>（span 延伸到值末尾）：用浏览器补全后的 outerHTML 作为
          // 展示/编辑源（直观完整），回写仍按 span 区间（[start, len)），保存时补回闭合标签。
          if (!rawValue.includes('</svg')) {
            const outer = editEl.outerHTML
            if (outer.includes('</svg')) {
              console.log('[svgSourceEdit] value 缺失 </svg>，展示浏览器补全后的源码（保存时补回）', {
                nodePos,
                ordinal,
              })
              source = outer
            }
          }
        }
      } else if (span) {
        source = rawValue.slice(span.start, span.end)
      }
    }
    if (!source) {
      // 都不行才用 DOM 渲染结果（应极少发生）：打印诊断信息，便于定位解析边界情况。
      span = null
      console.warn('[svgSourceEdit] 警告：value 中按序号定位不到 svg，退回 outerHTML', {
        nodePos,
        ordinal,
        value: rawValue,
        outerHTML: editEl.outerHTML,
      })
      source = editEl.outerHTML
    }
    const openedSource = source
    console.log('[svgSourceEdit] open block svg', { nodePos, ordinal, sourceLen: openedSource.length })
    openSvgSourceEditor(view, {
      pos: afterBlockPos(view, nodePos),
      source,
      onApply: (newSource) => {
        const value = getNodeValueAt(view, nodePos)
        if (value == null) {
          showToast('保存失败：位置已变动')
          return false
        }
        // 优先：直接用打开时锁定的 span 下标回写（value 相等，下标仍有效）。
        if (span) {
          const replaced = value.slice(0, span.start) + newSource + value.slice(span.end)
          if (!guardSvgPreserved(value, replaced, showToast)) return false
          const ok = commitNodeValue(view, nodePos, replaced, showToast)
          if (ok) {
            console.log('[svgSourceEdit] apply span ok', { nodePos, ordinal, nextLen: newSource.length })
            showToast('SVG 已更新')
          }
          return ok
        }
        // 按块内顶层 svg 序号回写；若定位节点只有 <svg> 片段（remark 把内联
        // svg 拆成了开标签/子元素/</svg> 多个节点），改用整段替换。
        const replaced = replaceNthSvg(value, ordinal, newSource)
        if (replaced != null) {
          if (!guardSvgPreserved(value, replaced, showToast)) return false
          const ok = commitNodeValue(view, nodePos, replaced, showToast)
          if (ok) {
            console.log('[svgSourceEdit] apply replace ok', { nodePos, ordinal, nextLen: newSource.length })
            showToast('SVG 已更新')
          }
          return ok
        }
        // 整段替换前也做同样的安全校验：原拼接源码含 <svg/</svg> 而新源码丢了 → 拒绝
        if (!guardSvgPreserved(openedSource, newSource, showToast)) return false
        if (spliceInlineRange(view, nodePos, newSource)) {
          console.log('[svgSourceEdit] apply splice ok', { nodePos, nextLen: newSource.length })
          showToast('SVG 已更新')
          return true
        }
        // 走到这里说明：value 中既按序号定位不到、也无法在节点区段内拼出完整 </>
        // 打印完整诊断（value、序号、打开时源码）便于精确定位解析边界情况。
        console.warn('[svgSourceEdit] 失败：替换与拼接都定位不到 svg', {
          nodePos,
          ordinal,
          value,
          openedSource,
        })
        showToast('保存失败：未能定位 SVG 在源码中的位置')
        return false
      },
    })
  }

  return new Plugin({
    props: {
      // htmlBlock / html 节点视图：渲染 HTML 源码 + 给顶层 svg 加四角缩放手柄
      nodeViews: {
        htmlBlock: (node, view, getPos) => createHtmlNodeView(node, view, getPos, 'htmlBlock'),
        html: (node, view, getPos) => createHtmlNodeView(node, view, getPos, 'html'),
      },
      // 用 handleDOMEvents 而不是 handleClick：htmlBlock 是原子节点，PM 对原子内部
      // 的点击不会走到 handleClick（实测），而 handleDOMEvents 总是先于 PM 处理触发。
      handleDOMEvents: {
        click(view, event) {
          const target = event.target as HTMLElement | null
          if (!target) return false
          const wrap = target.closest('.mditor-html-block, .mditor-html-inline')
          if (!wrap) return false

          const svg = target.closest('svg')
          if (svg) {
            event.preventDefault()
            event.stopPropagation()
            openFromSvg(view, wrap as HTMLElement, svg as SVGElement)
            return true
          }

          const img = target.closest('img')
          if (img) {
            const mdSrc = img.dataset.mdSrc ?? img.getAttribute('src')
            if (!mdSrc || !isSvgSrc(mdSrc)) return false
            event.preventDefault()
            event.stopPropagation()
            openFromImg(view, wrap as HTMLElement, img, mdSrc)
            return true
          }

          return false
        },
      },
    },
  })
})