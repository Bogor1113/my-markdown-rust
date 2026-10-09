/// 中文排版优化：对全文（跳过代码块 / 行内代码）做轻量规范化。
///
/// 规则：
/// 1. CJK 与半角字母/数字之间补空格（盘古风格）；
/// 2. 中文语境下的半角标点（, ; : ! ? 以及中文后紧跟的 .）统一为全角；
/// 3. 清理 CJK 与全角标点之间被误加的空格。
///
/// 不改动代码内容，避免破坏语法 / 标识符。

import { editorViewCtx } from '@milkdown/kit/core'
import type { Editor } from '@milkdown/kit/core'
import type { Mark } from '@milkdown/kit/prose/model'

const CJK = '[一-鿿　-〿＀-￯]'
const LATIN = '[0-9A-Za-z]'

function normalizePunctuation(text: string): string {
  let out = text
  // 中文后的半角标点 → 全角
  out = out.replace(new RegExp(`(${CJK})\\s*,\\s*`, 'g'), '$1，')
  out = out.replace(new RegExp(`(${CJK})\\s*;\\s*`, 'g'), '$1；')
  out = out.replace(new RegExp(`(${CJK})\\s*:\\s*`, 'g'), '$1：')
  out = out.replace(new RegExp(`(${CJK})\\s*!\\s*`, 'g'), '$1！')
  out = out.replace(new RegExp(`(${CJK})\\s*\\?\\s*`, 'g'), '$1？')
  // 句号仅当两个中文字符之间（避免误伤 版本号/文件名/小数）
  out = out.replace(new RegExp(`(${CJK})\\s*\\.\\s*(?=${CJK})`, 'g'), '$1。')
  // 清理 CJK 与全角标点之间被补出的多余空格
  out = out.replace(new RegExp(`(${CJK})\\s+([，。！？；：、])`, 'g'), '$1$2')
  out = out.replace(new RegExp(`([，。！？；：、])\\s+(${CJK})`, 'g'), '$1$2')
  return out
}

function typographyText(text: string): string {
  let out = text
  // CJK 后紧跟半角字母/数字 → 补空格
  out = out.replace(new RegExp(`(${CJK})(${LATIN})`, 'g'), '$1 $2')
  // 半角字母/数字后紧跟 CJK → 补空格
  out = out.replace(new RegExp(`(${LATIN})(${CJK})`, 'g'), '$1 $2')
  out = normalizePunctuation(out)
  return out
}

/**
 * 执行中文排版优化（作用于当前文档，跳过代码）。
 * @returns 是否发生了修改
 */
export function optimizeTypography(editor: Editor | null): boolean {
  if (!editor) return false
  let changed = false
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (!view || view.isDestroyed) return
    const { doc } = view.state
    const changes: { from: number; to: number; text: string; marks: readonly Mark[] }[] = []
    // 这些节点的文本是「源码」而非正文：排版改写会破坏 YAML 结构、LaTeX 公式
    // 与 HTML 属性（如 font-family:"微软雅黑",sans-serif 里的逗号被换全角）。
    const SOURCE_NODES = new Set(['code_block', 'frontmatter', 'math_inline', 'math_block', 'htmlBlock', 'html'])
    doc.descendants((node, pos) => {
      if (SOURCE_NODES.has(node.type.name)) return false // 跳过整棵子树
      if (!node.isText) return true
      if (node.marks.some((m) => m.type.name === 'code')) return true // 跳过行内代码
      if (!node.text) return true
      const t = typographyText(node.text)
      if (t !== node.text) {
        changes.push({ from: pos, to: pos + node.text.length, text: t, marks: node.marks })
        changed = true
      }
      return true
    })
    if (changes.length === 0) return
    // 从后往前替换，保证位置有效。
    // 用 replaceWith + 原节点的 marks：insertText(from≠to) 的 marks 取自替换区间
    // 边界位置的 marks 交集，会把加粗/斜体/链接等格式剥掉。
    let tr = view.state.tr
    for (let i = changes.length - 1; i >= 0; i--) {
      const c = changes[i]
      tr = tr.replaceWith(c.from, c.to, view.state.schema.text(c.text, c.marks))
    }
    view.dispatch(tr)
  })
  return changed
}
