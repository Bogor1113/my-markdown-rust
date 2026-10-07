import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Snippet {
  id: string
  name: string
  content: string
}

interface SnippetState {
  snippets: Snippet[]
  /** 片段库弹窗开关 */
  modalOpen: boolean
  openModal: () => void
  closeModal: () => void
  addSnippet: (name: string, content: string) => void
  updateSnippet: (id: string, patch: Partial<Snippet>) => void
  removeSnippet: (id: string) => void
}

/** 生成唯一 id；crypto.randomUUID 在非安全上下文（部分 Tauri 环境）可能为 undefined */
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const DEFAULT_SNIPPETS: Snippet[] = [
  { id: 'builtin-code', name: '代码块', content: '```ts\n\n```' },
  {
    id: 'builtin-api',
    name: 'API 说明模板',
    content:
      '## 接口说明\n\n**请求地址**：`\n\n**请求方法**：GET\n\n**参数**：\n\n| 参数 | 类型 | 说明 |\n| --- | --- | --- |\n|  |  |  |\n',
  },
  {
    id: 'builtin-todo',
    name: '任务清单',
    content: '- [ ] 待办一\n- [ ] 待办二\n- [x] 已完成\n',
  },
  {
    id: 'builtin-table',
    name: '表格',
    content: '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n',
  },
  {
    id: 'builtin-math-inline',
    name: '数学公式（行内）',
    content: '质能方程 $E = mc^2$ 是狭义相对论的核心。',
  },
  {
    id: 'builtin-math-block',
    name: '数学公式（块级）',
    content: '$$\n\\int_{0}^{1} x^2 \\, dx = \\frac{1}{3}\n$$\n',
  },
  {
    id: 'builtin-note',
    name: '提示引用',
    content: '> **提示**：这里是提示内容。\n',
  },
  {
    id: 'builtin-warning',
    name: '警告引用',
    content: '> ⚠️ **警告**：这里是需要注意的内容。\n',
  },
  {
    id: 'builtin-image',
    name: '图片',
    content: '![图片描述](image.png)\n',
  },
  {
    id: 'builtin-footnote',
    name: '脚注',
    content: '正文内容需要补充说明[^1]\n\n[^1]: 这里是脚注说明文字。\n',
  },
  {
    id: 'builtin-toc',
    name: '目录',
    content: '[TOC]\n',
  },
  {
    id: 'builtin-frontmatter',
    name: '文章头部',
    content: '---\ntitle: 文档标题\ndate: 2026-01-01\ntags: [标签1, 标签2]\n---\n\n',
  },
  {
    id: 'builtin-steps',
    name: '步骤列表',
    content: '1. 第一步：准备工作\n2. 第二步：执行操作\n3. 第三步：验证结果\n',
  },
  {
    id: 'builtin-diff',
    name: '代码对比（diff）',
    content: '```diff\n- 旧代码行\n+ 新代码行\n```\n',
  },
]

export const useSnippetStore = create<SnippetState>()(
  persist(
    (set) => ({
      snippets: DEFAULT_SNIPPETS,
      modalOpen: false,
      openModal: () => set({ modalOpen: true }),
      closeModal: () => set({ modalOpen: false }),
      addSnippet: (name, content) =>
        set((s) => ({
          snippets: [...s.snippets, { id: genId(), name, content }],
        })),
      updateSnippet: (id, patch) =>
        set((s) => ({
          snippets: s.snippets.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      removeSnippet: (id) =>
        set((s) => ({ snippets: s.snippets.filter((x) => x.id !== id) })),
    }),
    {
      name: 'mditor-snippets',
      // 仅持久化数据，不持久化弹窗状态
      partialize: (s) => ({ snippets: s.snippets }),
      // 合并时补齐新增的内置片段（按 id 判重），老用户也能看到新模板
      merge: (persisted, current) => {
        const p = (persisted as { snippets?: Snippet[] } | undefined)?.snippets ?? []
        const ids = new Set(p.map((x) => x.id))
        const merged = [...p]
        for (const d of DEFAULT_SNIPPETS) if (!ids.has(d.id)) merged.push(d)
        return { ...current, snippets: merged }
      },
    },
  ),
)
