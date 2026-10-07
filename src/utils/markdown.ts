/**
 * 清洗代码块内多余的尾部空行。
 *
 * 背景：markdown 解析→序列化往返会往围栏代码块的内容末尾反复追加空行，
 * 每次自动保存/重开都会再长，导致代码块底部出现一排"空行+幽灵行号"且光标选不中。
 * 这里把每个围栏代码块内容末尾的连续空行去掉（保留行结束符），
 * 使"打开→编辑→保存→再打开"成为不增量的稳定往返。
 *
 * 性能：本函数在 markdownUpdated（每次按键）里被调用，必须保持轻。
 * 先用两次原生 indexOf 找围栏标记——没有代码块的文档（大多数笔记）直接返回原文，
 * 比 split+逐行正则快两个数量级；正则也全部提为模块级常量，避免每次编译。
 */
const FENCE_RE = /^(`{3,}|~{3,})[ \t]*(.*)$/

/**
 * 预检查：是否存在「空行 + 无信息串的围栏行」这样的可能待清理片段。
 *
 * 绝大多数按键都不会改变「代码块末尾空行」这一状态，因此先用一次原生正则
 * 扫一遍即可判否，避免为了几个字符去做全文 split + join。
 *
 * 允许误判为「需要」——那只会多跑一次完整清洗，结果与原来完全一致（幂等），
 * 不会漏判（漏判才有 bug）。带语言标记的围栏（```sql 等）不会被这条命中，
 * 而它们只能是开围栏，本就无需清洗，因此这类课件能直接走快速返回。
 *
 * 字符类里带上 \r：CRLF 文档的空行是 "\r\n"，若只用 [ \t] 会漏判，
 * 导致本来该清洗的尾部空行被跳过（功能回归）。
 */
const MAY_NEED_TRIM_RE = /\n[\r \t]*\n[\r \t]*(?:`{3,}|~{3,})[\r \t]*(?:\n|$)/

export function sanitizeCodeBlockTrailingNewlines(md: string): string {
  // 快速路径 1：文档里连围栏标记都没有 → 无代码块，原样返回（零分配）
  if (md.indexOf('```') === -1 && md.indexOf('~~~') === -1) return md
  // 快速路径 2：没有「空行 + 裸围栏」组合 → 不可能存在待清理的尾部空行
  if (!MAY_NEED_TRIM_RE.test(md)) return md

  const lines = md.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fence = FENCE_RE.exec(line)
    if (fence) {
      const ch = fence[1][0]
      const mark = ch === '`' ? /^`{3,}/ : /^~{3,}/
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && !mark.test(lines[j])) {
        body.push(lines[j])
        j++
      }
      // 去掉块内末尾的连续空行（保留行结束符），阻断序列化往返的增量增长
      while (body.length && body[body.length - 1].trim() === '') body.pop()
      out.push(line, ...body)
      if (j < lines.length) out.push(lines[j]) // 闭合围栏行
      i = j + 1
      continue
    }
    out.push(line)
    i++
  }
  return out.join('\n')
}