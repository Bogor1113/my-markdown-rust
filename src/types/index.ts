export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  extension: string | null
}

export interface Tab {
  id: string
  path: string
  name: string
  content: string
  savedContent: string
  isDirty: boolean
  /** 源码模式：直接编辑原始 Markdown 文本（不加载 Milkdown 编辑器） */
  sourceMode?: boolean
}

export interface OutlineItem {
  /** 标题级别 1-6 */
  level: number
  /** 标题文本 */
  text: string
  /** 在 ProseMirror 文档中的位置，用于跳转 */
  pos: number
}

/** 右键菜单上下文类型 */
export type ContextMenuType =
  | 'text' // 普通文本
  | 'codeBlock' // 代码块
  | 'table' // 表格内
  | 'link' // 链接上
  | 'image' // 图片上

export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  type: ContextMenuType
  /** 点击位置对应的 ProseMirror 文档位置 */
  pos: number
  /** link 上下文：链接地址 */
  href?: string
  /** codeBlock 上下文：代码块位置 + 当前语言 */
  codeBlockPos?: number
  codeLang?: string
  /** image 上下文：图片地址 */
  imageSrc?: string
  imageAlt?: string
  /** 图片来自 HTML 块/行内（无对应 PM 节点）：「更新路径/删除」等节点级操作不可用 */
  imageFromHtml?: boolean
}

export interface LangPickerState {
  visible: boolean
  x: number
  y: number
  /** code_block 节点起始位置 */
  pos: number
  /** 当前语言 */
  language: string
}

/** 文件树右键菜单状态 */

/** 文件系统监听事件（Rust watcher 推送，见 src-tauri/src/commands/watcher.rs） */
export interface FsChangeEvent {
  /** rename-from / rename-to 为重命名的旧/新路径，可配对 */
  kind: 'create' | 'modify' | 'remove' | 'rename-from' | 'rename-to'
  paths: string[]
}

/** 跨文件搜索单条结果 */
export interface SearchResult {
  path: string
  name: string
  line: number
  content: string
  matchStart: number
  matchEnd: number
}

/** 搜索状态 */
export interface SearchState {
  visible: boolean
  query: string
  results: SearchResult[]
  searching: boolean
}

export interface TreeMenuState {
  x: number
  y: number
  /** 目标路径：节点为文件/目录路径，空白处为根目录 */
  path: string
  /** 目标名称 */
  name: string
  isDir: boolean
  /** 是否为根目录（不允许重命名/删除） */
  isRoot?: boolean
}

/** 自绘弹窗的单个输入字段 */
export interface PromptField {
  /** 字段唯一 id，同时也是提交时 values 的键 */
  id: string
  /** 字段标签 */
  label: string
  placeholder?: string
  defaultValue?: string
  /** 校验函数：返回错误消息则校验失败（阻止提交并显示错误）；返回 null 通过 */
  validate?: (value: string) => string | null
  /** 可选的历史选项列表，渲染为 <datalist> 下拉建议 */
  datalist?: string[]
  /** 输入框旁的浏览按钮：点击后由调用方返回新值并回填该字段 */
  browse?: {
    label?: string
    pick: () => Promise<string>
  }
}

/** 全局自绘弹窗状态（替换原生 window.prompt） */
export interface PromptDialogState {
  title: string
  message?: string
  fields: PromptField[]
  confirmLabel?: string
  cancelLabel?: string
  /** 危险操作（删除等）：确认按钮用红色强调 */
  danger?: boolean
  /** 用户点击确认：传入各字段值（values[id] = 输入值） */
  onConfirm: (values: Record<string, string>) => void
  /** 用户取消（点遮罩 / 按 Esc / 点取消按钮，未提交）：用于把异步确认的 Promise 置为已决 */
  onCancel?: () => void
}