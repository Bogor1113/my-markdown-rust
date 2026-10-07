import { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../../stores/settings'
import { useShortcutsStore, SHORTCUT_LIST } from '../../stores/shortcuts'

/* ── 快捷键录入按钮 ── */

function formatKey(key: string) {
  return key
    .replace('Ctrl', navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')
    .replace('Shift', '⇧')
    .replace('Alt', navigator.platform.includes('Mac') ? '⌥' : 'Alt')
    .replace('Meta', '⌘')
}

function KeyCaptureButton({ currentKey, onCapture }: { currentKey: string; onCapture: (key: string) => void }) {
  const [capturing, setCapturing] = useState(false)
  const onCaptureRef = useRef(onCapture)
  onCaptureRef.current = onCapture

  useEffect(() => {
    if (!capturing) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Meta')

      const key = e.key
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return

      parts.push(key.length === 1 ? key.toUpperCase() : key)
      onCaptureRef.current(parts.join('+'))
      setCapturing(false)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [capturing])

  return (
    <button
      type="button"
      onClick={() => setCapturing((v) => !v)}
      className="mditor-shortcut-key-btn"
      data-capturing={capturing ? 'true' : 'false'}
    >
      {capturing ? '请按下按键…' : formatKey(currentKey)}
    </button>
  )
}

/* ── 设置弹窗（常规 + 快捷键 双标签页） ── */

const SettingsModal = () => {
  const settingsOpen = useSettingsStore((s) => s.settingsOpen)
  const closeSettings = useSettingsStore((s) => s.closeSettings)
  const tab = useSettingsStore((s) => s.settingsTab)

  const fontSize = useSettingsStore((s) => s.fontSize)
  const setFontSize = useSettingsStore((s) => s.setFontSize)
  const autoSave = useSettingsStore((s) => s.autoSave)
  const setAutoSave = useSettingsStore((s) => s.setAutoSave)
  const spellcheck = useSettingsStore((s) => s.spellcheck)
  const setSpellcheck = useSettingsStore((s) => s.setSpellcheck)
  const headingNumbering = useSettingsStore((s) => s.headingNumbering)
  const setHeadingNumbering = useSettingsStore((s) => s.setHeadingNumbering)
  const atmosMotion = useSettingsStore((s) => s.atmosMotion)
  const setAtmosMotion = useSettingsStore((s) => s.setAtmosMotion)

  const overrides = useShortcutsStore((s) => s.overrides)
  const setOverride = useShortcutsStore((s) => s.setOverride)
  const resetAll = useShortcutsStore((s) => s.resetAll)
  const getKey = useShortcutsStore((s) => s.getKey)

  if (!settingsOpen) return null

  return (
    <div className="mditor-dialog-mask" onMouseDown={closeSettings}>
      <div
        className="mditor-dialog"
        style={{ maxWidth: 520, width: 520 }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mditor-dialog-title">设置</div>

        {/* 标签页切换 */}
        <div className="mditor-settings-tabs">
          <button
            type="button"
            className={`mditor-settings-tab${tab === 'general' ? ' active' : ''}`}
            onClick={() => useSettingsStore.setState({ settingsTab: 'general' })}
          >
            常规
          </button>
          <button
            type="button"
            className={`mditor-settings-tab${tab === 'shortcuts' ? ' active' : ''}`}
            onClick={() => useSettingsStore.setState({ settingsTab: 'shortcuts' })}
          >
            快捷键
          </button>
        </div>

        {tab === 'general' && (
          <div className="mditor-settings-body">
            {/* 字号 */}
            <div className="mditor-settings-row">
              <label className="mditor-settings-label">编辑器字号</label>
              <div className="mditor-settings-control">
                <input
                  type="range"
                  min={10}
                  max={32}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="mditor-settings-range"
                />
                <span className="mditor-settings-value">{fontSize}px</span>
              </div>
            </div>

            {/* 自动保存 */}
            <div className="mditor-settings-row">
              <label className="mditor-settings-label">自动保存</label>
              <div className="mditor-settings-control">
                <label className="mditor-settings-toggle">
                  <input
                    type="checkbox"
                    checked={autoSave}
                    onChange={(e) => setAutoSave(e.target.checked)}
                  />
                  <span className="mditor-settings-toggle-slider" />
                </label>
                <span className="mditor-settings-value">{autoSave ? '开启' : '关闭'}</span>
              </div>
            </div>
            <p className="mditor-settings-hint">
              停止编辑 30 秒后写入磁盘；若一直在输入，最迟 60 秒也会保存一次。关闭后仅手动 Ctrl+S 或退出时保存。
            </p>

            {/* 拼写检查 */}
            <div className="mditor-settings-row">
              <label className="mditor-settings-label">拼写检查</label>
              <div className="mditor-settings-control">
                <label className="mditor-settings-toggle">
                  <input
                    type="checkbox"
                    checked={spellcheck}
                    onChange={(e) => setSpellcheck(e.target.checked)}
                  />
                  <span className="mditor-settings-toggle-slider" />
                </label>
                <span className="mditor-settings-value">{spellcheck ? '开启' : '关闭'}</span>
              </div>
            </div>

            {/* 标题自动编号 */}
            <div className="mditor-settings-row">
              <label className="mditor-settings-label">标题自动编号</label>
              <div className="mditor-settings-control">
                <label className="mditor-settings-toggle">
                  <input
                    type="checkbox"
                    checked={headingNumbering}
                    onChange={(e) => setHeadingNumbering(e.target.checked)}
                  />
                  <span className="mditor-settings-toggle-slider" />
                </label>
                <span className="mditor-settings-value">{headingNumbering ? '开启' : '关闭'}</span>
              </div>
            </div>

            {/* 背景氛围动效（性能相关，默认关闭） */}
            <div className="mditor-settings-row">
              <label className="mditor-settings-label">背景氛围动效</label>
              <div className="mditor-settings-control">
                <label className="mditor-settings-toggle">
                  <input
                    type="checkbox"
                    checked={atmosMotion}
                    onChange={(e) => setAtmosMotion(e.target.checked)}
                  />
                  <span className="mditor-settings-toggle-slider" />
                </label>
                <span className="mditor-settings-value">{atmosMotion ? '开启' : '关闭'}</span>
              </div>
            </div>
            <p className="mditor-settings-hint">
              背景光晕的漂移与呼吸效果。开启后窗口可见时会持续驱动画面合成，空闲 CPU 占用可能明显升高；关闭（默认）时背景保持静态，外观基本一致。
            </p>
          </div>
        )}

        {tab === 'shortcuts' && (
          <div className="mditor-settings-body">
            <p className="mditor-settings-hint">
              点击按键按钮后按下新的组合键，按 Esc 取消录入。
            </p>
            <div className="mditor-shortcut-list">
              {SHORTCUT_LIST.map((def) => {
                const currentKey = getKey(def.id)
                const isCustom = !!overrides[def.id]
                return (
                  <div key={def.id} className="mditor-shortcut-row">
                    <span className="mditor-shortcut-label">{def.label}</span>
                    <div className="mditor-shortcut-actions">
                      {isCustom && (
                        <button
                          type="button"
                          className="mditor-shortcut-reset"
                          onClick={() => setOverride(def.id, '')}
                        >
                          还原
                        </button>
                      )}
                      <KeyCaptureButton
                        currentKey={currentKey}
                        onCapture={(key) => setOverride(def.id, key)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mditor-shortcut-footer">
              <button type="button" className="mditor-dialog-btn" onClick={() => resetAll()}>
                全部还原默认
              </button>
            </div>
          </div>
        )}

        <div className="mditor-dialog-actions">
          <button type="button" className="mditor-dialog-btn primary" onClick={closeSettings}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
