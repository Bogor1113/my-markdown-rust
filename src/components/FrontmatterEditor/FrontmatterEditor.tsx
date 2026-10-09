/// YAML Front Matter GUI 编辑器
///
/// 解析文档开头的 YAML frontmatter，以表格形式展示 key-value 对，
/// 支持添加、删除、编辑条目。保存时将修改写回文档。

import { useState, useCallback, useEffect } from 'react'
import { editorViewCtx } from '@milkdown/kit/core'
import { useAppStore } from '../../stores/useAppStore'

interface Props {
  open: boolean
  onClose: () => void
}

/** 条目：可编辑的 key-value 对，或 GUI 不支持但必须原样保留的行（列表/注释/嵌套等） */
type FmEntry = { kind: 'pair'; key: string; value: string } | { kind: 'raw'; text: string }

/** 解析 frontmatter：`key: value` 逐行 → pair 条目；其余行 → raw 条目原样保留。
 *  之前无法识别的行会被静默丢弃，保存时永久丢失内容（如 tags 列表、注释）。 */
function parseFmEntries(text: string): FmEntry[] {
  const entries: FmEntry[] = []
  for (const line of text.split('\n')) {
    const match = /^\s*([-_\w]+)\s*:\s*(.*)\s*$/.exec(line)
    if (match) entries.push({ kind: 'pair', key: match[1], value: match[2] })
    else if (line.trim()) entries.push({ kind: 'raw', text: line })
    // 空行跳过：序列化时统一不留空行
  }
  return entries
}

/** 序列化：pair → `key: value`，raw → 原样输出（保序） */
function toFmYaml(entries: FmEntry[]): string {
  return entries
    .map((e) => (e.kind === 'pair' ? (e.key.trim() ? `${e.key}: ${e.value}` : null) : e.text))
    .filter((s): s is string => s !== null)
    .join('\n')
}

export default function FrontmatterEditor({ open, onClose }: Props) {
  const [entries, setEntries] = useState<FmEntry[]>([])
  const [yamlText, setYamlText] = useState('')
  const [editMode, setEditMode] = useState<'gui' | 'yaml'>('gui')
  const showToast = useAppStore((s) => s.showToast)

  // 从当前文档读取 frontmatter
  const loadFrontmatter = useCallback(() => {
    const { editor } = useAppStore.getState()
    if (!editor) {
      // 编辑器未挂载（源码模式标签等）：显式清空，避免展示上一份文档的旧数据
      setEntries([])
      setYamlText('')
      return
    }
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!view) {
        setEntries([])
        setYamlText('')
        return
      }
      let fmValue: string | null = null
      view.state.doc.descendants((node) => {
        if (node.type.name === 'frontmatter') {
          fmValue = (node.attrs.value as string) || ''
          return false
        }
      })
      const text = fmValue ?? ''
      setEntries(parseFmEntries(text))
      setYamlText(text)
    })
  }, [])

  useEffect(() => {
    if (open) loadFrontmatter()
  }, [open, loadFrontmatter])

  // 模式切换时双向同步，杜绝「GUI 改完切 YAML 用旧文本保存」的编辑丢失
  const switchMode = (mode: 'gui' | 'yaml') => {
    if (mode === editMode) return
    if (mode === 'yaml') {
      // GUI → YAML：把当前条目（含 GUI 里的编辑）序列化进文本框
      setYamlText(toFmYaml(entries))
    } else {
      // YAML → GUI：重新解析当前文本框内容
      setEntries(parseFmEntries(yamlText))
    }
    setEditMode(mode)
  }

  const handleSave = useCallback(() => {
    const { editor } = useAppStore.getState()
    if (!editor) {
      showToast('编辑器未就绪，无法保存 Front Matter')
      return
    }
    const newYaml = editMode === 'gui' ? toFmYaml(entries) : yamlText
    let found = false
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!view) return
      view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'frontmatter') {
          const tr = view.state.tr.setNodeMarkup(pos, undefined, { value: newYaml })
          view.dispatch(tr)
          found = true
          return false
        }
      })
    })
    // 文档没有 frontmatter 节点时明确告知，而不是静默关闭丢掉用户输入
    if (!found) {
      showToast('当前文档没有 Front Matter，未写入任何内容')
      return
    }
    onClose()
  }, [entries, yamlText, editMode, onClose, showToast])

  const handleAdd = () => {
    setEntries([...entries, { kind: 'pair', key: '', value: '' }])
  }

  const handleRemove = (idx: number) => {
    setEntries(entries.filter((_, i) => i !== idx))
  }

  const handleKeyChange = (idx: number, val: string) => {
    setEntries(entries.map((e, i) => (i === idx && e.kind === 'pair' ? { ...e, key: val } : e)))
  }

  const handleValueChange = (idx: number, val: string) => {
    setEntries(entries.map((e, i) => (i === idx && e.kind === 'pair' ? { ...e, value: val } : e)))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="flex w-[520px] max-h-[80vh] flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-toolbar)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">编辑 Front Matter</h3>
          <div className="flex items-center gap-2">
            <button
              className={`rounded px-2 py-1 text-xs transition-colors ${editMode === 'gui' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'}`}
              onClick={() => switchMode('gui')}
            >
              GUI
            </button>
            <button
              className={`rounded px-2 py-1 text-xs transition-colors ${editMode === 'yaml' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'}`}
              onClick={() => switchMode('yaml')}
            >
              YAML
            </button>
            <button
              className="ml-2 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {editMode === 'gui' ? (
            <div className="space-y-2">
              {entries.map((entry, idx) =>
                entry.kind === 'pair' ? (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-sidebar)] px-2 py-1.5 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
                      placeholder="key"
                      value={entry.key}
                      onChange={(e) => handleKeyChange(idx, e.target.value)}
                    />
                    <span className="text-[var(--color-text-secondary)]">:</span>
                    <input
                      className="flex-[2] rounded border border-[var(--color-border)] bg-[var(--color-bg-sidebar)] px-2 py-1.5 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
                      placeholder="value"
                      value={entry.value}
                      onChange={(e) => handleValueChange(idx, e.target.value)}
                    />
                    <button
                      className="text-[var(--color-text-secondary)] transition-colors hover:text-red-500"
                      onClick={() => handleRemove(idx)}
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  // GUI 不支持编辑的行（YAML 列表/注释/嵌套等）：只读展示，保存时原样保留。
                  // 要编辑它请切到 YAML 模式。
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded border border-dashed border-[var(--color-border)] px-2 py-1.5"
                    title="此行不是「key: value」格式，GUI 模式只读保留；切换到 YAML 模式可编辑"
                  >
                    <code className="flex-1 truncate font-mono text-[12px] text-[var(--color-text-secondary)]">
                      {entry.text}
                    </code>
                    <button
                      className="text-[var(--color-text-secondary)] transition-colors hover:text-red-500"
                      onClick={() => handleRemove(idx)}
                      title="删除此行"
                    >
                      ✕
                    </button>
                  </div>
                ),
              )}
              {entries.some((e) => e.kind === 'raw') && (
                <p className="text-[12px] text-[var(--color-text-secondary)]">
                  存在 {entries.filter((e) => e.kind === 'raw').length} 行非 key-value 格式内容，GUI
                  模式只读保留；切换到 YAML 模式可编辑。
                </p>
              )}
              <button
                className="mt-2 w-full rounded border border-dashed border-[var(--color-border)] py-1.5 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                onClick={handleAdd}
              >
                + 添加字段
              </button>
            </div>
          ) : (
            <textarea
              className="h-[300px] w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-bg-sidebar)] p-3 font-mono text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              value={yamlText}
              onChange={(e) => setYamlText(e.target.value)}
              placeholder="title: My Document&#10;date: 2026-01-01&#10;tags: markdown, editor"
            />
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <button
            className="rounded px-3 py-1.5 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)]"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-[13px] text-white transition-colors hover:opacity-90"
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
