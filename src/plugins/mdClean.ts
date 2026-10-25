/// Markdown 序列化 / 解析的干净化补丁。
///
/// 目前只有一件事：**不把空段落写成 `<br />`**。
///
/// 背景：Milkdown 的 commonmark preset 注册了 `remarkPreserveEmptyLinePlugin`，
/// 它把空段落序列化成一行 HTML `<br />`，再在解析时把 `<br />` 删掉，用这个
/// 办法让「两段之间按两次回车」产生的空段落在存盘、重开之后还在。
/// 代价是文件里凭空多出一堆 HTML 标签 —— 真机实测保存出来的内容是：
///
///     第二段落
///
///     <br />
///
///     空行之后
///
/// 其它工具（Git diff、Typora、静态站点生成器）打开都会看到这一行，
/// 与「Markdown 就是纯文本」的预期不符。
///
/// 现在的做法：
///   1. 关掉序列化侧的 `<br />`（从 preset 的插件列表里剔除该插件，见
///      MilkdownEditor 的 filter）：空段落就输出普通空行；
///   2. 保留解析侧的容错 —— 用下面这个 remark 插件把孤立的 `<br />` 节点删掉，
///      这样**已经写进磁盘的老文件**打开后不会冒出字面量 `<br />`，
///      仍然是干净的段落。

import { $remark } from '@milkdown/kit/utils'

/** 只由换行标签构成的行：序列化产物，不是用户真正的 HTML */
const BR_ONLY = new Set(['<br />', '<br>', '<br >', '<br/>', '<br />'.toUpperCase()])

interface MdNode {
  type?: string
  value?: unknown
  children?: unknown[]
}

/** 原地删掉「整行只有一个 <br>」的 html 节点（等价于上游的 visitEmptyLine） */
function pruneBreakLines(node: MdNode): void {
  const kids = node.children
  if (!Array.isArray(kids)) return
  for (let i = kids.length - 1; i >= 0; i--) {
    const child = kids[i] as MdNode | undefined
    if (!child || typeof child !== 'object') continue
    if (child.type === 'html' && BR_ONLY.has(String(child.value ?? '').trim())) {
      kids.splice(i, 1)
      continue
    }
    pruneBreakLines(child)
  }
}

export const dropEmptyLineBreakPlugin = $remark(
  'mditor-drop-empty-line-break',
  () => () => (tree: unknown) => {
    if (tree && typeof tree === 'object') pruneBreakLines(tree as MdNode)
  }
)
