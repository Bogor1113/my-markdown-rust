// 探针：大纲点击后的高亮状态逐帧采样 + 视口顶部的 posAtCoords 结果
const H = window.__H
const store = H.store
const qa = (s) => [...document.querySelectorAll(s)]
const root = document.querySelector('.milkdown')
const view = await H.view()

const rect = root.getBoundingClientRect()
const hit8 = view.posAtCoords({ left: rect.left + 40, top: rect.top + 8 })
const hit40 = view.posAtCoords({ left: rect.left + 40, top: rect.top + 40 })

const out = {
  docSize: view.state.doc.content.size,
  childCount: view.state.doc.childCount,
  rootScrollTop: root.scrollTop,
  rootScrollHeight: root.scrollHeight,
  rootClientHeight: root.clientHeight,
  positions: store.getState().outline.map((o) => o.pos),
  texts: store.getState().outline.map((o) => o.text),
  initialActivePos: store.getState().activeOutlinePos,
  hit8: hit8?.pos ?? null,
  hit40: hit40?.pos ?? null,
  editorRegistered: typeof store.getState().editor,
}

const rows = qa('button.truncate')
out.rowCount = rows.length
rows[rows.length - 1]?.click()

const samples = []
for (let i = 0; i < 12; i++) {
  await H.sleep(70)
  samples.push({ ms: (i + 1) * 70, active: store.getState().activeOutlinePos, top: root.scrollTop })
}
out.samples = samples
out.finalHit = (() => {
  const r = root.getBoundingClientRect()
  return view.posAtCoords({ left: r.left + 40, top: r.top + 8 })?.pos ?? null
})()
out.activeRows = qa('button.truncate')
  .filter((b) => b.className.includes('font-bold'))
  .map((b) => b.textContent.trim())
return out
