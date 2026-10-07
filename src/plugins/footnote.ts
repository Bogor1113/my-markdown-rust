import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'

/// 脚注渲染装饰插件：
/// 1. 脚注引用 [^1] → 上标高亮样式
/// 2. 脚注定义 [^label]: → 带标签的定义块样式
///
/// GFM 预设已包含脚注解析（remark-gfm 内置 footnote），此插件仅负责视觉装饰。
const FOOTNOTE_DEF_RE = /^\[\^([^\]]+)\]:\s/

export const footnotePlugin = $prose(() => {
  // doc 引用缓存：内容未变（纯光标移动/选区变化）时直接复用上一份 DecorationSet。
  // 之前每次事务（含按方向键）都对整篇文档做两次 descendants 全量遍历 +
  // 重建 DecorationSet，大文档下是主要 CPU 热点之一。
  let lastDoc: PMNode | null = null
  let lastSet: DecorationSet = DecorationSet.empty

  const build = (state: { doc: PMNode }): DecorationSet => {
    if (state.doc === lastDoc) return lastSet

    const decos: Decoration[] = []

    state.doc.descendants((node, pos) => {
      // 脚注定义块：段落以 [^label]: 开头
      if (node.type.name === 'paragraph') {
        const text = node.textContent
        const defMatch = FOOTNOTE_DEF_RE.exec(text)
        if (defMatch) {
          const label = defMatch[1]
          decos.push(
            Decoration.node(pos, pos + node.nodeSize, {
              class: 'footnote-definition',
              'data-footnote-label': label,
            } as never),
          )
        }
      }
    })

    // 脚注引用：遍历行内文本节点查找 [^label]
    state.doc.descendants((node, pos) => {
      if (node.isText) {
        const text = node.text || ''
        const re = /\[\^([^\]]+)\]/g
        let match: RegExpExecArray | null
        while ((match = re.exec(text)) !== null) {
          const start = pos + match.index
          const end = start + match[0].length
          decos.push(
            Decoration.inline(start, end, {
              class: 'footnote-ref',
              'data-footnote-label': match[1],
            } as never),
          )
        }
      }
    })

    lastDoc = state.doc
    lastSet = decos.length === 0 ? DecorationSet.empty : DecorationSet.create(state.doc, decos)
    return lastSet
  }

  return new Plugin({
    key: new PluginKey('footnote-render'),
    props: {
      decorations(state) {
        return build(state)
      },
    },
  })
})
