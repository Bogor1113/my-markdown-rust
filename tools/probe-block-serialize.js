// 探针：逐顶层块序列化耗时分布（找最贵的块）+ 整篇 join 成本
const H = window.__H
const ed = H.store.getState().editor
const out = { blocks: 0, top: [], totalMs: 0 }
await ed.action((ctx) => {
  const view = ctx.get(H.m.editorViewCtx)
  const doc = view.state.doc
  const serializerCtx = H.m.serializerCtx; const schemaCtx = H.m.schemaCtx
  const serialize = ctx.get(serializerCtx)
  const schema = ctx.get(schemaCtx)
  const times = []
  const t0 = performance.now()
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    const t = performance.now()
    serialize(schema.topNodeType.create(null, child))
    const d = performance.now() - t
    times.push({ i, size: child.nodeSize, type: child.type.name, ms: +d.toFixed(2) })
  }
  out.totalMs = +(performance.now() - t0).toFixed(0)
  out.blocks = doc.childCount
  times.sort((a, b) => b.ms - a.ms)
  out.top = times.slice(0, 8)
  out.over100 = times.filter((x) => x.ms > 20).length
})
return out
