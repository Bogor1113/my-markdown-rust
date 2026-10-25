/**
 * 极简 CDP 驱动：无头 Chrome 打开页面 → 收集控制台日志 → 等结果文件出现。
 *
 * 用法: node tools/cdp.mjs <url> <resultFile> [timeoutMs] [evalScript]
 *   resultFile 出现且内容非空即视为完成（由 collector.mjs 写入）。
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL_ = process.argv[2]
const RESULT = process.argv[3] || ''
const TIMEOUT = Number(process.argv[4] || 120000)
const EVAL = process.argv[5] || ''
const PORT = 9300 + Math.floor(Math.random() * 90)

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))

const userDir = mkdtempSync(join(tmpdir(), 'cdp-'))
if (RESULT && existsSync(RESULT)) rmSync(RESULT)

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDir}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--window-size=1440,950',
    '--force-device-scale-factor=1',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function httpJson(path) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${path}`)
      if (r.ok) return await r.json()
    } catch {
      /* 还没起来 */
    }
    await sleep(100)
  }
  throw new Error('DevTools 未就绪')
}

let msgId = 0
function makeClient(ws) {
  const waiters = new Map()
  const listeners = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && waiters.has(msg.id)) {
      const { resolve, reject } = waiters.get(msg.id)
      waiters.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    } else if (msg.method) {
      for (const l of listeners) l(msg)
    }
  })
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++msgId
      waiters.set(id, { resolve, reject })
      const msg = { id, method, params }
      if (sessionId) msg.sessionId = sessionId
      ws.send(JSON.stringify(msg))
    })
  return { send, on: (fn) => listeners.push(fn) }
}

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener('open', () => resolve(ws))
    ws.addEventListener('error', (e) => reject(e))
  })
}

const logs = []
const errors = []

const main = async () => {
  const ver = await httpJson('/json/version')
  const browserWs = await openWs(ver.webSocketDebuggerUrl)
  const browser = makeClient(browserWs)
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })

  // 会话内消息必须带顶层 sessionId（flatten 模式）
  const sess = {
    send: (method, params = {}) => browser.send(method, params, sessionId),
  }
  browser.on((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || [])
        .map((a) => (a.value !== undefined ? a.value : a.description || a.type))
        .join(' ')
      if (msg.params.type === 'error' || msg.params.type === 'warning') errors.push(text)
      logs.push(text)
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      errors.push('EXCEPTION ' + (d.exception?.description || d.text))
    }
  })

  await sess.send('Runtime.enable')
  await sess.send('Page.enable')
  await sess.send('Log.enable')
  await sess.send('Page.navigate', { url: URL_ })

  const t0 = Date.now()
  let done = false
  while (Date.now() - t0 < TIMEOUT) {
    if (RESULT && existsSync(RESULT)) {
      const raw = readFileSync(RESULT, 'utf8')
      if (raw.trim().length > 2) {
        done = true
        break
      }
    }
    if (!RESULT) {
      await sleep(2000)
      done = true
      break
    }
    await sleep(250)
  }

  if (EVAL) {
    try {
      const r = await sess.send('Runtime.evaluate', {
        expression: EVAL,
        awaitPromise: true,
        returnByValue: true,
      })
      logs.push('EVAL ' + JSON.stringify(r.result?.value ?? r.result))
    } catch (e) {
      errors.push('EVAL-ERR ' + e.message)
    }
  }

  console.log(logs.join('\n'))
  if (errors.length) console.log('\n--- CONSOLE ERRORS/WARN ---\n' + errors.join('\n'))
  console.log(done ? '\n[OK] result collected' : '\n[TIMEOUT] no result')
  if (!done) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error('DRIVER ERROR', e)
    process.exitCode = 2
  })
  .finally(async () => {
    try {
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
    process.exit(process.exitCode || 0)
  })
