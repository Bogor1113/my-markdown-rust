/**
 * 打字期间的 CPU 采样归因：按自耗时聚合到「函数 @ 文件」。
 * 用法: node tools/profile-app.mjs [file] [scenario] [outfile]
 *   scenario: heading | paragraph | table | scroll
 */
import { launch, sleep } from './cdp-lib.mjs'
import { writeFileSync } from 'node:fs'

const FILE = process.argv[2] || 'big5.md'
const SCENARIO = process.argv[3] || 'paragraph'
const OUT = process.argv[4] || `prof-${SCENARIO}.json`
const N = Number(process.argv[5] || 20)

const pickBlock = {
  heading: `return await H.caretToBlockByType('heading')`,
  paragraph: `return await H.caretToBlockByType('paragraph')`,
  table: `return await H.caretToTableCell()`,
  scroll: '',
}[SCENARIO]

const main = async () => {
  const p = await launch('about:blank')
  let prof = null
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
      return 1;
    `)
    const info = await p.eval(`const H = window.__H; ${pickBlock || 'return null'}`)
    await sleep(600)

    let preTyped = 0
    if (SCENARIO === 'flush') {
      // 先敲一段，让防抖回写链处于「即将触发」状态，再开始采样
      for (let i = 0; i < 10; i++) await p.insertText('a')
      preTyped = 10
    }

    await p.send('Profiler.enable')
    await p.send('Profiler.setSamplingInterval', { interval: 100 })
    await p.send('Profiler.start')
    const t0 = Date.now()
    if (SCENARIO === 'scroll') {      const box = await p.eval(`
        const el = window.__H.scrollEl();
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2 };
      `)
      for (let i = 0; i < 40; i++) {
        await p.wheel(box.x, box.y, 500)
        await sleep(16)
      }
    } else if (SCENARIO === 'flush') {
      await sleep(1200)
    } else {
      for (let i = 0; i < N; i++) {
        await p.insertText('a')
        await sleep(30)
      }
      await sleep(400)
    }
    const wall = Date.now() - t0
    const { profile } = await p.send('Profiler.stop')
    prof = { scenario: SCENARIO, info, wall, n: N, profile }
  } catch (e) {
    console.log('ERROR', e)
  } finally {
    await p.close()
  }

  if (!prof) return
  const { profile } = prof
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const self = new Map()
  const total = profile.samples.length
  const dt = (profile.endTime - profile.startTime) / Math.max(1, total)
  for (const id of profile.samples) {
    const n = byId.get(id)
    if (!n) continue
    const cf = n.callFrame
    const key = `${cf.functionName || '(anonymous)'} @ ${(cf.url || '').replace(/^https?:\/\/localhost:1420/, '')}:${cf.lineNumber + 1}`
    self.set(key, (self.get(key) || 0) + dt)
  }
  const rows = [...self.entries()]
    .map(([k, us]) => ({ k, ms: Math.round((us / 1000) * 10) / 10 }))
    .sort((a, b) => b.ms - a.ms)
  const totalMs = Math.round((profile.endTime - profile.startTime) / 1000)
  const out = { scenario: SCENARIO, info: prof.info, wall: prof.wall, totalMs, samples: total, top: rows.slice(0, 40), profile }
  writeFileSync(OUT, JSON.stringify(out, null, 2))
  console.log(`total ${totalMs}ms over ${total} samples (${prof.wall}ms wall)`)
  for (const r of rows.slice(0, 25)) console.log(String(r.ms).padStart(8), r.k)
}

main()
