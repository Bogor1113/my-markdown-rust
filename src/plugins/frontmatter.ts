import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import remarkFrontmatter from 'remark-frontmatter'

/// 包装 [remark-frontmatter](https://www.npmjs.com/package/remark-frontmatter)，
/// 让解析器把文档开头的 `---\nyaml\n---` 识别为 `yaml` 节点。
/// remark-frontmatter 同时提供 toMarkdownExtensions，序列化时 yaml 节点
/// 会自动还原成 `---` 围栏，无需自定义 handler。
export const remarkFrontmatterPlugin = $remark<'remarkFrontmatter', { type: string; marker: string }[]>(
  'remarkFrontmatter',
  () => remarkFrontmatter,
  [{ type: 'yaml', marker: '-' }]
)

const frontmatterId = 'frontmatter'

/// 前端置块 schema：一个不参与内容的原子块，attrs.value 保存原始 YAML 文本。
export const frontmatterSchema = $nodeSchema(frontmatterId, () => ({
  group: 'block',
  content: 'text*',
  atom: true,
  marks: '',
  defining: true,
  isolating: true,
  attrs: {
    value: {
      default: '',
    },
  },
  parseDOM: [
    {
      tag: `div[data-type="${frontmatterId}"]`,
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
    dom.dataset.type = frontmatterId
    dom.dataset.value = value
    dom.className = 'frontmatter-block'
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.className = 'language-yaml'
    code.textContent = value
    pre.appendChild(code)
    dom.appendChild(pre)
    return dom
  },
  parseMarkdown: {
    match: (node) => node.type === 'yaml',
    runner: (state, node, type) => {
      const value = node.value as string
      state.addNode(type, { value })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === frontmatterId,
    runner: (state, node) => {
      state.addNode('yaml', undefined, node.attrs.value as string)
    },
  },
}))

/// frontmatter 插件组：remark 解析 + yaml 节点 schema。
export const frontmatter: MilkdownPlugin[] = [
  remarkFrontmatterPlugin,
  frontmatterSchema,
].flat()