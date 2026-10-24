import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { updateDecorations } from '../utils/incrementalDecorations'

/// 把以 `[!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]`
/// 开头的 blockquote 渲染成 GitHub 风格提醒块（仅加 class，不改写文档，
/// 因此磁盘上的 Markdown 仍是标准 GitHub alert 语法，可被 GitHub 原生渲染）。
const CALLOUT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i

const key = new PluginKey('callout')

function buildRange(doc: PMNode, from: number, to: number): Decoration[] {
  const decos: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'blockquote') return
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
  })
  return decos
}

export const calloutPlugin = $prose(() =>
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
