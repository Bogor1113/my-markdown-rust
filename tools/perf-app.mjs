/**
 * 真实 App 端到端性能基准（默认有头 Chrome = 真实 GPU 渲染，HEADFUL=0 走无头）。
 *
 * 覆盖用户实际感受的四段：
 *   1. open：打开到可编辑 / 到首屏绘制
 *   2. coldTyping：刚打开就敲字（最容易暴露「打开后卡一秒」）
 *   3. typing：稳定期连续输入
 *   4. flush：停手后的回写结算（序列化 + React）
 *   5. scroll：滚动帧率
 *
 * 用法: node tools/perf-app.mjs [file] [out]
 */
import { launch, sleep } from './cdp-lib.mjs'
import { writeFileSync } from 'node:fs'

const FILE = process.argv[2] || 'big5.md'
const OUT = process.argv[3] || `perf-app-${FILE}.json`
const HEADFUL = process.env.HEADFUL !== '0'

const main = async () => {
  const p = await launch('about:blank', { headless: !HEADFUL })
  const res = { file: FILE, headful: HEADFUL }
  const t = (x) => Math.round(x)
  try {
    await p.goto(`http://localhost:1420/tests/app.html?files=${FILE}`)
    await p.waitFor('window.__H && window.__H.ready', 60000, 'harness ready')
    await sleep(400)

    // ---------- 打开 ----------
    res.open = await p.eval(`
      const H = window.__H;
      H.startSampling();
      const t0 = performance.now();
      await H.openWorkspace('C:\\\\work');
      await H.open('C:\\\\work\\\\${FILE}', { skipLargeConfirm: true });
      await H.waitFor(() => {
        const d = document.querySelector('.milkdown [contenteditable="true"]');
        return d && d.textContent.length > 1000;
      }, 60000, 'editable');
      const editableMs = performance.now() - t0;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 300));
      const afterPaintMs = performance.now() - t0;
      const s = H.stopSampling();
      return { editableMs, afterPaintMs, longTasks: s.longTasks, frameMax: s.frameMax, state: H.state() };
    `)

    // ---------- 冷输入：刚打开就敲 6 个字符 ----------
    await p.eval(`window.__H.startSampling(); await window.__H.caretToBlock(6); return 1`)
    const cold = []
    for (let i = 0; i < 6; i++) {
      cold.push(Math.round((await p.insertText('测')) * 10) / 10)
      await sleep(30)
    }
    const coldStats = await p.eval(`return window.__H.stopSampling()`)
    res.coldTyping = { perCall: cold, ...coldStats }
    res.coldTyping.perCall = cold

    // ---------- 稳定期输入 ----------
    await p.eval(`return window.__H.sleep(2500)`)
    const caret = await p.eval(`
      const H = window.__H;
      const info = await H.caretToBlockByType('paragraph');
      H.startSampling();
      return info;
    `)
    res.caret = caret
    const perCall = []
    for (let i = 0; i < 40; i++) {
      perCall.push(Math.round((await p.insertText('测')) * 10) / 10)
      await sleep(20)
    }
    const typeStats = await p.eval(`return window.__H.stopSampling()`)
    res.typing = { perCall, perCallP50: perCall.slice().sort((a, b) => a - b)[20], perCallMax: Math.max(...perCall), ...typeStats }

    // ---------- 停手后的结算 ----------
    res.flush = await p.eval(`
      const H = window.__H;
      H.startSampling();
      await H.sleep(1200);
      return H.stopSampling();
    `)

    // ---------- 滚动 ----------
    const box = await p.eval(`
      const el = window.__H.scrollEl();
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    `)
    res.scrollBox = box
    await p.eval(`window.__H.startSampling(); return 1`)
    const N = Number(process.env.SCROLL_N || 30)
    for (let i = 0; i < N; i++) {
      await p.wheel(box.x, box.y, 400)
      await sleep(16)
    }
    await sleep(300)
    res.scroll = await p.eval(`return window.__H.stopSampling()`)

    res.errors = [...new Set(p.errors)].slice(0, 5)
    res.finalState = await p.eval(`return window.__H.state()`)
  } catch (e) {
    res.error = String(e)
    res.logs = p.logs.slice(-20)
  } finally {
    await p.close()
  }
  writeFileSync(OUT, JSON.stringify(res, null, 2))
  const brief = {
    open: res.open && {
      editableMs: t(res.open.editableMs),
      paintMs: t(res.open.afterPaintMs),
      longTasks: res.open.longTasks.slice(0, 6),
      tabLen: res.open.state?.tabs?.[0]?.len,
    },
    coldTyping: res.coldTyping && { perCall: res.coldTyping.perCall, inputMax: res.coldTyping.inputMax, longTasks: res.coldTyping.longTasks },
    typing: res.typing && { p50: res.typing.perCallP50, max: res.typing.perCallMax, inputP90: res.typing.inputP90, jank: res.typing.jank, frames: res.typing.frames },
    flush: res.flush && { longTasks: res.flush.longTasks, frameMax: res.flush.frameMax },
    scroll: res.scroll && { p90: res.scroll.frameP90, max: res.scroll.frameMax, jankPct: res.scroll.jankPct, longTasks: res.scroll.longTasks.slice(0, 6) },
    outline: res.finalState?.outline,
    error: res.error,
  }
  console.log(JSON.stringify(brief, null, 2))
}

main()
