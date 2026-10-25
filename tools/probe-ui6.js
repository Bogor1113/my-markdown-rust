// 探针：为何「只是打开再切走」就会把标签标脏——内容回写与磁盘内容到底差在哪
const H = window.__H
const out = {}
const t0 = H.store.getState().tabs[0]
out.before = { name: t0.name, dirty: t0.isDirty, len: t0.content.length, savedLen: t0.savedContent.length, equal: t0.content === t0.savedContent }

await H.open('C:\\work\\big.md', { skipLargeConfirm: true })
await H.sleep(1800)

const t = H.store.getState().tabs.find((x) => x.name === 'functest.md')
out.afterSwitch = { dirty: t.isDirty, len: t.content.length, savedLen: t.savedContent.length, equal: t.content === t.savedContent }

const a = t.savedContent
const b = t.content
let i = 0
while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++
out.firstDiffAt = i
out.savedSlice = JSON.stringify(a.slice(Math.max(0, i - 50), i + 50))
out.nowSlice = JSON.stringify(b.slice(Math.max(0, i - 50), i + 50))

// 再切回来，看 big.md 是否也被标脏
const bigTab = () => H.store.getState().tabs.find((x) => x.name === 'big.md')
out.bigWhileActive = { dirty: bigTab().isDirty, equal: bigTab().content === bigTab().savedContent }
const first = [...document.querySelectorAll('.mditor-tab')].find((x) => (x.getAttribute('title') || '').endsWith('functest.md'))
first?.click()
await H.sleep(1200)
out.bigAfterSwitch = { dirty: bigTab().isDirty, equal: bigTab().content === bigTab().savedContent, len: bigTab().content.length, savedLen: bigTab().savedContent.length }
return out
