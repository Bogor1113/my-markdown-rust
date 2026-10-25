// 探针：模拟 headingId 的 updateId，分段计时（走查 / 建 tr / dispatch）
const H = window.__H
await H.caretToBlockByType('heading')
// 先打一个字符，制造「id 需要更新」的真实状态
document.execCommand('insertText', false, 'z')
await new Promise((r) => setTimeout(r, 50))

const ed = H.store.getState().editor
const out = {}
await ed.action((ctx) => {
  const view = ctx.get(H.m.editorViewCtx)
  const getId = ctx.get(H.m.headingIdGenerator.key)
  const hType = H.m.headingSchema.type(ctx)
  const doc = view.state.doc

  let t = performance.now()
  const tr = view.state.tr.setMeta('addToHistory', false)
  let found = 0
  const idMap = {}
  doc.descendants((node, pos) => {
    if (node.type !== hType) return
    if (node.textContent.trim().length === 0) return
    const attrs = node.attrs
    let id = getId(node)
    if (idMap[id]) {
      idMap[id] += 1
      id += `-#${idMap[id]}`
    } else idMap[id] = 1
    if (attrs.id !== id) {
      found++
      tr.setMeta('heading-id', true).setNodeMarkup(pos, undefined, { ...attrs, id })
    }
  })
  out.buildTrMs = +(performance.now() - t).toFixed(1)
  out.found = found

  t = performance.now()
  view.dispatch(tr)
  out.dispatchMs = +(performance.now() - t).toFixed(1)

  t = performance.now()
  view.dom.getBoundingClientRect()
  out.layoutMs = +(performance.now() - t).toFixed(1)
})
return out
