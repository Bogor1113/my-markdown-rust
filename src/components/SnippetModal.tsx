import { useState } from 'react'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { useAppStore } from '../stores/useAppStore'
import { useSnippetStore } from '../stores/snippets'

const SnippetModal = () => {
  const modalOpen = useSnippetStore((s) => s.modalOpen)
  const closeModal = useSnippetStore((s) => s.closeModal)
  const snippets = useSnippetStore((s) => s.snippets)
  const addSnippet = useSnippetStore((s) => s.addSnippet)
  const updateSnippet = useSnippetStore((s) => s.updateSnippet)
  const removeSnippet = useSnippetStore((s) => s.removeSnippet)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editContent, setEditContent] = useState('')
  const [showNew, setShowNew] = useState(false)

  if (!modalOpen) return null

  const startEdit = (id: string, name: string, content: string) => {
    setEditingId(id)
    setEditName(name)
    setEditContent(content)
  }
  const commitEdit = () => {
    if (!editName.trim()) return
    if (editingId) updateSnippet(editingId, { name: editName, content: editContent })
    else addSnippet(editName, editContent)
    setEditingId(null)
    setEditName('')
    setEditContent('')
    setShowNew(false)
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditContent('')
    setShowNew(false)
  }

  const insert = (content: string) => {
    const { editor } = useAppStore.getState()
    if (!editor) return
    if (!content.trim()) {
      useAppStore.getState().showToast('片段内容为空，无法插入')
      return
    }
    try {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        if (!view || view.isDestroyed) return
        const parser = ctx.get(parserCtx)
        const doc = parser(content)
        const slice = doc.slice(0)
        view.dispatch(view.state.tr.replaceSelection(slice))
      })
      closeModal()
    } catch (e) {
      useAppStore.getState().showToast(`插入片段失败：${e}`)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={closeModal}
    >
      <div
        className="flex max-h-[80vh] w-[520px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-toolbar)] shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="text-[14px] font-medium text-[var(--color-text)]">片段库</span>
          <button
            className="rounded px-2 py-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/50"
            onClick={closeModal}
            title="关闭"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {snippets.map((s) => (
            <div
              key={s.id}
              className="mb-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
            >
              {editingId === s.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    className="rounded border border-[var(--color-border)] bg-[var(--color-bg-toolbar)] px-2 py-1 text-[13px] text-[var(--color-text)]"
                    value={editName}
                    placeholder="名称"
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <textarea
                    className="h-32 rounded border border-[var(--color-border)] bg-[var(--color-bg-toolbar)] px-2 py-1 font-mono text-[12px] text-[var(--color-text)]"
                    value={editContent}
                    placeholder="Markdown 内容"
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      className="rounded px-2 py-1 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/50"
                      onClick={cancelEdit}
                    >
                      取消
                    </button>
                    <button
                      className="rounded bg-[#3b82f6] px-2 py-1 text-[12px] text-white"
                      onClick={commitEdit}
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] text-[var(--color-text)]" title={s.content}>
                    {s.name}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="rounded bg-[#3b82f6] px-2 py-1 text-[12px] text-white hover:opacity-90"
                      onClick={() => insert(s.content)}
                    >
                      插入
                    </button>
                    <button
                      className="rounded px-2 py-1 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/50"
                      onClick={() => startEdit(s.id, s.name, s.content)}
                    >
                      编辑
                    </button>
                    <button
                      className="rounded px-2 py-1 text-[12px] text-[#e03131] hover:bg-[var(--color-border)]/50"
                      onClick={() => removeSnippet(s.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {showNew && (
            <div className="mb-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
              <div className="flex flex-col gap-2">
                <input
                  className="rounded border border-[var(--color-border)] bg-[var(--color-bg-toolbar)] px-2 py-1 text-[13px] text-[var(--color-text)]"
                  value={editName}
                  placeholder="新片段名称"
                  onChange={(e) => setEditName(e.target.value)}
                />
                <textarea
                  className="h-32 rounded border border-[var(--color-border)] bg-[var(--color-bg-toolbar)] px-2 py-1 font-mono text-[12px] text-[var(--color-text)]"
                  value={editContent}
                  placeholder="Markdown 内容"
                  onChange={(e) => setEditContent(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    className="rounded px-2 py-1 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/50"
                    onClick={cancelEdit}
                  >
                    取消
                  </button>
                  <button
                    className="rounded bg-[#3b82f6] px-2 py-1 text-[12px] text-white"
                    onClick={commitEdit}
                  >
                    添加
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] px-4 py-3 text-right">
          <button
            className="rounded bg-[var(--color-border)] px-3 py-1.5 text-[13px] text-[var(--color-text)] hover:opacity-80"
            onClick={() => {
              setShowNew(true)
              setEditingId(null)
              setEditName('')
              setEditContent('')
            }}
          >
            + 新建片段
          </button>
        </div>
      </div>
    </div>
  )
}

export default SnippetModal
