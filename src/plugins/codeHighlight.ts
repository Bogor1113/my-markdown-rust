/// 增量语法高亮插件。
///
/// 替换 `@milkdown/plugin-highlight`（内部是 prosemirror-highlight）：
/// 那个插件的 `state.apply` 每次文档变化都会
///   1. `doc.descendants` 全量收集所有代码块；
///   2. 对每个代码块做一次 `node.eq` 校验缓存；
///   3. 把**全部**代码块的高亮 decoration 重新 `DecorationSet.create` 一遍。
/// 实测 60 万字符 / 881 个代码块的文档里，单键就要 ~470ms，是输入卡顿的最大来源。
///
/// 这里复用同一套 lowlight 解析器（`highlightParser`），但只对**发生变化的顶层块**
/// 重新解析，其余 decoration 按 StepMap 平移复用（见 utils/incrementalDecorations.ts）。
/// 普通输入每键只解析一个代码块（若光标不在代码块里则完全不解析）。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node } from '@milkdown/kit/prose/model'
import { highlightParser } from '../config/lowlight'
import { updateDecorations } from '../utils/incrementalDecorations'

const key = new PluginKey('mditor-code-highlight')

/** 只解析 [from, to) 区间内的代码块，生成高亮 decoration */
const build = (doc: Node, from: number, to: number): Decoration[] => {
  const decos: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'code_block') return
    if (node.content.size === 0) return false
    const parsed = highlightParser({
      content: node.textContent,
      language: (node.attrs.language as string | null) || undefined,
      pos,
      size: node.nodeSize,
    })
    if (Array.isArray(parsed) && parsed.length) decos.push(...parsed)
    // 代码块内部是纯文本，不必继续下钻
    return false
  })
  return decos
}

export const codeHighlightPlugin = $prose(
  () =>
    new Plugin({
      key,
      state: {
        init: (_config, state) => ({
          doc: state.doc,
          set: DecorationSet.create(state.doc, build(state.doc, 0, state.doc.content.size)),
        }),
        apply: (tr, value) =>
          tr.docChanged
            ? { doc: tr.doc, set: updateDecorations(value.doc, tr.doc, value.set, build) }
            : value,
      },
      props: {
        decorations: (state) => key.getState(state)!.set,
      },
    }),
)
