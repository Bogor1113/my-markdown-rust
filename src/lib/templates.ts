/**
 * 内置模板：用于快速创建预设格式的 Markdown 文件
 */

/** 单个模板定义 */
export interface MdTemplate {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  label: string
  /** 文件内容 */
  content: string
}

/** 渲染模板内容：替换 {{date}}、{{time}} 等占位符 */
function renderTemplate(template: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  return template
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{time\}\}/g, time)
    .replace(/\{\{datetime\}\}/g, `${date} ${time}`)
}

/** 内置模板列表 */
export const builtinTemplates: MdTemplate[] = [
  {
    id: 'meeting',
    label: '会议记录',
    content: `# 会议记录

**日期**：{{date}}
**时间**：{{time}}
**参会人**：

---

## 议题

1.

## 讨论要点

-

## 待办事项

- [ ]

## 备注

`,
  },
  {
    id: 'todo',
    label: '待办清单',
    content: `# 待办清单

## 今日待办

- [ ]
- [ ]
- [ ]

## 进行中

- [ ]

## 已完成

- [x]
`,
  },
  {
    id: 'journal',
    label: '日记',
    content: `# {{date}} 日记

## 今日回顾

## 想法/感悟

## 明日计划

`,
  },
  {
    id: 'weekly',
    label: '周报',
    content: `# 周报 - {{date}}

## 本周完成

1.

## 下周计划

1.

## 需要协调/阻塞

-
`,
  },
  {
    id: 'blank',
    label: '空白文档',
    content: `# ${'新文档'}

`,
  },
]

/** 生成模板内容（含占位符替换） */
export function getTemplateContent(templateId: string): string | null {
  const tmpl = builtinTemplates.find((t) => t.id === templateId)
  if (!tmpl) return null
  return renderTemplate(tmpl.content)
}

/** 生成每日笔记的默认文件名：YYYY-MM-DD.md */
export function getDailyNoteFileName(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.md`
}

/** 获取每日笔记的默认内容 */
export function getDailyNoteContent(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `# ${date}

## 今日待办

- [ ]
- [ ]
- [ ]

## 笔记

## 想法

`
}