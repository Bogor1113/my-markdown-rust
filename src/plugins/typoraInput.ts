/// Typora 风格的 Markdown 输入规则（打字即成型）
///
/// 这里的规则**替换** preset-commonmark 自带的同名规则（在 MilkdownEditor 里按
/// 引用相等替换），原因逐条写在每个规则上方。共同目标：让「敲什么就得到什么」
/// 与 Typora 一致，并且**绝不把语法符号残留进文档**。
///
/// 复现要点（Typora 官方 Markdown Reference）：
/// · 标题：1~6 个 `#` 后跟空格（或直接回车）成立；`#######` 不是标题，保持纯文本。
/// · 引用：输入 `>` 即生成引用块（不强制空格），再输入 `>` 可嵌套。
/// · 代码块：``` 或 ~~~ 后跟回车（可带语言名）。
/// · 列表：`-` / `*` / `+` / `1.` 后跟空格。
/// · 任务列表：`- [ ]` / `- [x]`。
/// · 分割线：`---` / `***` / `___` 独立成行。
/// · 行内：`**粗**` `_斜_` `` `代码` `` `~~删除~~` `$公式$` `[文字](链接)` `![图](地址)`。

import type { Ctx } from '@milkdown/kit/ctx'
import { $inputRule, $prose } from '@milkdown/kit/utils'
import { editorViewCtx } from '@milkdown/kit/core'
import { textblockTypeInputRule, wrappingInputRule } from '@milkdown/kit/prose/inputrules'
import { markRule } from '@milkdown/kit/prose'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import {
  headingSchema,
  blockquoteSchema,
  codeBlockSchema,
  linkSchema,
  imageSchema,
  listItemSchema,
  paragraphSchema,
  sanitizeLinkHref,
} from '@milkdown/kit/preset/commonmark'
import { footnoteReferenceSchema, strikethroughSchema } from '@milkdown/kit/preset/gfm'
import { PAIR_SKIP_META } from './autoPair'

/**
 * 标题：`#` ~ `######` + 空格。
 *
 * 与上游的差别只有一处，但很重要：上游正则写的是 `#+`，不设上限，于是输入
 * `####### ` 会得到一个 level=7 的 heading。schema 里 level 没有 validate，
 * 这个非法节点能一路活到序列化，产出 `####### 标题` —— 再打开时 remark 把它
 * 解析回普通段落，来回一趟就丢了标题语义。这里限定 1~6，7 个及以上不匹配，
 * 原样留作纯文本（与 Typora 一致）。
 */
export const typoraHeadingInputRule = $inputRule((ctx: Ctx) =>
  textblockTypeInputRule(/^(?<hashes>#{1,6})\s$/, headingSchema.type(ctx), (match) => {
    const hashes = match.groups?.hashes?.length ?? 0
    const { $from } = ctx.get(editorViewCtx).state.selection
    // 在已有标题里继续打 `#`：升级而不是覆盖（`## x` 里再敲 `# ` → `### x`）
    if ($from.parent.type.name === 'heading') {
      return { level: Math.min(6, Number($from.parent.attrs.level) + hashes) }
    }
    return { level: hashes }
  })
)

/**
 * 引用：`>` 或 `> `。
 *
 * Typora 只需输入 `>` 就生成引用块，不要求空格；上游只认 `> `，
 * 于是「敲 > 再打文字」会始终停在普通段落里，与 Typora 的肌肉记忆不符。
 */
export const typoraBlockquoteInputRule = $inputRule((ctx: Ctx) =>
  wrappingInputRule(/^>\s?$/, blockquoteSchema.type(ctx))
)

/**
 * 代码围栏：``` 或 ~~~，可带语言名，后跟空格或回车。
 *
 * GFM 两种围栏都合法（Typora 也支持），上游只认反引号。语言名上游限制为
 * `[a-z]*`，会漏掉 `c++`、`c#`、`objective-c`、`vb.net` 这类真实存在的标识。
 */
export const typoraCodeFenceInputRule = $inputRule((ctx: Ctx) =>
  textblockTypeInputRule(
    /^(?:```|~~~)(?<language>[^\s`~]*)?[\s\n]$/,
    codeBlockSchema.type(ctx),
    (match) => ({ language: match.groups?.language ?? '' })
  )
)

/**
 * 删除线：`~~文字~~`（也接受单波浪线 `~文字~`）。
 *
 * 替换上游规则的原因在上游正则上：
 * `/(?<![\w:/])(~{1,2})(.+?)\1(?!\w|\/)$/` 对 `~~~` 也能匹配
 * （开符 `~`、内容 `~`、闭符 `~`），于是在空行里敲代码围栏 ``` ``` ``` 的第三种
 * 写法 `~~~` 时，第三个波浪线会立刻被吃掉变成「删除线套一个 ~」，
 * 围栏永远成型不了。加一条 `(?!~)` 断言：开符后面紧跟波浪线时不算删除线。
 */
export const typoraStrikethroughInputRule = $inputRule((ctx: Ctx) =>
  markRule(/(?<![\w:/])(~{1,2})(?!~)(.+?)\1(?![\w/~])$/, strikethroughSchema.type(ctx))
)

/**
 * 手写语法的收尾转换：`[文字](地址)` → 链接、`![替代文字](地址)` → 图片、
 * `[^标签]` → 脚注引用。
 *
 * 为什么不用 InputRule：这三条语法都以 `)` / `]` 结尾，而这两个字符正是
 * **自动配对的闭合符**。自动配对插件在 handleTextInput 里"越过"重复的闭合符时
 * 直接 dispatch 了一个只改选区的空事务，输入规则（同一轮 handleTextInput 链）
 * 根本没机会跑，于是 `[t](u)` 永远停在纯文本。
 *
 * 改成 appendTransaction：不管最后一个字符是谁消费的，只要事务落定后文档里
 * 出现了完整语法，就把它换成语义节点。代价是每次输入多跑一次「当前文本块尾部
 * 正则匹配」，实测在 600KB 文档里不可测量（只看光标所在块）。
 */
const mdAutoConvertKey = new PluginKey('md-auto-convert')

type Matcher = {
  re: RegExp
  build: (m: RegExpExecArray, ctx: Ctx, schema: unknown) => PMNode | null
}

const MATCHERS: Matcher[] = [
  // 图片必须排在链接前面：`![a](u)` 去掉 `!` 也能被链接规则匹配
  {
    re: /!\[([^[\]\n]*)]\(([^()\s]+)(?:\s+"([^"]*)")?\)$/,
    build: (m, ctx) =>
      m[2]
        ? imageSchema.type(ctx).create({ src: m[2], alt: m[1] ?? '', title: m[3] ?? '' })
        : null,
  },
  {
    re: /\[([^[\]\n]+)]\(([^()\s]+)\)$/,
    build: (m, ctx, schema) => {
      const href = sanitizeLinkHref(m[2] ?? '')
      if (!m[1] || !href) return null
      const s = schema as { text: (t: string, marks?: unknown[]) => PMNode }
      return s.text(m[1], [linkSchema.type(ctx).create({ href })])
    },
  },
  {
    re: /\[\^([^[\]\s]+)]$/,
    build: (m, ctx) =>
      m[1] ? footnoteReferenceSchema.type(ctx).create({ label: m[1] }) : null,
  },
]

export const mdAutoConvertPlugin = $prose((ctx: Ctx) =>
  new Plugin({
    key: mdAutoConvertKey,
    appendTransaction(trs, _oldState, newState) {
      // 两类事务都要看：
      // · docChanged —— 正常输入把 `)`/`]` 直接插进文档；
      // · PAIR_SKIP_META —— 自动配对「越过」重复闭合符，事务只改选区不改文档。
      //   这正是 `[文字](地址)` 敲下最后一个 `)` 时发生的事，漏掉它就永远不成型。
      const relevant = trs.some((tr) => tr.docChanged || tr.getMeta(PAIR_SKIP_META))
      if (!relevant) return null
      const { selection } = newState
      if (!selection.empty) return null
      const $head = selection.$from
      const parent = $head.parent
      // 代码块里手写的语法必须原样保留（那是代码，不是标记）
      if (!parent.isTextblock || parent.type.spec.code) return null

      const text = parent.textBetween(0, $head.parentOffset, undefined, '\ufffc')
      if (!text) return null
      const last = text[text.length - 1]
      if (last !== ')' && last !== ']') return null

      for (const matcher of MATCHERS) {
        const m = matcher.re.exec(text)
        if (!m) continue
        const node = matcher.build(m, ctx, newState.schema)
        if (!node) continue
        const from = $head.start() + (text.length - m[0].length)
        return newState.tr.replaceWith(from, $head.pos, node)
      }
      return null
    },
  })
)

/**
 * 列表项里继续敲 `- ` / `1. ` → 生成**嵌套子列表**。
 *
 * 上游的 `wrappingInputRule(/^([-+*])\s$/, bullet_list)` 在这种场景下必然失败，
 * 原因是 schema 约束：`list_item` 的 content 是 `paragraph block*`，**必须以
 * paragraph 开头**，所以「把当前这个空段落包成 bullet_list」找不出合法包裹
 * （findWrapping 返回 null）。规则静默失效，`- ` 于是被当成正文留在段落里：
 *
 *     渲染成  `• - 项二`        （圆点后面多一个减号）
 *     存盘成  `- \- 项二`       （mdast 为了不被误认成列表，给它加反斜杠转义）
 *
 * 真机实测就是这么写坏文件的。这里换成「删掉空项，挂到前一项下面」：
 *
 *     bullet_list[ li("项一"), li() ]   ←  光标在 li2
 *         ↓
 *     bullet_list[ li("项一" + bullet_list[ li() ]) ]
 *
 * 位置计算：li2 起点是 liPos，`liPos - 1` 正好是 li1 内部的末尾位置；
 * 先删 li2（在插入点之后，不影响 liPos），再往 li1 末尾插子列表。
 *
 * 为什么用 `handleTextInput` 而不是 `InputRule`：这条规则要在「上游规则确定
 * 失效」的前提下接管，而 InputRule 的 handler 拿到的是**输入前**的 state，
 * 试过一版在里面判断 schema 约束，规则根本没被执行（上游规则先匹配上了）。
 * 换成 props.handleTextInput 后由插件顺序保证先于 InputRule 执行，行为可控。
 */
export const typoraNestedList = $prose((ctx: Ctx) =>
  new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== ' ') return false
        if (from !== to) return false
        const { state } = view
        const $from = state.selection.$from

        // 本次空格还没落进文档，所以段落里应该正好是「列表标记」本身
        const line = $from.parent.textContent
        if ($from.parentOffset !== line.length) return false
        if (!/^(?:[-+*]|\d+[.)])$/.test(line)) return false

        const liType = listItemSchema.type(ctx)
        const paraType = paragraphSchema.type(ctx)
        let liDepth = -1
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type === liType) {
            liDepth = d
            break
          }
        }
        if (liDepth < 1) return false

        const li = $from.node(liDepth)
        // 只接管「干净的空列表项」：只有一个段落，且段落里就是那个列表标记。
        // 注意：此刻 state 里前一个字符（`-`）已经落进文档了（PM 的
        // handleTextInput 在 DOM 变化被观察到之后才回调），所以不能要求
        // content.size === 0 —— 那会让规则永远失效。
        if (li.childCount !== 1) return false
        const only = li.firstChild
        if (!only || only.type !== paraType || only.textContent !== line) return false

        // 第一项没有「前一项」可挂，退回上游行为（保持文本，不做破坏性改动）
        const index = $from.index(liDepth - 1)
        if (index === 0) return false

        const listType = $from.node(liDepth - 1).type
        const listNode = $from.node(liDepth - 1)
        const liPos = $from.before(liDepth)

        // 前一项的 spread 要关掉，否则序列化出来是：
        //     - 项一
        //                        ← 空行（listItem.spread 默认 true，join 时插一个空行）
        //       - 项二
        // 多了空行会让整个列表变成「松散列表」（每项被包成 <p>），
        // 渲染和别的工具打开都会变样。Milkdown 的 list_item 属性默认 spread=true，
        // 这里只把我们动过的这一项改成 false，不动其它项。
        const prevLiPos =
          $from.before(liDepth - 1) +
          1 +
          Array.from({ length: index - 1 }, (_, i) => listNode.child(i).nodeSize).reduce((a, b) => a + b, 0)
        const prevLi = listNode.child(index - 1)

        const tr = state.tr.setNodeMarkup(prevLiPos, undefined, { ...prevLi.attrs, spread: false })
        tr.delete(liPos, liPos + li.nodeSize)
        const insertAt = liPos - 1
        const nested = listType.create(null, [liType.create({ spread: false }, [paraType.create()])])
        tr.insert(insertAt, nested)
        // 光标进新项段落：bullet_list(+1) → list_item(+1) → paragraph(+1)
        tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 3)))
        view.dispatch(tr.scrollIntoView())
        return true
      },
    },
  })
)

/**
 * 引用块内空段落的行首空格直接吞掉。
 *
 * `>` 一敲就成引用块（Typora 行为，见上一条规则），如果用户接着敲空格
 * （`> 引用文字` 的肌肉记忆），那个空格会作为**正文的第一个字符**进了引用块。
 * 存盘时 mdast 为了保住行首空格，把它写成字符实体：
 *
 *     > &#x20;引用文字
 *
 * 别的 Markdown 工具打开看到的也是 `&#x20;`，属于明显的脏数据。
 * 行首空格在 Markdown 里本来就会被吞（或被转义），所以这里直接不吃它。
 */
export const blockquoteSpaceGuard = $prose(
  () =>
    new Plugin({
      props: {
        handleTextInput(view, from, to, text) {
          if (text !== ' ' || from !== to) return false
          const $from = view.state.selection.$from
          if ($from.parentOffset !== 0 || $from.parent.content.size !== 0) return false
          // 只在 blockquote 内生效，普通段落/列表项的行首空格照常输入
          for (let d = $from.depth - 1; d > 0; d--) {
            if ($from.node(d).type.name === 'blockquote') return true
          }
          return false
        },
      },
    })
)

export const typoraInputRules = [
  typoraHeadingInputRule,
  typoraBlockquoteInputRule,
  typoraCodeFenceInputRule,
  typoraStrikethroughInputRule,
  typoraNestedList,
  blockquoteSpaceGuard,
  mdAutoConvertPlugin,
].flat()
