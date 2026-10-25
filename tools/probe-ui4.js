// 探针：跳转对齐后的真实几何 —— 标题究竟落在容器顶下方多少像素，命中测试返回什么 pos
const H = window.__H
const store = H.store
const root = document.querySelector('.milkdown')
const view = await H.view()
const rr = root.getBoundingClientRect()

const heads = [...document.querySelectorAll('.milkdown h1, .milkdown h2, .milkdown h3, .milkdown h4')]
const last = heads[heads.length - 1]
const positions = store.getState().outline.map((o) => o.pos)

const hitAt = (dy) => view.posAtCoords({ left: rr.left + 24, top: rr.top + dy })?.pos ?? null

const out = {
  positions,
  headingCount: heads.length,
  lastText: last.textContent.trim(),
  lastRectTop: last.getBoundingClientRect().top - rr.top + root.scrollTop,
  rootPaddingTop: getComputedStyle(root).paddingTop,
  proseMarginTop: (() => {
    const p = root.querySelector('.ProseMirror')
    return p ? getComputedStyle(p).marginTop : null
  })(),
  hitsBefore: { 8: hitAt(8), 16: hitAt(16), 24: hitAt(24), 40: hitAt(40) },
}

// 复刻 jump 的处理：把标题对齐到容器顶下方 8px
const contentTop = out.lastRectTop
root.scrollTop = Math.max(0, contentTop - 8)
await H.sleep(120)

out.aligned = {
  scrollTop: root.scrollTop,
  headingTopOffset: last.getBoundingClientRect().top - root.getBoundingClientRect().top,
  hits: { 8: hitAt(8), 12: hitAt(12), 20: hitAt(20), 32: hitAt(32), 48: hitAt(48) },
  activePos: store.getState().activeOutlinePos,
}
return out
