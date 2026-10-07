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

/** 简单 YAML 解析：仅处理 `key: value` 逐行格式（不含嵌套/数组） */
function parseSimpleYaml(text: string): [string, string][] {
  const lines = text.split('\n')
  const pairs: [string, string][] = []
  for (const line of lines) {
    const match = /^\s*([-_\w]+)\s*:\s*(.*)\s*$/.exec(line)
    if (match) {
      pairs.push([match[1], match[2]])
    }
  }
  return pairs
}

/** 简单 YAML 序列化：逐行 `key: value` */
function toSimpleYaml(pairs: [string, string][]): string {
  return pairs
    .filter(([k]) => k.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
}

export default function FrontmatterEditor({ open, onClose }: Props) {
  const [pairs, setPairs] = useState<[string, string][]>([])
  const [yamlText, setYamlText] = useState('')
  const [editMode, setEditMode] = useState<'gui' | 'yaml'>('gui')

  // 从当前文档读取 frontmatter
  const loadFrontmatter = useCallback(() => {
    const { editor } = useAppStore.getState()
    if (!editor) return
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!view) return
      let fmValue = ''
      view.state.doc.descendants((node) => {
        if (node.type.name === 'frontmatter') {
          fmValue = (node.attrs.value as string) || ''
          return false
        }
      })
      setPairs(parseSimpleYaml(fmValue))
      setYamlText(fmValue)
    })
  }, [])

  useEffect(() => {
    if (open) loadFrontmatter()
  }, [open, loadFrontmatter])

  const handleSave = useCallback(() => {
    const { editor } = useAppStore.getState()
    if (!editor) return
    const newYaml = editMode === 'gui' ? toSimpleYaml(pairs) : yamlText
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!view) return
      view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'frontmatter') {
          const tr = view.state.tr.setNodeMarkup(pos, undefined, { value: newYaml })
          view.dispatch(tr)
          return false
        }
      })
    })
    onClose()
  }, [pairs, yamlText, editMode, onClose])

  const handleAdd = () => {
    setPairs([...pairs, ['', '']])
  }

  const handleRemove = (idx: number) => {
    setPairs(pairs.filter((_, i) => i !== idx))
  }

  const handleKeyChange = (idx: number, val: string) => {
    const next = [...pairs]
    next[idx] = [val, next[idx][1]]
    setPairs(next)
  }

  const handleValueChange = (idx: number, val: string) => {
    const next = [...pairs]
    next[idx] = [next[idx][0], val]
    setPairs(next)
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
              onClick={() => setEditMode('gui')}
            >
              GUI
            </button>
            <button
              className={`rounded px-2 py-1 text-xs transition-colors ${editMode === 'yaml' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'}`}
              onClick={() => setEditMode('yaml')}
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
              {pairs.map(([key, val], idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-sidebar)] px-2 py-1.5 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
                    placeholder="key"
                    value={key}
                    onChange={(e) => handleKeyChange(idx, e.target.value)}
                  />
                  <span className="text-[var(--color-text-secondary)]">:</span>
                  <input
                    className="flex-[2] rounded border border-[var(--color-border)] bg-[var(--color-bg-sidebar)] px-2 py-1.5 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
                    placeholder="value"
                    value={val}
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
              ))}
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
