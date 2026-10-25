/**
 * CDP 复用库：启动无头 Chrome → 打开页面 → 提供 eval / 真实键鼠输入 / 截图。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launch(url, { width = 1440, height = 950, headless = true } = {}) {
  const port = 9300 + Math.floor(Math.random() * 400)
  const userDir = mkdtempSync(join(tmpdir(), 'cdp-'))
  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDir}`,
      ...(headless ? ['--headless=new'] : ['--window-position=40,40']),
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-ipc-flooding-protection',
      `--window-size=${width},${height}`,
      '--force-device-scale-factor=1',
      '--hide-scrollbars=false',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let ver = null
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (r.ok) {
        ver = await r.json()
        break
      }
    } catch {
      /* not ready */
    }
    await sleep(100)
  }
  if (!ver) throw new Error('DevTools 未就绪')

  const ws = new WebSocket(ver.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', () => res(0))
    ws.addEventListener('error', rej)
  })

  let id = 0
  const waiters = new Map()
  const logs = []
  const errors = []
  const handlers = []
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && waiters.has(m.id)) {
      const { resolve, reject } = waiters.get(m.id)
      waiters.delete(m.id)
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
      return
    }
    if (m.method) for (const h of handlers) h(m)
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = (m.params.args || []).map((a) => (a.value !== undefined ? a.value : a.description || a.type)).join(' ')
      logs.push(text)
      if (m.params.type === 'error') errors.push(text)
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      errors.push('EXCEPTION ' + (d.exception?.description || d.text))
    }
  })

  const raw = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id
      waiters.set(mid, { resolve, reject })
      const msg = { id: mid, method, params }
      if (sessionId) msg.sessionId = sessionId
      ws.send(JSON.stringify(msg))
    })

  const { targetId } = await raw('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true })
  const send = (method, params = {}) => raw(method, params, sessionId)

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Console.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })

  const api = {
    logs,
    errors,
    send,
    on: (h) => handlers.push(h),
    async goto(u) {
      await send('Page.navigate', { url: u })
      await sleep(300)
      await api.waitFor('document.readyState === "complete"', 60000, 'page load')
    },
    async eval(expr, timeout = 120000) {
      const r = await send('Runtime.evaluate', {
        expression: `(async () => { ${expr} })()`,
        awaitPromise: true,
        returnByValue: true,
        timeout,
      })
      if (r.exceptionDetails) {
        const d = r.exceptionDetails
        throw new Error('EVAL: ' + (d.exception?.description || d.text))
      }
      return r.result?.value
    },
    async waitFor(expr, timeout = 30000, label = expr) {
      const t0 = Date.now()
      while (Date.now() - t0 < timeout) {
        const r = await send('Runtime.evaluate', {
          expression: `Boolean(${expr})`,
          returnByValue: true,
        })
        if (r.result?.value) return Date.now() - t0
        await sleep(100)
      }
      throw new Error('waitFor timeout: ' + label)
    },
    async insertText(text) {
      const t0 = performance.now()
      await send('Input.insertText', { text })
      return performance.now() - t0
    },
    async key(key, code, keyCode) {
      const t0 = performance.now()
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode })
      return performance.now() - t0
    },
    async rect(selector) {
      return api.eval(`
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, text: (el.textContent||'').trim().slice(0,40) };
      `)
    },
    async clickAt(x, y) {
      const t0 = performance.now()
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
      return performance.now() - t0
    },
    async click(selector) {
      const r = await api.rect(selector)
      if (!r) throw new Error('no element: ' + selector)
      await api.clickAt(r.x, r.y)
      return r
    },
    async wheel(x, y, deltaY) {
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY })
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(file, Buffer.from(r.data, 'base64'))
    },
    async close() {
      try {
        ws.close()
        chrome.kill()
      } catch {
        /* ignore */
      }
      await sleep(300)
      try {
        rmSync(userDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    },
  }
  return api
}
