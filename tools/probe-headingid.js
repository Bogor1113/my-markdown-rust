// 探针：headingId.updateId 到底改了多少个标题？为什么慢？
const H = window.__H
const view = await H.view()
const doc = view.state.doc
const out = { headings: 0, mismatch: 0, samples: [] }
const ed = H.store.getState().editor
await ed.action((ctx) => {
  const getId = ctx.get(H.m.headingIdGenerator.key)
  const t0 = performance.now()
  const idMap = {}
  let n = 0
  let mismatch = 0
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    n++
    if (node.textContent.trim().length === 0) return
    const attrs = node.attrs
    let id = getId(node)
    if (idMap[id]) {
      idMap[id] += 1
      id += `-#${idMap[id]}`
    } else idMap[id] = 1
    if (attrs.id !== id) {
      mismatch++
      if (out.samples.length < 5) out.samples.push({ pos, text: node.textContent.slice(0, 24), have: attrs.id, want: id })
    }
  })
  out.headings = n
  out.mismatch = mismatch
  out.walkMs = +(performance.now() - t0).toFixed(1)
})
return out
