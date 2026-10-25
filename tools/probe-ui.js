// 探针：核对我对失败用例的判断（导出按钮 / 命令面板 / 大纲高亮 / 查找栏 / 标签页）
const H = window.__H
const out = {}
const qa = (s) => [...document.querySelectorAll(s)]

out.state = H.state()
out.toolbarTitles = qa('button[title]').map((b) => b.getAttribute('title')).slice(0, 60)
out.exportBtn = qa('button[title="导出"]').length
out.exportBtnVisible = qa('button[title="导出"]').filter((b) => b.offsetParent !== null).length

// ---- 命令面板 ----
out.paletteDefaultMode = H.store.getState().paletteMode
H.store.getState().openPalette('commands')
await H.sleep(300)
out.palette = {
  mode: H.store.getState().paletteMode,
  has: !!document.querySelector('.mditor-palette'),
  items: qa('.mditor-palette button').length,
  titles: qa('.mditor-palette button').map((b) => b.textContent.trim()).slice(0, 20),
  activeEl: document.activeElement?.tagName + '/' + (document.activeElement?.getAttribute('placeholder') || ''),
}
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }))
await H.sleep(250)
out.paletteClosedByDocEsc = !document.querySelector('.mditor-palette')
// 用真实焦点元素派发 Esc
const pin = document.querySelector('.mditor-palette input')
if (pin) {
  pin.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }))
  await H.sleep(250)
}
out.paletteClosedByInputEsc = !document.querySelector('.mditor-palette')
H.store.getState().closePalette()
await H.sleep(150)

// ---- 查找栏结构 ----
H.store.getState().openFind()
await H.sleep(300)
out.findbar = {
  inputs: qa('.mditor-findbar input').map((i) => i.placeholder),
  buttons: qa('.mditor-findbar button').map((b) => ({ t: (b.textContent || '').trim(), title: b.getAttribute('title') })),
}
// 全部替换是否真的生效
const inputs = qa('.mditor-findbar input')
const setVal = (el, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
setVal(inputs[0], 'SEARCHME')
await H.sleep(400)
out.matchCount = qa('.ProseMirror-search-match').length
setVal(inputs[1], 'REPLACED')
await H.sleep(300)
const allBtn = qa('.mditor-findbar button').find((b) => b.getAttribute('title') === '全部替换')
out.hasAllBtn = !!allBtn
allBtn?.click()
await H.sleep(500)
const mtxt = document.querySelector('.milkdown').textContent || ''
out.replaceResult = { hasReplaced: mtxt.includes('REPLACED'), stillSearch: mtxt.includes('SEARCHME'), matches: qa('.ProseMirror-search-match').length }
H.store.getState().closeFind()
await H.sleep(200)

// ---- 大纲 ----
const rows = qa('button.truncate')
out.outline = { rows: rows.length, texts: rows.map((r) => r.textContent.trim()) }
const scroller = document.querySelector('.milkdown')
out.outline.beforeTop = scroller?.scrollTop
if (rows.length) {
  rows[rows.length - 1].click()
  await H.sleep(150)
  out.outline.pos150 = H.store.getState().activeOutlinePos
  out.outline.top150 = scroller?.scrollTop
  await H.sleep(700)
  out.outline.pos850 = H.store.getState().activeOutlinePos
  out.outline.top850 = scroller?.scrollTop
}

// ---- 标签页 ----
out.tabs = {
  count: qa('.mditor-tab').length,
  titles: qa('.mditor-tab').map((d) => d.getAttribute('title')),
  activeCls: qa('.mditor-tab').map((d) => d.className.includes('mditor-tab-active')),
}

return out
