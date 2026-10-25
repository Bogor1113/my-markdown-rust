// 探针：首帧 DOM 成本里，代码块装饰（行号槽 / 语言徽章 / 复制按钮）占多少？
// 做法：把原文里的 code_block 全换成同文本的 paragraph，再比 updateState 耗时。
const H = window.__H
const ed = H.store.getState().editor
const md = await (await fetch('/big5.md')).text()
const out = {}

const timeCreate = (ctx, view, doc) => {
  const t0 = performance.now()
  const st = H.m.EditorState.create(
    ctx.get(H.m.editorStateOptionsCtx)({
      schema: ctx.get(H.m.schemaCtx),
      doc,
      plugins: ctx.get(H.m.prosePluginsCtx),
    }),
  )
  const t1 = performance.now()
  view.updateState(st)
  const t2 = performance.now()
  view.dom.getBoundingClientRect()
  const t3 = performance.now()
  return { create: +(t1 - t0).toFixed(0), update: +(t2 - t1).toFixed(0), layout: +(t3 - t2).toFixed(0) }
}

await ed.action((ctx) => {
  const view = ctx.get(H.m.editorViewCtx)
  const schema = ctx.get(H.m.schemaCtx)
  const doc = ctx.get(H.m.parserCtx)(md)
  out.blocks = doc.childCount

  // 统计代码块 / 表格数量
  let codes = 0
  let tables = 0
  doc.descendants((n) => {
    if (n.type.name === 'code_block') codes++
    if (n.type.name === 'table') tables++
  })
  out.codes = codes
  out.tables = tables

  // A：原文
  out.original = timeCreate(ctx, view, doc)

  // B：code_block → paragraph（同样文本，但没有行号/徽章/复制按钮 widget）
  const kids = []
  doc.forEach((child) => {
    if (child.type.name === 'code_block') {
      kids.push(schema.nodes.paragraph.create(null, child.textContent ? schema.text(child.textContent) : null))
    } else kids.push(child)
  })
  const noCode = doc.copy(doc.content.constructor.fromArray(kids))
  out.noCodeBlock = timeCreate(ctx, view, noCode)

  // C：只保留前 800 块的原文（对比块数线性度）
  out.first800 = timeCreate(ctx, view, doc.copy(doc.content.cutByIndex(0, 800)))
})
return out
