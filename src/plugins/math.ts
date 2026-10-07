import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx'
import {
  $ctx,
  $inputRule,
  $nodeSchema,
  $remark,
} from '@milkdown/kit/utils'
import type { KatexOptions } from 'katex'
import katex from 'katex'
import remarkMath from 'remark-math'
import { Fragment } from '@milkdown/kit/prose/model'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { nodeRule } from '@milkdown/kit/prose'
import 'katex/dist/katex.min.css'

/// 包装 [remark-math](https://www.npmjs.com/package/remark-math)，
/// 让解析器认识 `$...$`（内联）与 `$$...$$`（块）两种数学公式语法。
export const remarkMathPlugin = $remark<'remarkMath', undefined>(
  'remarkMath',
  () => remarkMath
)

const mathInlineId = 'math_inline'

/// katex 渲染选项，可在配置阶段覆盖。
/// 默认 `throwOnError: false`，遇到非法 LaTeX（如 `#`、`$` 等特殊字符）时
/// 在节点内联显示红色错误信息，而不是抛出异常导致整个编辑器卡死。
export const katexOptionsCtx = $ctx<KatexOptions, 'katexOptions'>(
  { throwOnError: false },
  'katexOptions'
)

/// 内联数学节点 schema：`$E=MC^2$`
export const mathInlineSchema = $nodeSchema('math_inline', (ctx: Ctx) => ({
  group: 'inline',
  content: 'text*',
  inline: true,
  atom: true,
  parseDOM: [
    {
      tag: `span[data-type="${mathInlineId}"]`,
      getContent: (dom, schema) => {
        if (!(dom instanceof HTMLElement)) return Fragment.empty
        return Fragment.from(schema.text(dom.dataset.value ?? ''))
      },
    },
  ],
  toDOM: (node) => {
    const code: string = node.textContent
    const dom = document.createElement('span')
    dom.dataset.type = mathInlineId
    dom.dataset.value = code
    dom.className = 'katex-inline'
    try {
      katex.render(code, dom, ctx.get(katexOptionsCtx.key))
    } catch (err) {
      dom.textContent = code
      dom.classList.add('katex-error')
      console.error('[math] katex inline render failed:', err, 'code=', code)
    }
    return dom
  },
  parseMarkdown: {
    match: (node) => node.type === 'inlineMath',
    runner: (state, node, type) => {
      state
        .openNode(type)
        .addText(node.value as string)
        .closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === mathInlineId,
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, node.textContent)
    },
  },
}))

/// 输入规则：输入 `$内容$` 后自动转成内联数学节点。
export const mathInlineInputRule = $inputRule((ctx: Ctx) =>
  nodeRule(/(?:\$)([^$]+)(?:\$)$/, mathInlineSchema.type(ctx), {
    beforeDispatch: ({ tr, match, start }) => {
      tr.insertText(match[1] ?? '', start + 1)
    },
  })
)

const mathBlockId = 'math_block'

/// 块级数学节点 schema：`$$...$$`
export const mathBlockSchema = $nodeSchema('math_block', (ctx: Ctx) => ({
  content: 'text*',
  group: 'block',
  marks: '',
  defining: true,
  atom: true,
  isolating: true,
  attrs: {
    value: {
      default: '',
    },
  },
  parseDOM: [
    {
      tag: `div[data-type="${mathBlockId}"]`,
      preserveWhitespace: 'full',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return {}
        return { value: dom.dataset.value ?? '' }
      },
    },
  ],
  toDOM: (node) => {
    const code = node.attrs.value as string
    const dom = document.createElement('div')
    dom.dataset.type = mathBlockId
    dom.dataset.value = code
    dom.className = 'katex-block'
    try {
      katex.render(code, dom, ctx.get(katexOptionsCtx.key))
    } catch (err) {
      dom.textContent = code
      dom.classList.add('katex-error')
      console.error('[math] katex block render failed:', err, 'code=', code)
    }
    return dom
  },
  parseMarkdown: {
    match: ({ type }) => type === 'math',
    runner: (state, node, type) => {
      const value = node.value as string
      state.addNode(type, { value })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === mathBlockId,
    runner: (state, node) => {
      state.addNode('math', undefined, node.attrs.value as string)
    },
  },
}))

/// 输入规则：行首输入 `$$` 并回车后创建块级数学节点。
export const mathBlockInputRule = $inputRule(
  (ctx: Ctx) =>
    new InputRule(/^\$\$\s$/, (state, _match, start, end) => {
      const $start = state.doc.resolve(start)
      if (
        !$start
          .node(-1)
          .canReplaceWith(
            $start.index(-1),
            $start.indexAfter(-1),
            mathBlockSchema.type(ctx)
          )
      )
        return null
      return state.tr
        .delete(start, end)
        .setBlockType(start, start, mathBlockSchema.type(ctx))
    })
)

/// math 插件组：remark 解析 + katex 渲染 + 两个输入规则。
/// 注意：不要直接使用已废弃的 @milkdown/plugin-math（依赖版本与当前 utils 不匹配）。
export const math: MilkdownPlugin[] = [
  remarkMathPlugin,
  katexOptionsCtx,
  mathInlineSchema,
  mathBlockSchema,
  mathBlockInputRule,
  mathInlineInputRule,
].flat()