// 探针：打开大文件各阶段耗时（parse / EditorState.create / updateState / 首帧）
const H = window.__H
const { editorViewCtx, parserCtx, schemaCtx, editorStateOptionsCtx, prosePluginsCtx, EditorState } = H.m

const md = await (await fetch('/big5.md')).text()
const ed = H.store.getState().editor
const out = { chars: md.length }

await ed.action((ctx) => {
  const t0 = performance.now()
  const doc = ctx.get(parserCtx)(md)
  out.parseMs = +(performance.now() - t0).toFixed(0)

  const t1 = performance.now()
  const state = EditorState.create(
    ctx.get(editorStateOptionsCtx)({
      schema: ctx.get(schemaCtx),
      doc,
      plugins: ctx.get(prosePluginsCtx),
    }),
  )
  out.stateMs = +(performance.now() - t1).toFixed(0)

  const view = ctx.get(editorViewCtx)
  const t2 = performance.now()
  view.updateState(state)
  out.updateStateMs = +(performance.now() - t2).toFixed(0)

  const t3 = performance.now()
  view.dom.getBoundingClientRect()
  out.layoutMs = +(performance.now() - t3).toFixed(0)
  out.childCount = doc.childCount
})

// 二次 parse（JS 已预热）对比
await ed.action((ctx) => {
  const t = performance.now()
  ctx.get(parserCtx)(md)
  out.parseAgainMs = +(performance.now() - t).toFixed(0)
})

// 回滚到原文档，避免影响后续断言
return out
