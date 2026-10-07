/// Word (.docx) 导出
///
/// 流程：点击「导出 Word」→ 弹出保存对话框 → 直接遍历 ProseMirror 文档树，
/// 用 docx 库把每个节点映射为 OOXML 元素（标题/段落/列表/表格/代码块/图片/
/// 引用/分割线/数学/任务列表）→ 文档开头生成静态目录（大纲）→ Packer.toBlob
/// 打包 → 写入 .docx 文件。
///
/// 图片与 PDF 导出策略一致：相对路径/网络图片全部内联进文档，离线可用。
/// 数学公式暂以 LaTeX 源码呈现（docx 原生 OMML 转换留待后续）。

import { save } from '@tauri-apps/plugin-dialog'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { IRunOptions, ParagraphChild } from 'docx'
import { editorViewCtx } from '@milkdown/kit/core'
import type { Editor } from '@milkdown/kit/core'
import type { Mark, Node } from '@milkdown/kit/prose/model'
import { readFileBytes, writeFileBytes, fileSize } from './fs'
import { basenameOf, joinPath, parentDirOf } from '../utils/files'

// ── 排版常量 ──
const FONT_BODY = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: '微软雅黑' }
const FONT_HEADING = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: '微软雅黑' }
const FONT_CODE = { ascii: 'Consolas', hAnsi: 'Consolas' }
const MAX_IMG_WIDTH = 560 // A4 内容区安全宽度（px）
const HEADING_SIZES = [32, 28, 24, 22, 22, 20] // h1..h6（半磅：16/14/12/11/11/10pt）
const HEADING_BEFORE = [480, 380, 300, 260, 220, 180] // h1..h6 段前间距（twips，逐级递减）

type Align = (typeof AlignmentType)[keyof typeof AlignmentType]

/** 输出块：段落或表格 */
type Block = Paragraph | Table

interface WalkCtx {
  blocks: Block[]
  docPath: string
  /** 有序列表顶层引用序号（每个独立列表一个引用，避免编号跨列表连续） */
  orderedCount: number
}

// ═══════════════════════════════════════════════════════════════════════
// 一、图片大小解析（同步头解析 + 浏览器兜底）
// ═══════════════════════════════════════════════════════════════════════

/** 从图片字节流头部直接解析宽高（PNG/GIF/JPEG/WebP），失败返回 null */
function parseHeaderSize(bytes: Uint8Array): { width: number; height: number } | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // PNG：签名 IHDR（偏移 16/20 各 4 字节大端宽高）
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: dv.getUint32(16), height: dv.getUint32(20) }
  }

  // GIF：'GIF8' 后偏移 6/8 各 2 字节小端宽高
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) }
  }

  // JPEG：扫描段标记，命中 SOF（C0-CF 中去掉 C4/C8/CC）即得宽高
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let off = 2
    while (off + 9 < bytes.length) {
      if (bytes[off] !== 0xff) {
        off++
        continue
      }
      const marker = bytes[off + 1]
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
        off += 2
        continue
      }
      const len = (bytes[off + 2] << 8) | bytes[off + 3]
      if (len < 2) break
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: (bytes[off + 7] << 8) | bytes[off + 8], height: (bytes[off + 5] << 8) | bytes[off + 6] }
      }
      off += 2 + len
    }
  }

  // WebP：'RIFF'...'WEBP'，VP8X 宽高为偏移 24 起的 3 字节小端
  if (bytes.length >= 30 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) {
    const kind = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
    if (kind === 'VP8X') {
      return {
        width: bytes[24] | (bytes[25] << 8) | (bytes[26] << 16),
        height: bytes[27] | (bytes[28] << 8) | (bytes[29] << 16),
      }
    }
  }

  return null
}

/** 用浏览器 Image 解码获取图片原始尺寸（SVG/BMP 等头解析覆盖不到的格式） */
function imageSizeViaBrowser(bytes: Uint8Array): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]))
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

/** 解析图片真实尺寸，并等比缩放到 A4 内容宽度内 */
async function fitImageSize(bytes: Uint8Array): Promise<{ width: number; height: number } | null> {
  const raw = parseHeaderSize(bytes) ?? (await imageSizeViaBrowser(bytes))
  if (!raw || raw.width <= 0 || raw.height <= 0) return null
  const scale = Math.min(1, MAX_IMG_WIDTH / raw.width)
  return {
    width: Math.round(raw.width * scale),
    height: Math.round(raw.height * scale),
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 二、行内内容 → docx run
// ═══════════════════════════════════════════════════════════════════════

/** 把一组 mark 映射为 TextRun 样式选项（除 link 之外全部内联应用，属性只读故用合并） */
function marksToRunOptions(text: string, marks: readonly Mark[], forceBold: boolean): IRunOptions {
  let o: IRunOptions = { text }
  for (const m of marks) {
    switch (m.type.name) {
      case 'strong':
        o = { ...o, bold: true }
        break
      case 'emphasis':
        o = { ...o, italics: true }
        break
      case 'strikethrough':
        o = { ...o, strike: true }
        break
      case 'code_inline':
        o = { ...o, font: FONT_CODE, size: 19, shading: { type: ShadingType.CLEAR, fill: 'F0F0F0' } }
        break
      case 'highlight':
        o = { ...o, highlight: 'yellow' }
        break
      default:
        break
    }
  }
  if (forceBold) o = { ...o, bold: true }
  return o
}

/** 按 \n 切分文本块生成 run（软换行 → w:br），若命中链接 mark 则包成超链接 */
function runsForLeaf(text: string, marks: readonly Mark[], forceBold: boolean): ParagraphChild[] {
  if (!text) return []
  const link = marks.find((m) => m.type.name === 'link')
  const href = (link?.attrs.href as string) || undefined

  const parts = text.split('\n')
  const runs: TextRun[] = parts.map((seg, i) => new TextRun({ ...marksToRunOptions(seg, marks, forceBold), break: i > 0 ? 1 : 0 }))

  if (!href) return runs
  return runs.map((r) => new ExternalHyperlink({ link: href, children: [r] }))
}

/** 递归行走行内内容（段落/单元格/列表项内容），返回 run / 超链接 / 内联图片流 */
function inlineChildren(
  parent: Node,
  inheritedMarks: readonly Mark[] = [],
  acc: ParagraphChild[] = [],
  forceBold = false,
): ParagraphChild[] {
  parent.forEach((child) => {
    const marks = [...inheritedMarks, ...child.marks]
    if (child.isText) {
      acc.push(...runsForLeaf(child.text ?? '', marks, forceBold))
      return
    }
    switch (child.type.name) {
      case 'hard_break':
        acc.push(new TextRun({ break: 1, text: '' }))
        break
      case 'math_inline':
        // OMML 转换暂缺：以等宽字体的 $...$ 源码呈现，保证内容不丢失
        acc.push(new TextRun({ text: `$${child.textContent}$`, font: FONT_CODE, size: 19 }))
        break
      case 'taskListItemCheckbox':
        // GFM 任务勾选框：列表项首位，由列表项 checked 渲染 ☑/☐，这里跳过
        break
      default:
        inlineChildren(child, marks, acc, forceBold)
        break
    }
  })
  return acc
}

/** 行内内容 → 段落（支持任务前缀、强制加粗、对齐、编号、自定义间距） */
function paragraphFromInline(
  parent: Node,
  taskChecked: boolean | null,
  opts: {
    bold?: boolean
    alignment?: Align
    numbering?: { reference: string; level: number }
    spacing?: { after?: number }
  } = {},
): Paragraph {
  const children: ParagraphChild[] = []
  if (taskChecked != null) {
    // 任务勾选框：用 Word 符号字体 Wingdings 渲染（勾选 'ü'/U+00FC、空框 'q'/U+0071），
    // 避免 ☑/☐ 在不同系统字体下缺失或走样；符号与文本间用普通空格分隔。
    children.push(
      new TextRun({
        text: taskChecked ? '\u00fc' : 'q',
        font: { ascii: 'Wingdings', hAnsi: 'Wingdings' },
      }),
      new TextRun({ text: ' ' }),
    )
  }
  children.push(...inlineChildren(parent, [], [], opts.bold ?? false))
  return new Paragraph({
    children,
    numbering: opts.numbering,
    spacing: opts.spacing ?? { after: 120 },
    alignment: opts.alignment,
    autoSpaceEastAsianText: false,
  })
}

// ═══════════════════════════════════════════════════════════════════════
// 三、块级内容 → docx 段落 / 表格
// ═══════════════════════════════════════════════════════════════════════

function headingParagraph(node: Node): Paragraph {
  const level = Math.min(6, Math.max(1, (node.attrs.level as number) || 1))
  const heading = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ][level - 1]
  return new Paragraph({
    heading,
    children: inlineChildren(node),
    // 段前间距随层级递减；keepNext 让标题与下一段同页，避免标题孤立在页底
    spacing: { before: HEADING_BEFORE[level - 1], after: 120 },
    keepNext: true,
    autoSpaceEastAsianText: false,
  })
}

function codeBlockParagraph(node: Node): Paragraph {
  const code = node.textContent || ''
  const lines = code.split('\n')
  return new Paragraph({
    children: lines.map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0, font: FONT_CODE, size: 19 })),
    shading: { type: ShadingType.CLEAR, fill: 'F5F5F5' },
    alignment: AlignmentType.LEFT,
    autoSpaceEastAsianText: false,
  })
}

function blockquoteParagraphs(node: Node): Paragraph[] {
  // Typora 风格引用：左缩进 + 灰色左边线，每段一个 Paragraph
  const paragraphs: Paragraph[] = []
  node.forEach((child) => {
    if (child.type.name === 'paragraph') {
      paragraphs.push(
        new Paragraph({
          children: inlineChildren(child),
          indent: { left: 720 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'A0A0A0', space: 8 } },
          spacing: { after: 120 },
        }),
      )
    } else {
      // 引用内嵌套块（引用/列表等）：递归提升为引用段落，保留内容
      paragraphs.push(...blockquoteParagraphs(child))
    }
  })
  return paragraphs.length > 0 ? paragraphs : [new Paragraph({ children: [], indent: { left: 720 } })]
}

function horizontalRuleParagraph(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: '' })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' } },
    spacing: { before: 120, after: 120 },
  })
}

function mathBlockParagraph(node: Node): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: node.attrs.value as string, italics: true, font: FONT_CODE, size: 19 })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
  })
}

function frontmatterParagraph(node: Node): Paragraph {
  const lines = ((node.attrs.value as string) || '').split('\n')
  return new Paragraph({
    children: lines.map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0, font: FONT_CODE, size: 17, color: '808080' })),
    spacing: { after: 120 },
  })
}

/** 解析图片 src → 二进制字节 + 扩展名（相对路径 / file:// / http(s) / data URI） */
async function resolveImageBytes(src: string, docPath: string): Promise<{ bytes: Uint8Array; ext: string } | null> {
  // data URI：直接解码
  if (src.startsWith('data:')) {
    const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(src)
    if (!m) return null
    const bin = atob(m[2])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes, ext: m[1].toLowerCase().replace('jpeg', 'jpg') }
  }

  // 网络图片：抓取字节后内联（导出文档离线可用）
  if (/^https?:/i.test(src)) {
    try {
      const res = await fetch(src)
      if (!res.ok) return null
      const buf = await res.arrayBuffer()
      const ext = src.split('.').pop()?.split(/[?#]/)[0].toLowerCase() || 'png'
      return { bytes: new Uint8Array(buf), ext }
    } catch {
      return null
    }
  }

  // 本地文件：与 PDF 导出一致地解析 file:// 前缀与相对文档目录
  let filePath = src
  if (filePath.startsWith('file://')) {
    filePath = filePath.slice('file://'.length)
    if (filePath.startsWith('/')) filePath = filePath.slice(1)
  }
  try {
    filePath = decodeURIComponent(filePath)
  } catch {
    /* 保留原样 */
  }
  if (!/^[A-Za-z]:[\\/]/.test(filePath)) {
    filePath = joinPath(parentDirOf(docPath), filePath)
  }
  try {
    const bytes = await readFileBytes(filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
    return { bytes, ext }
  } catch {
    return null
  }
}

/** docx 支持的图片类型（其余 webp/svg/avif 等在浏览器内转成 PNG 再内嵌） */
type DocxImageType = 'jpg' | 'png' | 'gif' | 'bmp'

/** 把图片字节归一化为 docx 直接支持的格式；未知格式经 canvas 转 PNG */
async function toDocxImage(resolved: {
  bytes: Uint8Array
  ext: string
}): Promise<{ bytes: Uint8Array; type: DocxImageType } | null> {
  const ext = resolved.ext.toLowerCase().replace('jpeg', 'jpg')
  if (ext === 'jpg' || ext === 'png' || ext === 'gif' || ext === 'bmp') {
    return { bytes: resolved.bytes, type: ext }
  }
  // webp/svg/avif/ico 等：浏览器解码 → canvas 重绘 → PNG 字节
  try {
    // 给 blob 设置正确的 MIME 类型，避免 SVG 字节因类型缺失被浏览器拒绝渲染
    const mimeMap: Record<string, string> = {
      svg: 'image/svg+xml',
      webp: 'image/webp',
      avif: 'image/avif',
      bmp: 'image/bmp',
      ico: 'image/x-icon',
    }
    const blobType = mimeMap[ext] || 'application/octet-stream'
    const url = URL.createObjectURL(new Blob([new Uint8Array(resolved.bytes)], { type: blobType }))
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => resolve(null)
      el.src = url
    })
    URL.revokeObjectURL(url)
    if (!img || !img.naturalWidth || !img.naturalHeight) return null
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    const dataUrl = canvas.toDataURL('image/png')
    const bin = atob(dataUrl.split(',')[1] ?? '')
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes, type: 'png' }
  } catch {
    return null
  }
}

/** 图片 src → 居中段落（内联字节 + 等比缩放 + 可选 alt 说明） */
async function imageSrcToParagraph(src: string, alt: string, docPath: string): Promise<Paragraph | null> {
  if (!src) return null
  const resolved = await resolveImageBytes(src, docPath)
  if (!resolved) return null
  // SVG 走超采样渲染：普通路径按固有像素 1:1 光栅化会糊，需提高像素密度
  const ext = resolved.ext.toLowerCase().replace('jpeg', 'jpg')
  if (ext === 'svg' || ext === 'svg+xml') {
    const p = await svgBytesToImageParagraph(resolved.bytes, alt)
    if (p) return p
    // 渲染失败则回退到通用 canvas 路径
  }
  const image = await toDocxImage(resolved)
  if (!image) return null
  const size = await fitImageSize(image.bytes)
  if (!size) return null
  const children: ParagraphChild[] = [
    new ImageRun({
      type: image.type,
      data: image.bytes,
      transformation: size,
    }),
  ]
  if (alt) children.push(new TextRun({ text: `（${alt}）`, color: 'A0A0A0', size: 17, break: 1 }))
  return new Paragraph({ children, alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 } })
}

/** 图片节点 → 居中段落 */
async function imageParagraph(node: Node, docPath: string): Promise<Paragraph | null> {
  return imageSrcToParagraph((node.attrs.src as string) || '', (node.attrs.alt as string) || '', docPath)
}

/** 加载图片为 HTMLImageElement，失败返回 null（统一 onload/onerror Promise 封装） */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => resolve(null)
    el.src = src
  })
}

/** 从 SVG 元素推断固有尺寸：naturalWidth → width/height 属性 → viewBox → 兜底 */
function resolveSvgDims(svg: Element, img: HTMLImageElement): { w: number; h: number } {
  let w = img.naturalWidth
  let h = img.naturalHeight
  if (!w || !h) {
    const wAttr = parseFloat(svg.getAttribute('width') || '')
    const hAttr = parseFloat(svg.getAttribute('height') || '')
    if (!w && wAttr > 0) w = wAttr
    if (!h && hAttr > 0) h = hAttr
  }
  if (!w || !h) {
    const vb = svg.getAttribute('viewBox')
    if (vb) {
      const parts = vb.split(/[\s,]+/).map(Number)
      if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
        if (!w) w = parts[2]
        if (!h) h = parts[3]
      }
    }
  }
  return { w: w || 300, h: h || 200 }
}

/**
 * 超采样光栅化 SVG → PNG：显示尺寸按 SVG 固有大小等比缩放到 A4 内容宽度内，
 * 但 canvas 以 2-3 倍尺寸渲染，保证 PNG 像素密度足够，Word 内不糊。
 * 倍数取 max(1, MAX_IMG_WIDTH*2 / w) 并上限 3 防爆内存；总像素超 16MP 再等比降。
 */
async function supersampleSvgToPng(
  img: HTMLImageElement,
  naturalW: number,
  naturalH: number,
): Promise<{ bytes: Uint8Array; displayW: number; displayH: number } | null> {
  const w = naturalW || 300
  const h = naturalH || 200
  // 显示尺寸：等比缩放到 A4 内容宽度内，不放大（保持 SVG 固有大小）
  const fitScale = Math.min(1, MAX_IMG_WIDTH / w)
  const displayW = Math.max(1, Math.round(w * fitScale))
  const displayH = Math.max(1, Math.round(h * fitScale))
  // 渲染尺寸：超采样（目标渲染宽 ≥ MAX_IMG_WIDTH*2，倍数 1-3）
  const renderScale = Math.min(3, Math.max(1, (MAX_IMG_WIDTH * 2) / w))
  let renderW = Math.max(1, Math.round(w * renderScale))
  let renderH = Math.max(1, Math.round(h * renderScale))
  // 总像素上限 16MP，防 OOM
  const MAX_PIXELS = 16_000_000
  if (renderW * renderH > MAX_PIXELS) {
    const k = Math.sqrt(MAX_PIXELS / (renderW * renderH))
    renderW = Math.max(1, Math.round(renderW * k))
    renderH = Math.max(1, Math.round(renderH * k))
  }
  const canvas = document.createElement('canvas')
  canvas.width = renderW
  canvas.height = renderH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, renderW, renderH)
  const dataUrl = canvas.toDataURL('image/png')
  const bin = atob(dataUrl.split(',')[1] ?? '')
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, displayW, displayH }
}

/**
 * SVG 元素 → 居中图片段落（超采样渲染，Word 内清晰）。
 * 把 <svg> 序列化成 data URL → Image 解码 → 超采样 canvas 重绘为 PNG → 内嵌进 docx。
 */
async function svgElementToImageParagraph(svg: Element): Promise<Paragraph | null> {
  try {
    const svgStr = new XMLSerializer().serializeToString(svg)
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`
    const img = await loadImage(dataUrl)
    if (!img) return null
    const { w, h } = resolveSvgDims(svg, img)
    const result = await supersampleSvgToPng(img, w, h)
    if (!result) return null
    return new Paragraph({
      children: [new ImageRun({ type: 'png', data: result.bytes, transformation: { width: result.displayW, height: result.displayH } })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 },
    })
  } catch {
    return null
  }
}

/**
 * SVG 文件字节 → 居中图片段落（超采样渲染，Word 内清晰）。
 * 用于 Markdown `![](file.svg)` 引用的本地/网络 SVG 文件。
 */
async function svgBytesToImageParagraph(bytes: Uint8Array, alt: string): Promise<Paragraph | null> {
  try {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/svg+xml' }))
    const img = await loadImage(url)
    URL.revokeObjectURL(url)
    if (!img) return null
    const w = img.naturalWidth || 300
    const h = img.naturalHeight || 200
    const result = await supersampleSvgToPng(img, w, h)
    if (!result) return null
    const children: ParagraphChild[] = [
      new ImageRun({ type: 'png', data: result.bytes, transformation: { width: result.displayW, height: result.displayH } }),
    ]
    if (alt) children.push(new TextRun({ text: `（${alt}）`, color: 'A0A0A0', size: 17, break: 1 }))
    return new Paragraph({ children, alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 } })
  } catch {
    return null
  }
}

/**
 * HTML 值（htmlBlock/html 节点 attrs.value）→ docx 块数组。
 * 按文档顺序遍历：SVG/<img> 渲染为图片段落，其余保留可见文本。
 * 解决「SVG 源码被当文本剥标签后变成一堆文字」的问题。
 */
async function htmlValueToBlocks(raw: string, docPath: string): Promise<Block[]> {
  if (!raw.trim()) return []
  const container = document.createElement('div')
  container.innerHTML = raw
  const blocks: Block[] = []
  let textAcc = ''

  const flushText = () => {
    const text = textAcc.replace(/\s+/g, ' ').trim()
    if (text) blocks.push(new Paragraph({ children: [new TextRun({ text })] }))
    textAcc = ''
  }

  const walk = async (parent: ParentNode): Promise<void> => {
    for (const child of Array.from(parent.childNodes)) {
      if (child instanceof Text) {
        textAcc += child.textContent || ''
      } else if (child instanceof Element) {
        const tag = child.tagName.toLowerCase()
        if (tag === 'svg') {
          flushText()
          const p = await svgElementToImageParagraph(child)
          if (p) blocks.push(p)
          else {
            // SVG 渲染失败：保留源码内的可见文本，避免内容静默丢失
            const t = child.textContent || ''
            if (t) textAcc += t
          }
        } else if (tag === 'img') {
          flushText()
          const src = child.getAttribute('src') || ''
          const alt = child.getAttribute('alt') || ''
          if (src) {
            const p = await imageSrcToParagraph(src, alt, docPath)
            if (p) blocks.push(p)
          }
        } else {
          // 其他元素：递归取其内部文本与子级 svg/img
          await walk(child)
        }
      }
    }
  }
  await walk(container)
  flushText()
  return blocks
}

// ── 列表 ──

const BULLET_TEXTS = ['•', '◦', '▪', '•']
const ORDERED_TEXTS = ['%1.', '%2.', '%3.', '%4.']
const BULLET_LEVELS = 4

/** 生成某引用（bullet / ordered-N）的各级编号配置 */
function levelsFor(ordered: boolean) {
  return Array.from({ length: BULLET_LEVELS }, (_, level) => ({
    level,
    format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
    text: ordered ? ORDERED_TEXTS[level] : BULLET_TEXTS[level],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 + level * 360, hanging: 240 } } },
  }))
}

/** 列表节点递归展开：list_item → 带编号/项目符号段落；嵌套列表层级 +1；任务项加勾选框 */
async function pushList(listNode: Node, ordered: boolean, level: number, ctx: WalkCtx): Promise<void> {
  const reference =
    level === 0
      ? ordered
        ? `md-ordered-${ctx.orderedCount++}`
        : 'md-bullet'
      : ordered
        ? `md-ordered-${ctx.orderedCount - 1}`
        : 'md-bullet'
  for (let i = 0; i < listNode.childCount; i++) {
    const item = listNode.child(i)
    const checked = item.attrs.checked as boolean | null
    for (let j = 0; j < item.childCount; j++) {
      const content = item.child(j)
      if (content.type.name === 'paragraph') {
        ctx.blocks.push(
          paragraphFromInline(content, checked, {
            numbering: { reference, level },
            spacing: { after: 60 },
          }),
        )
      } else if (content.type.name === 'bullet_list') {
        await pushList(content, false, level + 1, ctx)
      } else if (content.type.name === 'ordered_list') {
        await pushList(content, true, level + 1, ctx)
      } else {
        await pushBlock(content, ctx)
      }
    }
  }
}

/** 表格节点 → docx Table（表头行自动加粗 + 单元格对齐） */
function tableFromNode(node: Node): Table {
  const rows: TableRow[] = []
  node.forEach((row) => {
    const cells: TableCell[] = []
    row.forEach((cell) => {
      const alignment = (cell.attrs.alignment as 'left' | 'center' | 'right' | undefined) || 'left'
      const alignMap: Record<string, Align> = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT }
      const isHeader = cell.type.name === 'table_header'
      const children: Paragraph[] = []
      cell.forEach((child) => {
        if (child.type.name === 'paragraph') {
          children.push(paragraphFromInline(child, null, { bold: isHeader, alignment: alignMap[alignment] }))
        }
      })
      if (children.length === 0) {
        children.push(new Paragraph({ children: [], alignment: alignMap[alignment] }))
      }
      cells.push(
        new TableCell({
          children,
          // 表头行浅灰底纹，与正文数据行形成对比
          shading: isHeader ? { type: ShadingType.CLEAR, fill: 'EDEDED' } : undefined,
        }),
      )
    })
    rows.push(
      new TableRow({
        tableHeader: row.type.name === 'table_header',
        children: cells,
      }),
    )
  })
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    // 单元格统一留白，行高更透气（80≈0.056″、120≈0.083″）
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  })
}

/** 块级节点分发（顶层与嵌套共用） */
async function pushBlock(node: Node, ctx: WalkCtx): Promise<void> {
  switch (node.type.name) {
    case 'paragraph':
      ctx.blocks.push(paragraphFromInline(node, null))
      break
    case 'heading':
      ctx.blocks.push(headingParagraph(node))
      break
    case 'bullet_list':
      await pushList(node, false, 0, ctx)
      break
    case 'ordered_list':
      await pushList(node, true, 0, ctx)
      break
    case 'blockquote':
      ctx.blocks.push(...blockquoteParagraphs(node))
      break
    case 'code_block':
      ctx.blocks.push(codeBlockParagraph(node))
      break
    case 'table':
      ctx.blocks.push(tableFromNode(node))
      break
    case 'horizontal_rule':
      ctx.blocks.push(horizontalRuleParagraph())
      break
    case 'math_block':
      ctx.blocks.push(mathBlockParagraph(node))
      break
    case 'frontmatter':
      ctx.blocks.push(frontmatterParagraph(node))
      break
    case 'htmlBlock':
    case 'html':
      {
        // 原始 HTML 块：把其中的 SVG/<img> 渲染为 Word 图片，其余保留可见文本
        const raw = String(node.attrs.value ?? '')
        const htmlBlocks = await htmlValueToBlocks(raw, ctx.docPath)
        ctx.blocks.push(...htmlBlocks)
      }
      break
    case 'image':
      {
        const p = await imageParagraph(node, ctx.docPath)
        if (p) ctx.blocks.push(p)
      }
      break
    default:
      // 未知节点兜底：以纯文本呈现，不丢内容
      if (node.isText) {
        ctx.blocks.push(new Paragraph({ children: [new TextRun({ text: node.text ?? '' })] }))
      } else if (node.textContent) {
        ctx.blocks.push(new Paragraph({ children: [new TextRun({ text: node.textContent })] }))
      }
      break
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 四、导出入口
// ═══════════════════════════════════════════════════════════════════════

/**
 * 导出当前内容为 Word（.docx）。
 * @returns 用户完成导出返回 true；用户取消保存对话框返回 false；失败抛异常。
 */
export async function exportDocx(editor: Editor | null, docPath: string): Promise<boolean> {
  if (!editor) return false

  const defaultName = basenameOf(docPath).replace(/\.md$/i, '') + '.docx'
  const filePath = await save({
    defaultPath: defaultName,
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  })
  if (!filePath) return false

  const document = await editor.action(async (ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return null

    const walkCtx: WalkCtx = { blocks: [], docPath, orderedCount: 0 }
    // 根节点 doc 是容器（无对应块类型），必须遍历其顶层子块逐个分发；
    // 直接 pushBlock(view.state.doc) 会落入 default 兜底分支，把整篇文档压成纯文本。
    const root = view.state.doc
    for (let i = 0; i < root.childCount; i++) {
      await pushBlock(root.child(i), walkCtx)
    }

    // 大纲导出：文档开头生成静态目录（按标题层级缩进），分页后再输出正文
    const outlineEntries: { level: number; text: string }[] = []
    root.descendants((node) => {
      if (node.type.name === 'heading') {
        const level = Math.min(6, Math.max(1, (node.attrs.level as number) || 1))
        const text = node.textContent.trim()
        if (text) outlineEntries.push({ level, text })
      }
    })
    const tocBlocks: Block[] = []
    if (outlineEntries.length > 0) {
      tocBlocks.push(
        new Paragraph({
          children: [new TextRun({ text: '目录', bold: true, size: HEADING_SIZES[0], font: FONT_HEADING })],
          spacing: { after: 240 },
        }),
      )
      for (const entry of outlineEntries) {
        tocBlocks.push(
          new Paragraph({
            children: [new TextRun({ text: entry.text })],
            // 每级标题左缩进对应层级（二级 360 twips、三级 720…）
            indent: { left: (entry.level - 1) * 360 },
            spacing: { after: 120 },
          }),
        )
      }
      tocBlocks.push(new Paragraph({ children: [new PageBreak()] }))
    }

    // 动态编号引用：每个顶层有序列表一个（避免 Word 跨列表连续编号）
    const orderedRefs = Array.from({ length: walkCtx.orderedCount }, (_, i) => ({
      reference: `md-ordered-${i}`,
      levels: levelsFor(true),
    }))
    const bulletRef = { reference: 'md-bullet', levels: levelsFor(false) }

    return new Document({
      numbering: { config: [bulletRef, ...orderedRefs] },
      styles: {
        default: {
          document: { run: { font: FONT_BODY, size: 22 }, paragraph: { autoSpaceEastAsianText: false } as any },
          heading1: { run: { font: FONT_HEADING, size: HEADING_SIZES[0], bold: true, color: '1F6FEB' } },
          heading2: { run: { font: FONT_HEADING, size: HEADING_SIZES[1], bold: true, color: '1F2328' } },
          heading3: { run: { font: FONT_HEADING, size: HEADING_SIZES[2], bold: true, color: '1F2328' } },
          heading4: { run: { font: FONT_HEADING, size: HEADING_SIZES[3], bold: true, color: '1F2328' } },
          heading5: { run: { font: FONT_HEADING, size: HEADING_SIZES[4], bold: true, color: '1F2328' } },
          heading6: { run: { font: FONT_HEADING, size: HEADING_SIZES[5], bold: true, color: '1F2328' } },
        },
      },
      sections: [
        {
          properties: {
            page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
          },
          children: [...tocBlocks, ...walkCtx.blocks],
        },
      ],
    })
  })
  if (!document) return false

  const blob = await Packer.toBlob(document)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  await writeFileBytes(filePath, bytes)
  // 二次校验：确认文件确实落盘且非空，避免「成功」提示与实际不符
  const size = await fileSize(filePath)
  if (!size || size <= 0) throw new Error('导出文件为空或不存在')
  return true
}