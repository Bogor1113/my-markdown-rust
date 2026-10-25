/**
 * 定位「打字停下后那一段长任务」（回写/大纲/React 结算）到底花在哪。
 * 做法：全程采样 CPU，同时用 longtask 观察器记录长任务时间窗，
 * 分析时只统计落在长任务窗口内的采样，并打印其调用链。
 * 用法: node tools/profile-settle.mjs [file] [n] [outfile]
 */
import { launch, sleep } from './cdp-lib.mjs'
import { writeFileSync } from 'node:fs'

const FILE = process.argv[2] || 'big5.md'
const N = Number(process.argv[3] || 20)
const OUT = process.argv[4] || 'prof-settle.json'

const main = async () => {
  const p = await launch("about:blank", { headless: process.env.HEADFUL !== "1" })
  let profile = null
  let lt = []
  let tEndAbs = 0
  let typing = []
  try {
    await p.goto(`http://localhost:1420/tests/app.html?files=${FILE}`)
    await p.waitFor('window.__H && window.__H.ready', 60000, 'ready')
    await p.eval(`
      const H = window.__H;
      await H.openWorkspace('C:\\\\work');
      await H.open('C:\\\\work\\\\${FILE}', { skipLargeConfirm: true });
      await H.waitFor(() => {
        const d = document.querySelector('.milkdown [contenteditable="true"]');
        return d && d.textContent.length > 1000;
      }, 40000, 'editable');
      await H.sleep(1500);
      await H.caretToBlockByType('${process.argv[5] || 'paragraph'}');
      window.__LT = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__LT.push({ s: e.startTime, d: e.duration }); })
        .observe({ entryTypes: ['longtask'] });
      return 1;
    `)
    await sleep(300)
    await p.send('Profiler.enable')
    await p.send('Profiler.setSamplingInterval', { interval: 100 })
    await p.send('Profiler.start')
    for (let i = 0; i < N; i++) {
      const dt = await p.insertText('a')
      typing.push(Math.round(dt * 10) / 10)
      await sleep(20)
    }
    const tEnd = await p.eval(`return performance.now()`)
    // tEnd 是页面 performance.now() 的绝对值，长任务窗口以它为基准换算
    await sleep(2600)
    const r = await p.send('Profiler.stop')
    profile = r.profile
    tEndAbs = tEnd
    lt = await p.eval(`return window.__LT.map((x) => ({ s: Math.round(x.s - ${tEnd}), d: Math.round(x.d) }))`)
  } catch (e) {
    console.log('ERROR', String(e))
  } finally {
    await p.close()
  }
  if (!profile) return

  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parentOf = new Map()
  for (const n of profile.nodes) for (const c of n.children || []) parentOf.set(c, n.id)
  // 每个采样点的绝对时间（CDP 的 startTime/timeDeltas 是微秒，performance.now() 是毫秒）
  let t = profile.startTime
  const times = []
  for (const d of profile.timeDeltas) {
    t += d
    times.push(t / 1000)
  }
  const clean = (u) => (u || '').replace(/^https?:\/\/localhost:1420/, '').replace(/^.*node_modules\/\.vite\/deps\//, 'dep:')
  void times[0]
  // 长任务窗口统一换算成相对 performance.now() 的时间轴：profile 的 startTime 与
  // page performance.now() 同一基准（同一渲染进程），可直接比较。
  const windows = lt.map((x) => ({ from: tEndAbs + x.s, to: tEndAbs + x.s + x.d, dur: x.d }))
  const inWin = (ts) => windows.some((w) => ts >= w.from && ts <= w.to)

  const own = new Map()
  const leaf = new Map()
  let counted = 0
  for (let i = 0; i < profile.samples.length; i++) {
    const ts = times[i]
    if (!inWin(ts)) continue
    counted++
    const n = byId.get(profile.samples[i])
    if (!n) continue
    const lk = `${n.callFrame.functionName || '(anon)'} @ ${clean(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`
    leaf.set(lk, (leaf.get(lk) || 0) + 1)
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
    own.set(k, (own.get(k) || 0) + 1)
  }
  const idt = (profile.endTime - profile.startTime) / Math.max(1, profile.samples.length) / 1000
  const fmt = (m) => [...m.entries()].map(([k, v]) => ({ ms: Math.round(v * idt), k })).sort((a, b) => b.ms - a.ms)
  const out = {
    file: FILE,
    typing,
    longTasks: lt,
    windowMs: Math.round(windows.reduce((a, b) => a + b.dur, 0)),
    countedSamples: counted,
    app: fmt(own).slice(0, 20),
    leaf: fmt(leaf).slice(0, 20),
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2))
  console.log('typing(ms/键)', typing.join(','))
  console.log('longTasks(rel,ms)', JSON.stringify(lt))
  console.log('\n-- 长任务窗口内的应用层归因 --')
  for (const r2 of out.app) console.log(String(r2.ms).padStart(7), r2.k)
  console.log('\n-- 叶子热点 --')
  for (const r2 of out.leaf.slice(0, 12)) console.log(String(r2.ms).padStart(7), r2.k)
}

main()
