// 探针：表格单元格打字时到底重建了什么 DOM（17 个新增节点是什么）
const H = window.__H
const ed = H.store.getState().editor
const info = await H.caretToTableCell()
await H.sleep(300)
let out = { info }
await ed.action((view) => {})
const out2 = await ed.action(async (ctx) => {
  const view = ctx.get(H.m.editorViewCtx)
  let tablePos = -1
  view.state.doc.descendants((n, p) => {
    if (tablePos < 0 && n.type.name === 'table') tablePos = p
    return tablePos < 0
  })
  const tableEl = view.nodeDOM(tablePos)
  const recs = []
  const mo = new MutationObserver((list) => {
    for (const e of list) {
      if (e.type === 'childList') {
        for (const n of e.addedNodes) {
          const el = n
          recs.push({
            tag: el.nodeName,
            cls: (el.className || '').toString().slice(0, 40),
            parent: el.parentElement ? el.parentElement.tagName + '.' + (el.parentElement.className || '').toString().split(' ')[0] : '?',
            html: (el.outerHTML || '').slice(0, 90),
          })
        }
      } else if (e.type === 'attributes') {
        recs.push({ attr: e.attributeName, tag: e.target.nodeName, cls: (e.target.className || '').toString().slice(0, 30) })
      }
    }
  })
  mo.observe(tableEl, { subtree: true, childList: true, attributes: true, characterData: true })
  let pos = view.state.selection.from
  for (let i = 0; i < 3; i++) {
    const tr = view.state.tr.insertText('z', pos)
    view.dispatch(tr)
    pos += 1
  }
  await new Promise((r) => setTimeout(r, 60))
  mo.disconnect()
  return { added: recs.length, recs: recs.slice(0, 24) }
})
out = { ...out, ...out2 }
return out
