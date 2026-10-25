/**
 * 对「打开大文件」的 parse + EditorState.create + view.updateState 做 CPU 采样，
 * 看首帧 1.4s 到底花在哪些函数上。
 * 用法: node tools/profile-open.mjs [file] [out]
 */
import { launch } from './cdp-lib.mjs'
import { writeFileSync } from 'node:fs'

const FILE = process.argv[2] || 'big5.md'
const OUT = process.argv[3] || 'prof-open.json'

const RUN = `
const H = window.__H
const ed = H.store.getState().editor
const md = await (await fetch('/${FILE}')).text()
const out = { chars: md.length }
await ed.action((ctx) => {
  const view = ctx.get(H.m.editorViewCtx)
  let t = performance.now()
  const parsed = ctx.get(H.m.parserCtx)(md)
  out.parseMs = +(performance.now() - t).toFixed(0)
  t = performance.now()
  const state = H.m.EditorState.create(
    ctx.get(H.m.editorStateOptionsCtx)({
      schema: ctx.get(H.m.schemaCtx),
      doc: parsed,
      plugins: ctx.get(H.m.prosePluginsCtx),
    }),
  )
  out.stateMs = +(performance.now() - t).toFixed(0)
  t = performance.now()
  view.updateState(state)
  out.updateStateMs = +(performance.now() - t).toFixed(0)
  out.childCount = state.doc.childCount
})
return out
`

const main = async () => {
  const p = await launch('about:blank', { headless: process.env.HEADFUL !== '1' })
  let profile = null
  let res = null
  try {
    await p.goto(`http://localhost:1420/tests/app.html?files=${FILE}`)
    await p.waitFor('window.__H && window.__H.ready', 60000, 'ready')
    // 预热：先加载一次（让代码 / schema / 字体都就绪），采样的是「热态」打开
    await p.eval(`
      const H = window.__H;
      await H.openWorkspace('C:\\\\work');
      await H.open('C:\\\\work\\\\${FILE}', { skipLargeConfirm: true });
      await H.waitFor(() => {
        const d = document.querySelector('.milkdown [contenteditable="true"]');
        return d && d.textContent.length > 1000;
      }, 60000, 'editable');
      await H.sleep(1200);
      return 1;
    `)
    await p.send('Profiler.enable')
    await p.send('Profiler.setSamplingInterval', { interval: 100 })
    await p.send('Profiler.start')
    res = await p.eval(RUN)
    const r = await p.send('Profiler.stop')
    profile = r.profile
  } catch (e) {
    console.log('ERROR', String(e))
  } finally {
    await p.close()
  }
  if (!profile) return
  console.log('阶段', JSON.stringify(res))
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parentOf = new Map()
  for (const n of profile.nodes) for (const c of n.children || []) parentOf.set(c, n.id)
  const dt = (profile.endTime - profile.startTime) / Math.max(1, profile.samples.length) / 1000
  const clean = (u) =>
    (u || '').replace(/^https?:\/\/localhost:1420/, '').replace(/^.*node_modules\/\.vite\/deps\//, 'dep:')
  const own = new Map()
  const leaf = new Map()
  for (const id of profile.samples) {
    const n = byId.get(id)
    if (!n) continue
    const lk = `${n.callFrame.functionName || '(anon)'} @ ${clean(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`
    leaf.set(lk, (leaf.get(lk) || 0) + dt)
    let cur = n
    let key = null
    while (cur) {
      const u = cur.callFrame.url || ''
      if (/\/src\//.test(u)) {
        key = `${cur.callFrame.functionName || '(anon)'} @ ${clean(u)}:${cur.callFrame.lineNumber + 1}`
        break
      }
      const pid = parentOf.get(cur.id)
      cur = pid ? byId.get(pid) : null
    }
    const k = key || `[非应用] ${lk}`
    own.set(k, (own.get(k) || 0) + dt)
  }
  const fmt = (m) => [...m.entries()].map(([k, v]) => ({ ms: Math.round(v), k })).sort((a, b) => b.ms - a.ms)
  writeFileSync(OUT, JSON.stringify({ res, app: fmt(own), leaf: fmt(leaf) }, null, 2))
  console.log('\n-- 应用层 --')
  for (const r2 of fmt(own).slice(0, 16)) console.log(String(r2.ms).padStart(7), r2.k)
  console.log('\n-- 叶子 --')
  for (const r2 of fmt(leaf).slice(0, 16)) console.log(String(r2.ms).padStart(7), r2.k)
}
main()
