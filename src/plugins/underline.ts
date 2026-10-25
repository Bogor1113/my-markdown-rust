/// 下划线（Ctrl+U）
///
/// Markdown 没有原生下划线语法，Typora 的做法是插入 HTML 的 `<u>…</u>`。
/// 这里用**行内 mark** 来实现，而不是直接塞一个 HTML 原子节点，原因是：
///   - mark 可以套在选区上，也可以在「无选区时先开启、再敲字」，跟加粗/斜体手感一致；
///   - mark 只影响样式，文字仍然是可编辑文本，敲错了直接改，不用在标签外面绕；
///   - 原子节点是不可编辑的，一旦包进去，想改里面的字只能整段删掉重打。
///
/// 序列化方向（doc → md）：自定义 markdown 节点类型 `underline`，配合
/// `services` 里注册的 remark-stringify handler 输出 `<u>文字</u>`。
/// 解析方向（md → doc）：remark 阶段把段落内形如 `<u>文字</u>` 的内联 HTML
/// 折回 `underline` 节点，于是「存盘再打开」仍然是可用 Ctrl+U 取消的 mark，
/// 而不是一块不可编辑的 HTML。
///
/// 只认裸标签 `<u>…</u>`：带属性的（`<u class="x">`）和内部含 `<>` 的保持原样，
/// 交给 htmlInlineSchema 当 HTML 原子处理——那类写法本来就不是下划线语义。

import type { Ctx } from '@milkdown/kit/ctx'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import type { MarkdownNode, Node as RemarkNode } from '@milkdown/kit/transformer'
import { $command, $markSchema, $remark } from '@milkdown/kit/utils'
import { toggleMark } from '@milkdown/kit/prose/commands'

/** 哪些父节点的子节点算「行内」——只有它们的 html 子节点可能是行内 `<u>` */
const INLINE_PARENTS = new Set(['paragraph', 'heading', 'tableCell', 'emphasis', 'strong', 'link', 'delete'])

/** `<u>文字</u>` → 文字；不是这种裸写法则返回 null */
function matchUnderlineHtml(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^<u>([^<>]+)<\/u>$/i.exec(value.trim())
  return m ? (m[1] as string) : null
}

const isOpenTag = (n: RemarkNode | undefined): boolean =>
  !!n && n.type === 'html' && String((n as { value?: unknown }).value ?? '').trim().toLowerCase() === '<u>'

const isCloseTag = (n: RemarkNode | undefined): boolean =>
  !!n && n.type === 'html' && String((n as { value?: unknown }).value ?? '').trim().toLowerCase() === '</u>'

/**
 * 把行内 `<u>文字</u>` 折成 underline 节点。
 *
 * CommonMark 把行内 HTML 按**单个标签**切分，`前<u>中</u>后` 解析出来是
 *   [text 前] [html <u>] [text 中] [html </u>] [text 后]
 * 而不是一个完整的 `<u>中</u>` 节点，所以这里按「开标签 → 找到配对闭标签」
 * 收拢中间节点。同一节点里整段是 `<u>中</u>` 的写法（个别 remark 版本会这样切）
 * 也一并兼容。
 */
function convertUnderline(tree: RemarkNode): void {
  const children = (tree as RemarkNode & { children?: RemarkNode[] }).children
  if (!Array.isArray(children)) return
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as RemarkNode | undefined
    if (!child) continue

    if (child.type === 'html' && INLINE_PARENTS.has(tree.type)) {
      // 情形一：单个节点就是完整的 <u>文字</u>
      const whole = matchUnderlineHtml((child as { value?: unknown }).value)
      if (whole !== null) {
        children[i] = {
          type: 'underline',
          children: whole ? [{ type: 'text', value: whole }] : [],
        } as unknown as RemarkNode
        continue
      }
      // 情形二：开标签单独成节点，向后找配对闭标签
      if (isOpenTag(child)) {
        let j = i + 1
        while (j < children.length && !isCloseTag(children[j])) j++
        if (j < children.length) {
          const inner = children.slice(i + 1, j) as RemarkNode[]
          children.splice(i, j - i + 1, {
            type: 'underline',
            children: inner,
          } as unknown as RemarkNode)
          // 中间内容可能还有嵌套标记，继续往下走
          convertUnderline(children[i] as RemarkNode)
          continue
        }
      }
    }
    convertUnderline(child)
  }
}

/// remark 阶段：段落内的 `<u>x</u>` 内联 HTML → underline 节点
export const underlineRemark = $remark('underlineRemark', () => () => (tree: RemarkNode) => {
  convertUnderline(tree)
})

/// 下划线 mark：DOM 上是 `<u>`，粘进来的 `<u>` 也能被识别
export const underlineSchema = $markSchema('underline', () => ({
  parseDOM: [
    { tag: 'u' },
    {
      style: 'text-decoration-line',
      getAttrs: (value: string) => (value === 'underline' ? {} : false),
    },
    {
      style: 'text-decoration',
      // 简写属性可能带颜色/线型，包含 underline 即认
      getAttrs: (value: string) => (/(^|\s)underline(\s|$)/.test(value) ? {} : false),
    },
  ],
  toDOM: () => ['u', 0],
  parseMarkdown: {
    match: (node) => node.type === 'underline',
    runner: (state, node, markType) => {
      state.openMark(markType)
      state.next(((node as { children?: unknown }).children ?? []) as MarkdownNode[])
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'underline',
    runner: (state, mark) => {
      // 交给 remark-stringify 的 `underline` handler 输出 <u>…</u>
      state.withMark(mark, 'underline')
    },
  },
}))

/// 切换下划线（Ctrl+U）
export const toggleUnderlineCommand = $command('ToggleUnderline', (ctx: Ctx) => () => {
  return toggleMark(underlineSchema.type(ctx))
})

/// 下划线插件组
export const underlinePlugin: MilkdownPlugin[] = [underlineRemark, underlineSchema, toggleUnderlineCommand].flat()
