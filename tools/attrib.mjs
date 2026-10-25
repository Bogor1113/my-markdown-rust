/**
 * 把 CPU profile 的采样按「最近的 /src/ 祖先函数」归因，看清应用层到底哪一步在耗时。
 * 用法: node tools/attrib.mjs prof-xxx.json [topN]
 */
import { readFileSync } from 'node:fs'

const file = process.argv[2]
const TOP = Number(process.argv[3] || 25)
const data = JSON.parse(readFileSync(file, 'utf8'))
const profile = data.profile
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const parentOf = new Map()
for (const n of profile.nodes) for (const c of n.children || []) parentOf.set(c, n.id)

const samples = profile.samples.length
const dt = (profile.endTime - profile.startTime) / Math.max(1, samples) / 1000 // ms per sample

const clean = (u) =>
  (u || '')
    .replace(/^https?:\/\/localhost:1420/, '')
    .replace(/^.*node_modules\/\.vite\/deps\//, 'dep:')
    .replace(/^.*node_modules\//, 'nm:')

const own = new Map() // app-level attribution
const leaf = new Map() // raw leaf
const chains = new Map()

for (const id of profile.samples) {
  let n = byId.get(id)
  if (!n) continue
  const leafKey = `${n.callFrame.functionName || '(anon)'} @ ${clean(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`
  leaf.set(leafKey, (leaf.get(leafKey) || 0) + dt)

  // 向上找最近的 /src/ 帧（应用代码）；找不到就记到 dep/browser
  let cur = n
  let appKey = null
  const stack = []
  while (cur) {
    const u = cur.callFrame.url || ''
    const fn = cur.callFrame.functionName || '(anon)'
    if (stack.length < 6) stack.push(`${fn}@${clean(u).split('/').pop()}`)
    if (/\/src\//.test(u) || /\/(tests|plugins|components|services|stores|utils)\//.test(u)) {
      appKey = `${fn} @ ${clean(u)}:${cur.callFrame.lineNumber + 1}`
      break
    }
    const pid = parentOf.get(cur.id)
    cur = pid ? byId.get(pid) : null
  }
  const key = appKey || `[非应用代码] ${leafKey}`
  own.set(key, (own.get(key) || 0) + dt)
  if (!chains.has(key)) chains.set(key, new Map())
  const ck = stack.slice(0, 4).join(' < ')
  chains.get(key).set(ck, (chains.get(key).get(ck) || 0) + dt)
}

const fmt = (m) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ ms: Math.round(v), k }))

console.log(`== ${file}  总 ${Math.round(samples * dt)}ms  场景=${data.scenario}`)
console.log('\n-- 应用层归因（采样点最近的 /src/ 帧） --')
for (const r of fmt(own).slice(0, TOP)) {
  console.log(String(r.ms).padStart(7), r.k)
  const ch = fmt(chains.get(r.k)).slice(0, 2)
  for (const c of ch) console.log('        via', c.k, `(${c.ms}ms)`)
}
console.log('\n-- 叶子热点 --')
for (const r of fmt(leaf).slice(0, 15)) console.log(String(r.ms).padStart(7), r.k)
