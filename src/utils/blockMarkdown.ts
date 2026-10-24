/// 按顶层块增量序列化 Markdown。
///
/// 背景：Milkdown 的 `markdownUpdated` 监听每次（200ms 防抖后）都对整篇文档跑
/// remark-stringify。实测 60 万字符 / 8812 个顶层块的文档一次要 **1.2 秒**，且
/// 成本随文档线性增长——用户每停顿一次就冻结一次，大文件里根本无法输入。
///
/// 关键事实（已用真实文档实测验证）：
///   - 逐顶层块单独序列化、再用 `'\n'` 拼接，结果与整篇序列化**逐字节相同**；
///   - 序列化单个块只要 ~0.1ms，且 ProseMirror 对未改动的块复用同一个 Node 对象。
///
/// 所以这里缓存每个块的序列化结果：一次编辑只重序列化变化的块，其余复用，
/// 最后 join。整篇 60 万字符文档的 join 约 2.4ms，单键总成本从 1.2s 降到 ~3ms。

import type { Node } from '@milkdown/kit/prose/model'

/** 把单个顶层块序列化成 Markdown（含块末尾换行） */
export type SerializeBlock = (node: Node) => string

export class BlockMarkdownCache {
  private nodes: Node[] = []
  private texts: (string | undefined)[] = []
  private doc: Node | null = null
  /** 是否所有块都已序列化完成 */
  ready = false

  constructor(private readonly serialize: SerializeBlock) {}

  /**
   * 让缓存与 `doc` 对齐。
   *
   * @param budgetMs 本次最多花多少毫秒做序列化（用于加载后的空闲预热，
   *                 避免一次性冻结主线程）。传 Infinity 表示必须完成。
   * @returns 是否已全部就绪
   */
  sync(doc: Node, budgetMs = Infinity): boolean {
    if (this.doc === doc && this.ready) return true

    const n = doc.childCount
    const nodes: Node[] = new Array(n)
    const texts: (string | undefined)[] = new Array(n)
    const start = performance.now()
    let pending = false

    for (let i = 0; i < n; i++) {
      const child = doc.child(i)
      nodes[i] = child
      if (this.nodes[i] === child && this.texts[i] !== undefined) {
        // 结构共享：这个块没变，直接复用上次的序列化结果
        texts[i] = this.texts[i]
        continue
      }
      if (pending || performance.now() - start >= budgetMs) {
        pending = true
        continue
      }
      texts[i] = this.serialize(child)
    }

    this.doc = doc
    this.nodes = nodes
    this.texts = texts
    this.ready = !pending
    return this.ready
  }

  /** 全部就绪时返回完整 Markdown；未就绪返回 null */
  get markdown(): string | null {
    if (!this.ready) return null
    return (this.texts as string[]).join('\n')
  }
}
