/**
 * Mermaid「图 / 源码」双态交互回归（真实 App + Chrome）。
 *
 * 依赖本地 dev server：npx vite --host 127.0.0.1 --port 1420
 * 用法：node tests/mermaid-test.mjs
 *
 * 覆盖：默认只显示图（源码不可见）→ 点击图进入源码编辑 → 返回按钮 →
 *       再次进入后点击文档别处自动回到图 → 源码改动后回预览会重渲染。
 */
import { launch, sleep } from '../tools/cdp-lib.mjs'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HEADFUL = process.env.HEADFUL === '1'
const SHOT = join(tmpdir(), 'mermaid-test.png')
const PATH = 'C:\\work\\mermaid.md'
const PATH_LIT = JSON.stringify(PATH)

const MD = [
  '# Mermaid 交互测试',
  '',
  '平时只显示图，点击图才显示源码。',
  '',
  '```mermaid',
  'graph TD',
  '  A[开始] --> B{判断}',
  '  B -->|是| C[结束]',
  '  B -->|否| A',
  '```',
  '',
  '结尾段落，用来点击返回预览。',
  '',
].join('\n')

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail).slice(0, 400) })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
}

const SNAP = `(() => {
  const pm = document.querySelector('.ProseMirror');
  const containers = [...document.querySelectorAll('.mermaid-container')];
  const hidden = [...document.querySelectorAll('.mditor-mermaid-source-hidden')];
  const visible = [...document.querySelectorAll('.mditor-mermaid-source-visible')];
  let selInMermaid = false;
  try {
    window.__H.store.getState().editor?.action((ctx) => {
      const view = ctx.get(window.__H.m.editorViewCtx);
      const p = view.state.selection.$from.parent;
      selInMermaid = p.type.name === 'code_block' && p.attrs.language === 'mermaid';
    });
  } catch { /* editor 未就绪 */ }
  return {
    containers: containers.length,
    preview: containers.filter((e) => !e.classList.contains('mditor-mermaid-editing')).length,
    editingBar: containers.filter((e) => e.classList.contains('mditor-mermaid-editing')).length,
    svg: containers.reduce((n, e) => n + e.querySelectorAll('svg').length, 0),
    hidden: hidden.length,
    hiddenInvisible: hidden.every((e) => e.getClientRects().length === 0),
    visible: visible.length,
    sourceShown: visible.some((e) => e.getClientRects().length > 0),
    graphTextShown: (pm?.innerText || '').includes('graph TD'),
    backBtn: document.querySelectorAll('.mditor-mermaid-back').length,
    pre: document.querySelectorAll('pre.mditor-mermaid-source-visible').length,
    selInMermaid,
    focused: !!document.activeElement?.closest('.ProseMirror'),
  };
})()`

const snap = (p) => p.eval(`return ${SNAP}`)

const run = async (p) => {
  await p.goto('http://localhost:1420/tests/app.html?files=README.md')
  await p.waitFor('window.__H && window.__H.ready', 60000, 'harness')
  await p.eval(`
    const H = window.__H;
    window.__MOCK__.seed({ ${PATH_LIT}: ${JSON.stringify(MD)} });
    await H.openWorkspace('C:\\\\work');
    await H.open(${PATH_LIT}, { skipLargeConfirm: true });
    await H.waitFor(() => !!document.querySelector('.milkdown [contenteditable="true"]'), 20000, 'editor');
    await H.sleep(1200);
    return 1
  `)
  await p.waitFor("document.querySelector('.mermaid-container svg')", 30000, 'mermaid svg')
  await sleep(400)

  // 1) 默认预览态
  const s0 = await snap(p)
  check('载入后只有一张图、源码块被隐藏', s0.containers === 1 && s0.preview === 1 && s0.hidden === 1, JSON.stringify(s0))
  check('源码块确实不可见且正文不含 mermaid 代码', s0.hiddenInvisible && !s0.graphTextShown, JSON.stringify(s0))
  check('图渲染出 SVG', s0.svg === 1, JSON.stringify(s0))

  // 2) 点击图 → 源码编辑态（先滚到视口中央，避免首屏布局未稳导致点偏）
  await p.eval(`document.querySelector('.mermaid-container').scrollIntoView({ block: 'center' }); return 1`)
  await sleep(250)
  await p.click('.mermaid-container')
  await sleep(700)
  const s1 = await snap(p)
  check('点击图后切到源码编辑态', s1.editingBar === 1 && s1.visible === 1 && s1.sourceShown, JSON.stringify(s1))
  check('编辑态可编辑源码（光标落在 mermaid 块内）', s1.pre >= 1 && s1.backBtn === 1 && s1.graphTextShown && s1.selInMermaid && s1.focused, JSON.stringify(s1))
  check('编辑态图被工具条替换（不再有 SVG）', s1.svg === 0, JSON.stringify(s1))

  // 3) 真实键盘输入：确认源码块确实可写
  await p.insertText(' ')
  await sleep(250)
  const typed = await p.eval(`
    const H = window.__H;
    return H.store.getState().editor.action((ctx) => {
      const view = ctx.get(H.m.editorViewCtx);
      let code = null;
      view.state.doc.descendants((n) => {
        if (code === null && n.type.name === 'code_block' && n.attrs.language === 'mermaid') code = n.textContent;
        return code === null;
      });
      return code;
    });
  `)
  check('在源码块里输入会写进文档', typeof typed === 'string' && typed.includes('graph TD') && typed.startsWith(' '), JSON.stringify(typed))

  // 4) 编辑期间源码改动不触发图重渲染（退出编辑态才画）
  const changed = await p.eval(`
    const H = window.__H;
    const ed = H.store.getState().editor;
    await ed.action(async (ctx) => {
      const view = ctx.get(H.m.editorViewCtx);
      const doc = view.state.doc;
      let pos = -1;
      doc.descendants((n, p) => {
        if (pos < 0 && n.type.name === 'code_block' && n.attrs.language === 'mermaid') pos = p;
        return pos < 0;
      });
      if (pos < 0) return;
      const end = pos + doc.nodeAt(pos).nodeSize - 1;
      view.dispatch(view.state.tr.insertText('\\n%% note', end));
    });
    await H.sleep(350);
    return 1
  `)
  const s2 = await snap(p)
  check('编辑源码期间不触发重渲染', changed === 1 && s2.svg === 0 && s2.editingBar === 1, JSON.stringify(s2))

  // 4) 点「返回图表」→ 预览态并按新源码重画
  await p.click('.mditor-mermaid-back')
  await sleep(900)
  const s3 = await snap(p)
  check('返回按钮回到预览态并重渲染图', s3.preview === 1 && s3.hidden === 1 && s3.svg === 1 && !s3.graphTextShown, JSON.stringify(s3))

  // 5) 再点图进入编辑，然后点击文档别处 → 自动回到预览
  await p.click('.mermaid-container')
  await sleep(600)
  const s4 = await snap(p)
  check('可以再次点击图进入编辑', s4.editingBar === 1 && s4.visible === 1, JSON.stringify(s4))
  await p.click('.ProseMirror h1')
  await sleep(900)
  const s5 = await snap(p)
  check('点击别处自动回到图（Typora 行为）', s5.preview === 1 && s5.hidden === 1 && s5.svg === 1 && !s5.graphTextShown, JSON.stringify(s5))

  // 6) 无运行时异常
  const fatal = p.errors.filter((e) => /EXCEPTION|Uncaught|mermaid/i.test(e))
  check('全程无脚本异常', fatal.length === 0, JSON.stringify(fatal.slice(0, 5)))

  if (p.shot) await p.shot(SHOT)
  console.log('screenshot:', SHOT)
}

const main = async () => {
  const p = await launch('about:blank', { headless: !HEADFUL })
  try {
    await run(p)
  } catch (e) {
    check('测试脚本自身异常', false, String(e))
    console.log('LOGS:', p.logs.slice(-20).join('\n'))
  } finally {
    await p.close()
  }
  const pass = results.filter((r) => r.pass).length
  console.log(`\n==== ${pass}/${results.length} 通过 ====`)
  writeFileSync('mermaid-test-result.json', JSON.stringify({ total: results.length, pass, results }, null, 2))
  process.exitCode = pass === results.length ? 0 : 1
}

main()
