import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { updateDecorations } from '../utils/incrementalDecorations'

/// 脚注渲染装饰插件：
/// 1. 脚注引用 [^1] → 上标高亮样式
/// 2. 脚注定义 [^label]: → 带标签的定义块样式
///
/// GFM 预设已包含脚注解析（remark-gfm 内置 footnote），此插件仅负责视觉装饰。
///
/// 性能：改为增量 decoration（见 utils/incrementalDecorations.ts）。旧实现每次
/// 文档变化都做两次全量 descendants（其中一次逐文本节点跑正则），大文档下约
/// 8ms/键，是输入卡顿的来源之一。
const FOOTNOTE_DEF_RE = /^\[\^([^\]]+)\]:\s/
const FOOTNOTE_REF_RE = /\[\^([^\]]+)\]/g

const key = new PluginKey('footnote-render')

function buildRange(doc: PMNode, from: number, to: number): Decoration[] {
  const decos: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    // 脚注定义块：段落以 [^label]: 开头
    if (node.type.name === 'paragraph') {
      const defMatch = FOOTNOTE_DEF_RE.exec(node.textContent)
      if (defMatch) {
        decos.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: 'footnote-definition',
            'data-footnote-label': defMatch[1],
          } as never),
        )
      }
      return
    }
    // 代码块是示例文本不是脚注引用，整棵子树跳过
    if (node.type.name === 'code_block') return false
    if (node.isText) {
      // 行内代码（code mark）里的 [^x] 同样只是示例
      if (node.marks.some((m) => m.type.name === 'code')) return
      const text = node.text || ''
      FOOTNOTE_REF_RE.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = FOOTNOTE_REF_RE.exec(text)) !== null) {
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
  return decos
}

export const footnotePlugin = $prose(() =>
  new Plugin({
    key,
    state: {
      init: (_config, state) => ({
        doc: state.doc,
        set: DecorationSet.create(state.doc, buildRange(state.doc, 0, state.doc.content.size)),
      }),
      apply: (tr, value) =>
        tr.docChanged
          ? { doc: tr.doc, set: updateDecorations(value.doc, tr.doc, value.set, buildRange) }
          : value,
    },
    props: {
      decorations: (state) => key.getState(state)!.set,
    },
  }),
)
