// 探针：首帧里三个代码块装饰插件（行号 / 语言徽章 / 复制按钮）各占多少
const H = window.__H
const ed = H.store.getState().editor
const md = await (await fetch('/big5.md')).text()
const out = {}

await ed.action((ctx) => {
  const view = ctx.get(H.m.editorViewCtx)
  const doc = ctx.get(H.m.parserCtx)(md)
  const all = ctx.get(H.m.prosePluginsCtx)

  const run = (label, dropKeys) => {
    const plugins = all.filter((p) => {
      const k = typeof p.key === 'string' ? p.key : ''
      return !dropKeys.some((d) => k.startsWith(d))
    })
    // 先清空 DOM，避免上一轮残留影响
    view.updateState(H.m.EditorState.create({ schema: ctx.get(H.m.schemaCtx), doc: ctx.get(H.m.schemaCtx).topNodeType.createAndFill() }))
    const t0 = performance.now()
    const st = H.m.EditorState.create(
      ctx.get(H.m.editorStateOptionsCtx)({ schema: ctx.get(H.m.schemaCtx), doc, plugins }),
    )
    const t1 = performance.now()
    view.updateState(st)
    const t2 = performance.now()
    view.dom.getBoundingClientRect()
    const t3 = performance.now()
    out[label] = { create: +(t1 - t0).toFixed(0), update: +(t2 - t1).toFixed(0), layout: +(t3 - t2).toFixed(0) }
  }

  run('all', [])
  run('noLineNumbers', ['code-block-line-numbers'])
  run('noBadge', ['mditor-language-badge'])
  run('noCopy', ['mditor-code-copy'])
  run('noAllThree', ['code-block-line-numbers', 'mditor-language-badge', 'mditor-code-copy'])
  run('noHighlightNoThree', ['code-block-line-numbers', 'mditor-language-badge', 'mditor-code-copy', 'mditor-code-highlight'])
})
return out
