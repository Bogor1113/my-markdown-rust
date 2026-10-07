import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'

/// 把以 `[!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]`
/// 开头的 blockquote 渲染成 GitHub 风格提醒块（仅加 class，不改写文档，
/// 因此磁盘上的 Markdown 仍是标准 GitHub alert 语法，可被 GitHub 原生渲染）。
const CALLOUT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i

export const calloutPlugin = $prose(() => {
  // doc 引用缓存：内容未变（纯光标移动/选区变化）时复用上一份 DecorationSet。
  // 之前每次事务（含按方向键）都全量遍历文档 + 重建 DecorationSet，大文档下卡顿。
  let lastDoc: PMNode | null = null
  let lastSet: DecorationSet = DecorationSet.empty

  const build = (state: { doc: PMNode }): DecorationSet => {
    if (state.doc === lastDoc) return lastSet

    const decos: Decoration[] = []
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'blockquote') {
        const first = node.firstChild
        if (first && first.isTextblock) {
          const m = CALLOUT_RE.exec(first.textContent)
          if (m) {
            const kind = m[1].toLowerCase()
            decos.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: `callout callout-${kind}`,
                'data-callout': kind,
              } as never),
            )
          }
        }
      }
    })
    lastDoc = state.doc
    lastSet = decos.length === 0 ? DecorationSet.empty : DecorationSet.create(state.doc, decos)
    return lastSet
  }

  return new Plugin({
    key: new PluginKey('callout'),
    props: {
      decorations(state) {
        return build(state)
      },
    },
  })
})
