import { useEffect, useRef } from 'react'

interface Props {
  /** 标签 id：变化（切换标签）时重挂载并加载对应内容 */
  docKey: string
  /** 初始内容（uncontrolled，仅在挂载时读取） */
  content: string
  /** 外部重载计数（文件被外部修改后从磁盘重载）：变化时重挂载刷新内容 */
  reloadTick?: number
  onChange: (md: string) => void
}

/**
 * 源码模式编辑器：直接编辑原始 Markdown 文本。
 *
 * 为什么用原生 textarea 而不是 CodeMirror：
 * 1. 零新依赖 —— 不增加安装体积与启动/懒加载分块；
 * 2. 10MB 级大文件（本组件的另一个使命是大文件兜底打开）在 textarea 下
 *    由浏览器原生处理，内存与解析成本远低于任何语法高亮编辑器；
 * 3. 源码模式的定位是「看/改原始文本」，语法高亮不是刚需。
 *
 * uncontrolled（defaultValue + onChange）：每次击键不触发 React 对
 * value 的受控回写（大文档受控 textarea 每键全量 diff 很慢）；
 * store 内容仍逐键同步，标脏 / 统计 / 自动保存与 WYSIWYG 模式同一条链路。
 * 内容被外部替换（切换标签 / 磁盘重载）时通过 key 重挂载刷新。
 */
const SourceEditor = ({ docKey, content, reloadTick, onChange }: Props) => {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const areaRef = useRef<HTMLTextAreaElement>(null)
  /** 已聚焦过的 docKey：仅首次挂载（切标签）时抢焦点；外部重载（reloadTick
   *  变化）导致的重挂载不抢焦点，避免用户正在别处操作时被突然拽回编辑器 */
  const focusedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (focusedKeyRef.current !== docKey) {
      focusedKeyRef.current = docKey
      areaRef.current?.focus()
    }
  }, [docKey, reloadTick])

  // Tab 键插入两个空格（源码编辑下直接落缩进，不跳出焦点）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = e.currentTarget
    const { selectionStart: s, selectionEnd: t, value } = el
    const next = value.slice(0, s) + '  ' + value.slice(t)
    onChangeRef.current(next)
    // 同步光标到插入文本之后；setRangeText 不触发 React onChange，须手动回写
    el.value = next
    el.setSelectionRange(s + 2, s + 2)
  }

  return (
    <textarea
      ref={areaRef}
      key={`${docKey}:${reloadTick ?? 0}`}
      className="mditor-source-editor"
      defaultValue={content}
      onChange={(e) => onChangeRef.current(e.target.value)}
      onKeyDown={handleKeyDown}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      aria-label="Markdown 源码编辑"
    />
  )
}

export default SourceEditor
