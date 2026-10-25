/**
 * 渲染管线归因：用 tracing 统计「打字/滚动」期间浏览器原生阶段（样式重算、布局、
 * 绘制、合成）各花了多少，判断剩余卡顿是 JS 还是渲染。
 * 用法: node tools/trace-app.mjs [file] [scenario]
 */
import { launch, sleep } from './cdp-lib.mjs'

const FILE = process.argv[2] || 'big5.md'
const SCENARIO = process.argv[3] || 'typing'

const main = async () => {
  const p = await launch('about:blank')
  const events = []
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
      await H.caretToBlockByType('paragraph');
      return 1;
    `)
    await sleep(400)

    p.on((m) => {
      if (m.method === 'Tracing.dataCollected') events.push(...(m.params.value || []))
    })
    await p.send('Tracing.start', {
      categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing',
      transferMode: 'ReportEvents',
    })
    const t0 = Date.now()
    if (SCENARIO === 'scroll') {
      const box = await p.eval(`
        const el = window.__H.scrollEl();
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2 };
      `)
      for (let i = 0; i < 30; i++) {
        await p.wheel(box.x, box.y, 500)
        await sleep(16)
      }
    } else {
      for (let i = 0; i < 25; i++) {
        await p.insertText('a')
        await sleep(25)
      }
      await sleep(600)
    }
    const wall = Date.now() - t0
    const done = new Promise((res) => {
      p.on((m) => {
        if (m.method === 'Tracing.tracingComplete') res(0)
      })
    })
    await p.send('Tracing.end')
    await done
  } catch (e) {
    console.log('ERROR', String(e))
  } finally {
    await p.close()
  }

  // 只统计主线程（renderer）上的阶段事件
  const agg = new Map()
  const evType = new Map()
  const fnAgg = new Map()
  let total = 0
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur) continue
    if (e.args?.data?.isMainThread === false) continue
    if (e.name === 'EventDispatch') {
      const ty = e.args?.data?.type || '?'
      evType.set(ty, (evType.get(ty) || 0) + e.dur / 1000)
    }
    if (e.name === 'FunctionCall') {
      const d = e.args?.data || {}
      const key = `${d.functionName || '(anon)'} @ ${(d.url || '').replace(/^https?:\/\/localhost:1420/, '').split('/').pop()}:${(d.lineNumber ?? 0) + 1}`
      fnAgg.set(key, (fnAgg.get(key) || 0) + e.dur / 1000)
    }
    const interesting = [
      'UpdateLayoutTree',
      'Layout',
      'PrePaint',
      'Paint',
      'Layerize',
      'Commit',
      'RasterTask',
      'FunctionCall',
      'EvaluateScript',
      'TimerFire',
      'EventDispatch',
      'HitTest',
    ]
    if (!interesting.includes(e.name)) continue
    agg.set(e.name, (agg.get(e.name) || 0) + e.dur / 1000)
  }
  for (const v of agg.values()) total += v
  const rows = [...agg.entries()].sort((a, b) => b[1] - a[1])
  console.log(`file=${FILE} scenario=${SCENARIO}`)
  for (const [k, v] of rows) console.log(String(Math.round(v)).padStart(8), k)
  console.log(String(Math.round(total)).padStart(8), 'TOTAL(ms)')
  console.log('\n-- EventDispatch 按事件类型 --')
  for (const [k, v] of [...evType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(String(Math.round(v)).padStart(8), k)
  }
  console.log('\n-- FunctionCall Top --')
  for (const [k, v] of [...fnAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
    console.log(String(Math.round(v)).padStart(8), k)
  }
}

main()
