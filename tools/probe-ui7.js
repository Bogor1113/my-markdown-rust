// 探针：编辑器的真实滚动容器是哪一个（从 .ProseMirror 往上逐个祖先看）
const H = window.__H
const view = await H.view()
const out = { chain: [] }
let el = view.dom
for (let i = 0; i < 6 && el; i++) {
  const cs = getComputedStyle(el)
  out.chain.push({
    i,
    tag: el.tagName,
    cls: (el.className || '').toString().slice(0, 60),
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    overflowY: cs.overflowY,
    position: cs.position,
  })
  el = el.parentElement
}

// 点最后一个大纲项，看谁滚了、命中到哪
const root = document.querySelector('.milkdown')
const rows = [...document.querySelectorAll('button.truncate')]
out.positions = H.store.getState().outline.map((o) => o.pos)
rows[rows.length - 1].click()
await H.sleep(800)

const hit = (el2, dy) => {
  const r = el2.getBoundingClientRect()
  return view.posAtCoords({ left: r.left + 24, top: r.top + dy })?.pos ?? null
}
const prose = view.dom
out.after = {
  activePos: H.store.getState().activeOutlinePos,
  proseScrollTop: prose.scrollTop,
  proseRect: (() => {
    const r = prose.getBoundingClientRect()
    return { top: Math.round(r.top), height: Math.round(r.height) }
  })(),
  hitProse8: hit(prose, 8),
  hitProse40: hit(prose, 40),
  hitProse120: hit(prose, 120),
  milks: [...document.querySelectorAll('.milkdown')].map((e) => ({ cls: e.className, top: e.scrollTop, h: e.clientHeight, sh: e.scrollHeight })),
  scrollers: [...document.querySelectorAll('*')].filter((e) => e.scrollTop > 0).map((e) => ({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 50), top: e.scrollTop })),
}
return out
