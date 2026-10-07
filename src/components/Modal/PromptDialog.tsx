import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../stores/useAppStore'

/**
 * 全局自绘弹窗（替换原生 window.prompt）：
 * - 多字段输入（如表格的「行数 + 列数」合并为一个弹窗）
 * - 打开时聚焦第一个字段并全选默认值
 * - Enter 提交 / Esc 取消 / 点击遮罩取消
 * - 字段级 validate 校验，错误消息红字显示并阻止提交
 * - 单字段时 Enter 即提交；多字段时第一个字段 Enter 跳到下一个字段
 */
const PromptDialog = () => {
  const promptDialog = useAppStore((s) => s.promptDialog)
  const closePrompt = useAppStore((s) => s.closePrompt)
  const containerRef = useRef<HTMLDivElement>(null)
  // 防重入：回车既触发原生 implicit submission，又触发 document 监听器的
  // requestSubmit()，不加保护会导致 onConfirm 被调用两次
  const submittingRef = useRef(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // 打开时：重置表单 + 聚焦第一个输入框并全选
  useEffect(() => {
    if (!promptDialog) return
    submittingRef.current = false
    const defaults: Record<string, string> = {}
    for (const f of promptDialog.fields) defaults[f.id] = f.defaultValue ?? ''
    setValues(defaults)
    setErrors({})

    // 等一帧确保 DOM 就绪后再聚焦
    const raf = requestAnimationFrame(() => {
      const first = containerRef.current?.querySelector<HTMLInputElement>('input')
      first?.focus()
      first?.select()
    })
    return () => cancelAnimationFrame(raf)
  }, [promptDialog])

  // 打开期间：Esc 关闭 / Enter 提交（取消时通知调用方，见 onCancel）
  useEffect(() => {
    if (!promptDialog) return
    const onKey = (e: KeyboardEvent) => {
      // 表单内已处理（回车跳下一个字段）的不再重复提交
      if (e.defaultPrevented) return
      if (e.key === 'Escape') {
        closePrompt()
        promptDialog.onCancel?.()
      } else if (e.key === 'Enter') {
        const form = containerRef.current?.querySelector<HTMLFormElement>('form')
        form?.requestSubmit()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [promptDialog, closePrompt])

  if (!promptDialog) return null

  const submit = () => {
    if (submittingRef.current) return
    const nextErrors: Record<string, string> = {}
    for (const f of promptDialog.fields) {
      const msg = f.validate?.(values[f.id] ?? '')
      if (msg) nextErrors[f.id] = msg
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      // 聚焦第一个出错的字段
      const firstBad = promptDialog.fields.find((f) => nextErrors[f.id])
      if (firstBad) {
        const el = containerRef.current?.querySelector<HTMLInputElement>(`[name="${firstBad.id}"]`)
        el?.focus()
        el?.select()
      }
      return
    }
    submittingRef.current = true
    closePrompt()
    promptDialog.onConfirm({ ...values })
  }

  return (
    <div className="mditor-dialog-mask" onMouseDown={() => { closePrompt(); promptDialog.onCancel?.() }}>
      <div
        ref={containerRef}
        className="mditor-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mditor-dialog-title">{promptDialog.title}</div>
        {promptDialog.message && <div className="mditor-dialog-message">{promptDialog.message}</div>}
        <form
          className="mditor-dialog-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          onKeyDown={(e) => {
            // 多字段：首个字段回车跳到下一个，避免直接提交漏填后续字段
            if (e.key === 'Enter' && promptDialog.fields.length > 1) {
              const target = e.target as HTMLInputElement
              const inputs = Array.from(
                containerRef.current?.querySelectorAll<HTMLInputElement>('input[name]') ?? [],
              )
              const idx = inputs.indexOf(target)
              if (idx >= 0 && idx < inputs.length - 1) {
                e.preventDefault()
                inputs[idx + 1]?.focus()
                inputs[idx + 1]?.select()
              }
            }
          }}
        >
          {promptDialog.fields.map((f, i) => (
            <div key={f.id} className="mditor-dialog-field">
              <label className="mditor-dialog-label">{f.label}</label>
              {f.browse ? (
                <div className="mditor-dialog-input-row">
                  <input
                    name={f.id}
                    className={errors[f.id] ? 'mditor-dialog-input error' : 'mditor-dialog-input'}
                    value={values[f.id] ?? ''}
                    placeholder={f.placeholder}
                    autoFocus={i === 0}
                    list={f.datalist ? `datalist-${f.id}` : undefined}
                    onChange={(e) => {
                      setValues((v) => ({ ...v, [f.id]: e.target.value }))
                      if (errors[f.id]) setErrors((err) => ({ ...err, [f.id]: '' }))
                    }}
                  />
                  <button
                    type="button"
                    className="mditor-dialog-btn"
                    onClick={async () => {
                      try {
                        const picked = await f.browse?.pick()
                        if (picked) {
                          setValues((v) => ({ ...v, [f.id]: picked }))
                          setErrors((err) => ({ ...err, [f.id]: '' }))
                        }
                      } catch {
                        // 用户取消或读取失败：保持原输入
                      }
                    }}
                  >
                    {f.browse.label ?? '浏览…'}
                  </button>
                </div>
              ) : (
                <input
                  name={f.id}
                  className={errors[f.id] ? 'mditor-dialog-input error' : 'mditor-dialog-input'}
                  value={values[f.id] ?? ''}
                  placeholder={f.placeholder}
                  autoFocus={i === 0}
                  list={f.datalist ? `datalist-${f.id}` : undefined}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [f.id]: e.target.value }))
                    if (errors[f.id]) setErrors((err) => ({ ...err, [f.id]: '' }))
                  }}
                />
              )}
              {f.datalist && (
                <datalist id={`datalist-${f.id}`}>
                  {f.datalist.map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              )}
              {errors[f.id] && <div className="mditor-dialog-error">{errors[f.id]}</div>}
            </div>
          ))}
          <div className="mditor-dialog-actions">
            <button type="button" className="mditor-dialog-btn" onClick={() => { closePrompt(); promptDialog.onCancel?.() }}>
              {promptDialog.cancelLabel ?? '取消'}
            </button>
            <button
              type="submit"
              className={
                promptDialog.danger ? 'mditor-dialog-btn primary danger' : 'mditor-dialog-btn primary'
              }
            >
              {promptDialog.confirmLabel ?? '确定'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PromptDialog