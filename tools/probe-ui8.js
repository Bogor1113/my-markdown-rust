// 探针：跳转后「容器顶 +8」的命中测试到底返回什么（区分 padding 死区/虚拟化）
const H = window.__H
const view = await H.view()
const out = {}

// 真实滚动容器：向上找第一个 overflow-y 可滚的祖先
const scroller = (() => {
  let el = view.dom
  while (el) {
    const cs = getComputedStyle(el)
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) return el
    el = el.parentElement
  }
  return null
})()
out.scroller = scroller ? { tag: scroller.tagName, cls: scroller.className, padTop: getComputedStyle(scroller).paddingTop } : null

const hit = (dy) => {
  const r = scroller.getBoundingClientRect()
  const res = view.posAtCoords({ left: r.left + 24, top: r.top + dy })
  return res ? res.pos : null
}
const prose = view.dom
const snap = (tag) => ({
  tag,
  scrollTop: scroller.scrollTop,
  proseTop: Math.round(prose.getBoundingClientRect().top),
  hits: { 8: hit(8), 24: hit(24), 48: hit(48), 96: hit(96), 200: hit(200) },
  activePos: H.store.getState().activeOutlinePos,
})

out.beforeClick = snap('before')
const rows = [...document.querySelectorAll('button.truncate')]
out.positions = H.store.getState().outline.map((o) => o.pos)
rows[rows.length - 1].click()
await H.sleep(120)
out.afterClick = snap('after120')
await H.sleep(700)
out.after700 = snap('after700')
return out
