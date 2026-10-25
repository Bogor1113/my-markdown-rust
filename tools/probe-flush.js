// 探针：打字后的长任务归属 + 大纲收集 / nodeDOM / posAtCoords 单项耗时
const H = window.__H
const view = await H.view()
const doc = view.state.doc

const out = {
  childCount: doc.childCount,
  headings: 0,
  codeBlocks: 0,
  tables: 0,
  docSize: doc.content.size,
}
doc.descendants((n) => {
  if (n.type.name === 'heading') out.headings++
  if (n.type.name === 'code_block') out.codeBlocks++
  if (n.type.name === 'table') out.tables++
  return true
})

// 1) nodeDOM 全量（大纲收集里最可疑的一步）
const headingPos = []
let p0 = 0
doc.forEach((n) => {
  if (n.type.name === 'heading') headingPos.push(p0)
  p0 += n.nodeSize
})
let t = performance.now()
for (const p of headingPos) view.nodeDOM(p)
out.nodeDOMAllMs = +(performance.now() - t).toFixed(1)

// 2) posAtCoords 单次
const scrollEl = H.scrollEl()
const r = scrollEl.getBoundingClientRect()
t = performance.now()
view.posAtCoords({ left: r.left + 24, top: r.top + 12 })
out.posAtCoords1 = +(performance.now() - t).toFixed(1)
t = performance.now()
view.posAtCoords({ left: r.left + 24, top: r.bottom - 12 })
out.posAtCoords2 = +(performance.now() - t).toFixed(1)

// 3) 打字 6 次，记录之后的长任务时间线
await H.caretToBlockByType('paragraph')
const lt = []
const obs = new PerformanceObserver((l) => {
  for (const e of l.getEntries()) lt.push({ start: e.startTime, dur: e.duration })
})
obs.observe({ entryTypes: ['longtask'] })
const per = []
for (let i = 0; i < 6; i++) {
  const a = performance.now()
  document.execCommand('insertText', false, 'x')
  per.push(+(performance.now() - a).toFixed(1))
}
const tEnd = performance.now()
await new Promise((r2) => setTimeout(r2, 2000))
obs.disconnect()
out.typePerCall = per
out.longTasks = lt.map((l) => ({ startRel: Math.round(l.start - tEnd), dur: Math.round(l.dur) }))
out.outlineLen = H.store.getState().outline.length
return out
