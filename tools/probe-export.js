// 探针：大文件「刚打开就导出」时，导出的 HTML 里代码高亮是否完整
// 步骤：打开 big5.md → 只等 300ms（此时后台只补了一小部分）→ 点导出 HTML → 读 mock 写出的文件
const H = window.__H
const out = {}
await H.sleep(300)

window.__MOCK__.presets.savePath = 'C:\\work\\out-hl.html'
window.__MOCK__.calls.length = 0

const trigger = [...document.querySelectorAll('button')].find((b) => b.getAttribute('title') === '导出')
if (!trigger) return { error: 'no-export-btn' }
trigger.click()
await H.sleep(400)
const items = [...document.querySelectorAll('.mditor-glass-menu button')]
const htmlBtn = items.find((b) => /HTML/.test(b.textContent || ''))
if (!htmlBtn) return { error: 'no-html-item', items: items.map((b) => b.textContent) }
htmlBtn.click()

// 等导出完成（write_file 出现）
for (let i = 0; i < 60; i++) {
  await H.sleep(200)
  if (window.__MOCK__.calls.some((c) => c.cmd === 'write_file')) break
}
const entry = [...window.__MOCK__.MEM.entries()].find(([k]) => k.toLowerCase().endsWith('out-hl.html'))
if (!entry) return { error: 'no-file', calls: [...new Set(window.__MOCK__.calls.map((c) => c.cmd))] }
const html = entry[1].content
out.len = html.length
out.preCount = (html.match(/<pre/g) || []).length
out.hljsSpanCount = (html.match(/hljs-/g) || []).length
// 每 1000 字符采样位置上的 pre 是否带 hljs span（粗查后段是否漏高亮）
const idx = html.indexOf('class="hljs')
out.firstHljsAt = idx
// 取最后 5% 区域，看有没有 hljs
const tail = html.slice(Math.floor(html.length * 0.9))
out.tailHasHljs = /hljs-/.test(tail)
out.tailPreCount = (tail.match(/<pre/g) || []).length
out.gutterCount = (html.match(/code-gutter/g) || []).length
out.lineNumCount = (html.match(/line-num/g) || []).length
out.runningScanPos = null
return out
