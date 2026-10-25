// 探针：定位「导出按钮消失」的触发步骤 + 设置弹窗 Esc 是否真的能关
const H = window.__H
const out = {}
const qa = (s) => [...document.querySelectorAll(s)]
const esc = () => {
  for (const t of [document, window]) {
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }))
    t.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }))
  }
}
const probe = (tag) => ({
  tag,
  exportBtn: qa('button[title="导出"]').length,
  toolbar: qa('button[title="设置"]').length,
  fullscreen: H.store.getState().isFullscreen,
  src: H.state().tabs[0]?.src,
  active: H.state().active,
  settingsOpen: H.settings.getState().settingsOpen,
  titleBar: !!document.querySelector('.mditor-titlebar, [data-tauri-drag-region]'),
})
out.steps = [probe('init')]

// 1) 设置弹窗：Esc 能否关闭
H.settings.getState().openSettings()
await H.sleep(300)
const openedOk = !!document.querySelector('.mditor-settings-body')
esc()
await H.sleep(300)
out.settings = { openedOk, closedByEsc: !document.querySelector('.mditor-settings-body'), storeOpen: H.settings.getState().settingsOpen }
out.steps.push(probe('after-settings-esc'))
if (H.settings.getState().settingsOpen) H.settings.getState().closeSettings()
await H.sleep(200)

// 2) 全屏两次
const clickByTitle = (needle) => {
  const el = qa('button').find((b) => (b.getAttribute('title') || '').includes(needle) && b.offsetParent !== null)
  if (!el) return 'not-found'
  el.click()
  return 'ok'
}
out.fs1 = clickByTitle('全屏')
await H.sleep(400)
out.steps.push(probe('after-fs1'))
out.fs2 = clickByTitle('全屏')
await H.sleep(350)
out.steps.push(probe('after-fs2'))

// 3) 源码进出
out.src1 = clickByTitle('源码')
await H.sleep(800)
out.steps.push(probe('after-src1'))
out.src2 = clickByTitle('源码')
await H.sleep(1200)
out.steps.push(probe('after-src2'))

// 4) 专注模式开关（可能隐藏工具栏）
out.focus1 = clickByTitle('专注')
await H.sleep(350)
out.steps.push(probe('after-focus1'))
out.focus2 = clickByTitle('专注')
await H.sleep(300)
out.steps.push(probe('after-focus2'))

return out
