import { useAppStore } from '../stores/useAppStore'
import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'

export const ValidationModal = () => {
  const open = useAppStore((s) => s.validationOpen)
  const items = useAppStore((s) => s.validationItems)
  const close = useAppStore((s) => s.closeValidation)
  if (!open) return null

  const jump = (pos: number) => {
    const ed = useAppStore.getState().editor
    ed?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!view || view.isDestroyed) return
      const p = Math.min(Math.max(pos, 0), view.state.doc.content.size)
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, p)).scrollIntoView(),
      )
      view.focus()
    })
    close()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      onMouseDown={close}
    >
      <div
        className="max-h-[70vh] w-[600px] max-w-[92vw] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
          <h3 className="text-base font-semibold">链接 / 图片路径校验</h3>
          <button
            onClick={close}
            className="rounded px-2 py-0.5 text-[var(--color-text-dim)] hover:bg-[var(--color-border)]/50"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto p-3">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-text-secondary)]">
              未发现失效的链接或图片路径 ✓
            </p>
          ) : (
            <ul className="space-y-1">
              {items.map((it, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => jump(it.pos)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--color-border)]/50"
                  >
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                        it.kind === 'link'
                          ? 'bg-[#4493f8]/20 text-[#4493f8]'
                          : 'bg-[#d29922]/20 text-[#d29922]'
                      }`}
                    >
                      {it.kind === 'link' ? '链接' : '图片'}
                    </span>
                    <code className="truncate text-[var(--color-text)]">{it.target}</code>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-dim)]">
          {items.length > 0 ? `${items.length} 个失效项 · 点击跳转到对应位置` : '所有本地相对路径均可正常解析'}
        </div>
      </div>
    </div>
  )
}
