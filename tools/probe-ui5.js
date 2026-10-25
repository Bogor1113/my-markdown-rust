// 探针：多标签关闭流程（含确认对话框参数）
const H = window.__H
const out = {}
await H.open('C:\\work\\big.md', { skipLargeConfirm: true })
await H.sleep(1600)
out.openTabs = H.state().tabs.map((t) => ({ name: t.name, dirty: t.dirty }))
out.tabsDom = [...document.querySelectorAll('.mditor-tab')].map((t) => t.getAttribute('title'))

const first = [...document.querySelectorAll('.mditor-tab')].find((t) => (t.getAttribute('title') || '').endsWith('functest.md'))
first.click()
await H.sleep(600)
out.activeAfterSwitch = H.state().active

const bigTab = [...document.querySelectorAll('.mditor-tab')].find((t) => (t.getAttribute('title') || '').endsWith('big.md'))
const btn = bigTab?.querySelector('button[title="关闭"]')
out.hasCloseBtn = !!btn
window.__MOCK__.calls.length = 0
btn.click()
await H.sleep(1000)
out.tabsAfter = H.state().tabs.map((t) => t.name)
out.activeAfter = H.state().active
out.calls = window.__MOCK__.calls.map((c) => ({ cmd: c.cmd, args: c.args }))
out.toast = H.state().toast

// 再试一次用 store 直接关，确认是 UI 路径还是 store 路径的问题
const ids = H.store.getState().tabs.map((t) => t.id)
out.tabIds = ids
H.store.getState().closeTab(ids[0])
await H.sleep(400)
out.tabsAfterStoreClose = H.state().tabs.map((t) => t.name)
return out
