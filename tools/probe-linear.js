// 探针：updateState 的块数线性度 —— 不同顶层块数下构建 DOM 的成本
const H = window.__H
const ed = H.store.getState().editor
const md = await (await fetch('/big5.md')).text()
const out = {}

await ed.action((ctx) => {
  const view = ctx.get(H.m.editorViewCtx)
  const doc = ctx.get(H.m.parserCtx)(md)
  out.total = doc.childCount
  for (const n of [200, 600, 1500, 4345]) {
    const sliced = n >= doc.childCount ? doc : doc.copy(doc.content.cutByIndex(0, n))
    const t0 = performance.now()
    const st = H.m.EditorState.create(
      ctx.get(H.m.editorStateOptionsCtx)({
        schema: ctx.get(H.m.schemaCtx),
        doc: sliced,
        plugins: ctx.get(H.m.prosePluginsCtx),
      }),
    )
    const t1 = performance.now()
    view.updateState(st)
    const t2 = performance.now()
    view.dom.getBoundingClientRect()
    const t3 = performance.now()
    out['n' + n] = { create: +(t1 - t0).toFixed(0), update: +(t2 - t1).toFixed(0), layout: +(t3 - t2).toFixed(0), blocks: sliced.childCount }
  }
})
return out
