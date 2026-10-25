// 探针：大文档里点大纲最后一项 / 中间项，高亮是否落在正确项上
const H = window.__H
const view = await H.view()
const out = { outlineLen: H.store.getState().outline.length }

const scroller = (() => {
  let el = view.dom
  while (el) {
    const cs = getComputedStyle(el)
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) return el
    el = el.parentElement
  }
  return null
})()

const rowState = (tag, r) => {
  const rows = [...document.querySelectorAll('button.truncate')]
  const activeIdx = rows.findIndex((b) => b.className.includes('font-bold'))
  return { tag, scrollTop: Math.round(scroller.scrollTop), activePos: H.store.getState().activeOutlinePos, activeIdx, clickedIdx: r }
}

const rows0 = [...document.querySelectorAll('button.truncate')]
out.rowCount = rows0.length

rows0[rows0.length - 1].click()
await H.sleep(900)
out.last = rowState('clickLast', rows0.length - 1)
out.lastExpectedPos = H.store.getState().outline[rows0.length - 1].pos

const mid = Math.floor(rows0.length / 2)
const rows1 = [...document.querySelectorAll('button.truncate')]
rows1[mid].click()
await H.sleep(900)
out.mid = rowState('clickMid', mid)
out.midExpectedPos = H.store.getState().outline[mid].pos

const rows2 = [...document.querySelectorAll('button.truncate')]
rows2[0].click()
await H.sleep(900)
out.first = rowState('clickFirst', 0)
out.firstExpectedPos = H.store.getState().outline[0].pos
return out
