/**
 * 采样「刚打开大文件之后那 3 秒」在干什么（用户感知为「打开后紧接一下就卡」）。
 * 用法: node tools/profile-afteropen.mjs [file] [ms]
 */
import { launch, sleep } from './cdp-lib.mjs'
import { writeFileSync } from 'node:fs'

const FILE = process.argv[2] || 'big5.md'
const MS = Number(process.argv[3] || 3000)
const OUT = `prof-afteropen-${FILE}.json`

const main = async () => {
  const p = await launch('about:blank', { headless: process.env.HEADFUL !== '1' })
  let profile = null
  let lt = []
  try {
    await p.goto(`http://localhost:1420/tests/app.html?files=${FILE}`)
    await p.waitFor('window.__H && window.__H.ready', 60000, 'ready')
    await p.send('Profiler.enable')
    await p.eval(`
      const H = window.__H;
      window.__LT = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__LT.push({ s: e.startTime, d: e.duration }); })
        .observe({ entryTypes: ['longtask'] });
      await H.openWorkspace('C:\\\\work');
      await H.open('C:\\\\work\\\\${FILE}', { skipLargeConfirm: true });
      return 1;
    `)
    await p.send('Profiler.setSamplingInterval', { interval: 200 })
    await p.send('Profiler.start')
    await sleep(MS)
    const r = await p.send('Profiler.stop')
    profile = r.profile
    lt = await p.eval(`return window.__LT.map((x) => ({ s: Math.round(x.s), d: Math.round(x.d) }))`)
  } catch (e) {
    console.log('ERROR', String(e))
  } finally {
    await p.close()
  }
  if (!profile) return
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parentOf = new Map()
  for (const n of profile.nodes) for (const c of n.children || []) parentOf.set(c, n.id)
  const dt = (profile.endTime - profile.startTime) / Math.max(1, profile.samples.length) / 1000
  const clean = (u) => (u || '').replace(/^https?:\/\/localhost:1420/, '').replace(/^.*node_modules\/\.vite\/deps\//, 'dep:')
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
  writeFileSync(OUT, JSON.stringify({ lt, app: fmt(own), leaf: fmt(leaf) }, null, 2))
  console.log('longTasks', JSON.stringify(lt))
  console.log('\n-- 应用层 --')
  for (const r2 of fmt(own).slice(0, 16)) console.log(String(r2.ms).padStart(7), r2.k)
  console.log('\n-- 叶子 --')
  for (const r2 of fmt(leaf).slice(0, 12)) console.log(String(r2.ms).padStart(7), r2.k)
}
main()
