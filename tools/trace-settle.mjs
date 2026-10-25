/**
 * 抓「打字停下后那段 650ms 长任务」：tracing 全量事件里按耗时排序，看它在干什么。
 * 用法: node tools/trace-settle.mjs [file] [blockType]
 */
import { launch, sleep } from './cdp-lib.mjs'

const FILE = process.argv[2] || 'big5.md'
const BLOCK = process.argv[3] || 'heading'

const main = async () => {
  const p = await launch('about:blank', { headless: process.env.HEADFUL !== '1' })
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
      await H.caretToBlockByType('${BLOCK}');
      return 1;
    `)
    await sleep(400)
    await p.eval(`window.__LT = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__LT.push({ s: e.startTime, d: e.duration }); }).observe({ entryTypes: ['longtask'] }); return 1`)

    p.on((m) => {
      if (m.method === 'Tracing.dataCollected') events.push(...(m.params.value || []))
    })
    await p.send('Tracing.start', {
      categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,toplevel',
      transferMode: 'ReportEvents',
    })
    for (let i = 0; i < 8; i++) {
      await p.insertText('a')
      await sleep(30)
    }
    const tEnd = await p.eval(`return performance.now()`)
    await sleep(1600)
    const lt = await p.eval(`return window.__LT.map((x) => ({ s: Math.round(x.s - ${tEnd}), d: Math.round(x.d) }))`)
    const done = new Promise((res) => p.on((m) => m.method === 'Tracing.tracingComplete' && res(0)))
    await p.send('Tracing.end')
    await done
    console.log('longTasks(rel to last key)', JSON.stringify(lt))
  } catch (e) {
    console.log('ERROR', String(e))
  } finally {
    await p.close()
  }

  // 找出耗时最长的 3 个 X 事件（排除整帧/任务壳）
  const skip = new Set(['ThreadControllerImpl::RunTask', 'RunTask', 'ThreadPool_RunTask', 'SequenceManager'])
  const xs = events.filter((e) => e.ph === 'X' && e.dur && !skip.has(e.name))
  xs.sort((a, b) => b.dur - a.dur)
  console.log('\n-- 耗时最高的 25 个事件 --')
  for (const e of xs.slice(0, 25)) {
    const d = e.args?.data || {}
    const extra = [d.type, d.functionName, d.url, d.lineNumber, d.nodeName, d.frame]
      .filter((x) => x !== undefined && x !== '')
      .join(' | ')
    console.log(String(Math.round(e.dur / 1000)).padStart(6), 'ms', e.name.padEnd(28), extra.slice(0, 150))
  }
  // 聚合
  const agg = new Map()
  for (const e of xs) agg.set(e.name, (agg.get(e.name) || 0) + e.dur / 1000)
  console.log('\n-- 聚合 --')
  for (const [k, v] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) {
    console.log(String(Math.round(v)).padStart(7), k)
  }
}

main()
