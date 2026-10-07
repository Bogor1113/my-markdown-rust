import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import type { Node as RemarkNode } from '@milkdown/kit/transformer'
import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import { toDisplayImageSrc } from '../services/imageDisplay'

/**
 * 把渲染出的 HTML 里的 <img> src 统一转为可显示地址：
 * URL（http/https/data:）原样返回，相对/绝对本地路径转 asset 协议 URL。
 * 否则 HTML 块里的本地图片会因 WebView 的 base 不是文档目录而裂图。
 * 同时给加载失败的图片加占位样式（alt 文本可见），便于区分网络/路径问题。
 */
export function fixHtmlImages(dom: HTMLElement): void {
  dom.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (!src) return
    // 记录原始 src（HTML 源码里保存的路径/URL），供右键「用系统查看器打开/
    // 在文件管理器中显示」使用；DOM 上的 src 已被替换为可显示地址（asset://），
    // 直接取 DOM src 会被 asset 协议路径坑到（还原回本地路径容易出错）。
    img.dataset.mdSrc = src
    // 不发送 Referer：避免 CSDN 等防盗链图床因 WebView 来源 Referer 返回 403
    img.referrerPolicy = 'no-referrer'
    // 懒加载：HTML 块里的图片可能很大/很多，全量解码会吃掉数 GB 内存
    img.loading = 'lazy'
    img.decoding = 'async'
    img.setAttribute('src', toDisplayImageSrc(src))
    img.addEventListener('error', () => {
      if (img.dataset.errHandled) return
      img.dataset.errHandled = '1'
      img.classList.add('mditor-html-img-error')
    })
  })
}

/**
 * 递归遍历 mdast：把「块级 HTML」（父节点不是 paragraph）重命名为 htmlBlock，
 * 段落内的 HTML 保持原类型，由行内 html 节点处理。
 *
 * 前置条件：commonmark 内置的 remarkHtmlTransformer 已被剔除（见 MilkdownEditor.tsx），
 * 否则它会把块级 HTML 提前包进 paragraph，导致此处无法区分块级/行内。
 */
function renameBlockHtml(tree: RemarkNode): void {
  if (!Array.isArray((tree as RemarkNode & { children?: RemarkNode[] }).children)) return
  const children = (tree as RemarkNode & { children: RemarkNode[] }).children
  for (const child of children) {
    if (child && child.type === 'html' && tree.type !== 'paragraph') {
      child.type = 'htmlBlock'
    }
    renameBlockHtml(child)
  }
}

/// remark 阶段：块级 HTML 分类为 htmlBlock
export const htmlBlockRemark = $remark('htmlBlockRemark', () => () => (tree: RemarkNode) => {
  renameBlockHtml(tree)
})

const htmlBlockId = 'htmlBlock'

/**
 * 块级 HTML 节点：atom 块，attrs.value 保存原始 HTML 源码，
 * 渲染为真实 DOM（内部图片自动加载），序列化时原样还原为 HTML。
 */
export const htmlBlockSchema = $nodeSchema(htmlBlockId, () => ({
  group: 'block',
  atom: true,
  marks: '',
  defining: true,
  isolating: true,
  attrs: {
    value: { default: '', validate: 'string' },
  },
  parseDOM: [
    {
      tag: `div[data-type="${htmlBlockId}"]`,
      preserveWhitespace: 'full',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return {}
        return { value: dom.dataset.value ?? '' }
      },
    },
  ],
  toDOM: (node) => {
    const value = node.attrs.value as string
    const dom = document.createElement('div')
    dom.dataset.type = htmlBlockId
    dom.dataset.value = value
    dom.className = 'mditor-html-block'
    dom.innerHTML = value
    fixHtmlImages(dom)
    return dom
  },
  parseMarkdown: {
    match: (node) => node.type === htmlBlockId,
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === htmlBlockId,
    runner: (state, node) => {
      // 序列化回 remark 的 'html' 类型：remark-stringify 原生支持原样输出原始 HTML
      state.addNode('html', undefined, node.attrs.value as string)
    },
  },
}))

/**
 * 行内 HTML 节点：覆盖 commonmark 的 html 节点，把原始源码渲染为真实 DOM。
 * （commonmark 默认实现只把源码当纯文本展示，既不解析标签也不加载图片。）
 */
export const htmlInlineSchema = $nodeSchema('html', () => ({
  atom: true,
  group: 'inline',
  inline: true,
  attrs: {
    value: { default: '', validate: 'string' },
  },
  parseDOM: [
    {
      tag: 'span[data-type="html"]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return {}
        return { value: dom.dataset.value ?? '' }
      },
    },
  ],
  toDOM: (node) => {
    const value = node.attrs.value as string
    const span = document.createElement('span')
    span.dataset.type = 'html'
    span.dataset.value = value
    span.className = 'mditor-html-inline'
    span.innerHTML = value
    fixHtmlImages(span)
    return span
  },
  parseMarkdown: {
    match: (node) => node.type === 'html',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'html',
    runner: (state, node) => {
      state.addNode('html', undefined, node.attrs.value as string)
    },
  },
}))

/// HTML 插件组：remark 块级分类 + 块级/行内节点 schema
export const htmlPlugin: MilkdownPlugin[] = [htmlBlockRemark, htmlBlockSchema, htmlInlineSchema].flat()