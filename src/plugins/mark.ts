import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx'
import { $inputRule, $markSchema, $remark } from '@milkdown/kit/utils'
import { markRule } from '@milkdown/kit/prose'
import { remarkStringifyOptionsCtx } from '@milkdown/kit/core'
import type { Handle } from 'mdast-util-to-markdown'
import type { Mark, Node, Parent, Root, Text } from 'mdast'

/// 在 mdast 类型系统中注册 `mark` 节点。
/// markdown 来源 `==高亮==` 经 remark 转换后变成 `<mark>高亮</mark>`，
/// 序列化时再通过 mdast-util-to-markdown 的 handler 还原成 `==高亮==`。
declare module 'mdast' {
  interface Mark extends Parent {
    type: 'mark'
    children: PhrasingContent[]
  }

  interface PhrasingContentMap {
    mark: Mark
  }

  interface RootContentMap {
    mark: Mark
  }
}

/// 向 mdast-util-to-markdown 注册 `mark` 构造名，
/// 让 `state.enter('mark')` 与 `handlers.mark` 通过类型检查。
declare module 'mdast-util-to-markdown' {
  interface ConstructNameMap {
    mark: 'mark'
  }
}

const marker = '=='

/// 把一段纯文本按照 `==高亮==` 切分成 text / mark 交替的节点序列。
/// 只有 `==` 成对出现时才转换，避免破坏用户文本中不成对的 `==`。
function splitTextNode(node: Text): Array<Text | Mark> {
  const { value } = node
  const count = value.split(marker).length - 1
  if (count === 0 || count % 2 !== 0) return [node]

  const nodes: Array<Text | Mark> = []
  const parts = value.split(marker)
  parts.forEach((part, index) => {
    if (!part) return
    if (index % 2 === 1) {
      nodes.push({ type: 'mark', children: [{ type: 'text', value: part }] })
    } else {
      nodes.push({ type: 'text', value: part })
    }
  })
  return nodes
}

/// 深度遍历 mdast 树，把 `==...==` 文本拆成 mark 节点。
/// 只处理带 `children` 的父节点；`code`/`inlineCode` 只有 `value`，
/// 天然不会被误拆。
function walk(node: Node): Node[] {
  if (node.type === 'text') {
    return splitTextNode(node as Text)
  }
  if ('children' in node) {
    const parent = node as Parent
    parent.children = parent.children.flatMap(walk) as Parent['children']
  }
  return [node]
}

/// 转换器工厂：`unified().use(remarkMark)` 时被调用，返回 (tree) => tree。
function remarkHighlight(): (tree: Root) => Root {
  return (tree) => {
    tree.children = tree.children.flatMap(walk) as Root['children']
    return tree
  }
}

/// 包装自定义 remark 插件，让解析器认识 `==...==`。
export const remarkMarkPlugin = $remark<'remarkMark', undefined>(
  'remarkMark',
  () => remarkHighlight
)

/// `==高亮==` 的序列化 handler（仿照 mdast-util-to-markdown 的 strong）。
const markHandler: Handle = (node, _parent, state, info) => {
  const tracker = state.createTracker(info)
  const exit = state.enter('mark')
  let value = tracker.move(marker)
  value += state.containerPhrasing(node, {
    before: value,
    after: marker,
    ...tracker.current(),
  })
  value += tracker.move(marker)
  exit()
  return value
}

/// 在配置阶段把 mark handler 注入 remark-stringify 选项。
export function markConfig(ctx: Ctx): void {
  ctx.update(remarkStringifyOptionsCtx, (prev) => ({
    ...prev,
    handlers: {
      ...prev.handlers,
      mark: markHandler,
    },
  }))
}

/// `==` 的 prosemirror mark schema：对应 `<mark>` 元素。
export const highlightSchema = $markSchema('highlight', () => ({
  toDOM: () => ['mark', 0],
  parseDOM: [{ tag: 'mark' }],
  parseMarkdown: {
    match: (node) => node.type === 'mark',
    runner: (state, node, markType) => {
      state.openMark(markType)
      state.next(node.children)
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'highlight',
    runner: (state, mark) => {
      state.withMark(mark, 'mark')
    },
  },
}))

/// 输入规则：输入 `==内容==` 后自动转成 highlight mark。
export const highlightInputRule = $inputRule((ctx: Ctx) =>
  markRule(/==([^=]+)==$/, highlightSchema.type(ctx))
)

/// mark 插件组：remark 解析 + highlight mark + 输入规则。
export const highlight: MilkdownPlugin[] = [
  remarkMarkPlugin,
  highlightSchema,
  highlightInputRule,
].flat()