/**
 * Markdown 输入规则 + Typora 快捷键回归测试。
 *
 * 与 tests/ui-test.mjs 的分工：
 * · ui-test.mjs 验证「应用功能」（按钮、面板、文件操作）；
 * · 本文件验证「打字行为」——敲什么键得到什么块，是否与 Typora 一致。
 *
 * 全部使用真实键盘事件（CDP Input.insertText / dispatchKeyEvent），逐字符输入，
 * 因为输入规则（InputRule）是按每次按键匹配的，整串插入会漏掉绝大多数规则。
 *
 *   node tests/md-input-test.mjs
 */
import { launch, sleep } from '../tools/cdp-lib.mjs'

const MOD = { Alt: 1, Ctrl: 2, Meta: 4, Shift: 8 }

const KEYINFO = {
  1: ['Digit1', 49],
  2: ['Digit2', 50],
  3: ['Digit3', 51],
  4: ['Digit4', 52],
  5: ['Digit5', 53],
  6: ['Digit6', 54],
  0: ['Digit0', 48],
  '=': ['Equal', 187],
  '-': ['Minus', 189],
  k: ['KeyK', 75],
  m: ['KeyM', 77],
  q: ['KeyQ', 81],
  ']': ['BracketRight', 221],
  '[': ['BracketLeft', 219],
  t: ['KeyT', 84],
  '`': ['Backquote', 192],
  '\\': ['Backslash', 220],
  '/': ['Slash', 191],
  a: ['KeyA', 65],
  b: ['KeyB', 66],
  u: ['KeyU', 85],
  Enter: ['Enter', 13],
  Home: ['Home', 36],
}

const RESET = `
  // 源码模式切换后编辑器要重新挂载，这里等它回来再重置
  let view = await window.__H.view();
  for (let i = 0; i < 40 && !view; i++) {
    await window.__H.sleep(100);
    view = await window.__H.view();
  }
  if (!view) return 'no-view';
  const S = view.state.schema;
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, S.nodes.paragraph.create()));
  view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.near(view.state.doc.resolve(1))));
  view.focus();
  return 1;
`

const READ = `
  const view = await window.__H.view();
  const st0 = window.__H.store.getState();
  const tab0 = st0.tabs.find((t) => t.id === st0.activeTabId);
  // 源码模式下编辑器整体卸载，view 为 null —— 这本身就是要断言的「进了源码模式」
  if (!view) return { blocks: [], noEditor: true, sourceMode: !!tab0?.sourceMode, activePath: tab0?.path ?? null };
  const blocks = [];
  view.state.doc.forEach((n) => {
    const b = { t: n.type.name, txt: n.textContent };
    if (n.type.name === 'heading') b.lvl = n.attrs.level;
    if (n.attrs && 'language' in n.attrs) b.lang = n.attrs.language;
    if (n.attrs && 'checked' in n.attrs) b.checked = n.attrs.checked;
    b.marks = [];
    b.inline = [];
    n.forEach((c) => {
      if (c.isText && c.marks.length) b.marks.push(c.marks.map((m) => m.type.name).sort().join('+'));
      else if (!c.isText) b.inline.push(c.type.name);
      // 任务列表的勾选状态挂在 list_item 上（bullet_list > list_item(checked) > paragraph）
      if (c.attrs && 'checked' in c.attrs) b.checked = c.attrs.checked;
    });
    blocks.push(b);
  });
  const st = window.__H.store.getState();
  const tab = st.tabs.find((t) => t.id === st.activeTabId);
  return { blocks, sourceMode: !!tab?.sourceMode, activePath: tab?.path ?? null, tabCount: st.tabs.length, prompt: st.promptDialog?.title ?? null };
`

/** 输入规则用例：expect 接收 READ 的结果，返回是否通过 */
const inputCases = [
  { name: '# + 空格 → 一级标题', type: '# ', expect: (r) => r.blocks[0]?.t === 'heading' && r.blocks[0].lvl === 1 },
  { name: '## + 空格 → 二级标题', type: '## ', expect: (r) => r.blocks[0]?.lvl === 2 },
  { name: '###### + 空格 → 六级标题', type: '###### ', expect: (r) => r.blocks[0]?.lvl === 6 },
  { name: '####### + 空格 → 保持纯文本', type: '####### ', expect: (r) => r.blocks[0]?.t === 'paragraph' && r.blocks[0].txt === '####### ' },
  { name: '# + 回车 → 一级标题', type: '#', keys: ['Enter'], expect: (r) => r.blocks[0]?.lvl === 1 },
  { name: '标题内回车 → 新段落（不再续标题）', type: '## 标题', keys: ['Enter'], expect: (r) => r.blocks[0]?.lvl === 2 && r.blocks[1]?.t === 'paragraph' },
  { name: '``` + 回车 → 代码块', type: '```', keys: ['Enter'], expect: (r) => r.blocks[0]?.t === 'code_block' && r.blocks[0].txt === '' },
  { name: '```js + 回车 → 带语言代码块', type: '```js', keys: ['Enter'], expect: (r) => r.blocks[0]?.t === 'code_block' && r.blocks[0].lang === 'js' },
  { name: '~~~ + 回车 → 代码块（GFM 波浪围栏）', type: '~~~', keys: ['Enter'], expect: (r) => r.blocks[0]?.t === 'code_block' },
  { name: '```c++ + 回车 → 语言名允许非字母', type: '```c++', keys: ['Enter'], expect: (r) => r.blocks[0]?.t === 'code_block' && r.blocks[0].lang === 'c++' },
  { name: '> + 文字 → 引用块（不强制空格）', type: '>引用', expect: (r) => r.blocks[0]?.t === 'blockquote' && r.blocks[0].txt === '引用' },
  { name: '- + 空格 → 无序列表', type: '- ', expect: (r) => r.blocks[0]?.t === 'bullet_list' },
  { name: '1. + 空格 → 有序列表', type: '1. ', expect: (r) => r.blocks[0]?.t === 'ordered_list' },
  { name: '- [ ] + 空格 → 未勾选任务', type: '- [ ] ', expect: (r) => r.blocks[0]?.t === 'bullet_list' && r.blocks[0].checked === false },
  { name: '- [x] + 空格 → 已勾选任务', type: '- [x] ', expect: (r) => r.blocks[0]?.checked === true },
  { name: '--- → 分割线', type: '---', expect: (r) => r.blocks[0]?.t === 'hr' },
  { name: '*** + 空格 → 分割线（无残留字符）', type: '*** ', expect: (r) => r.blocks[0]?.t === 'hr' && r.blocks.length === 1 },
  { name: '**x** → 加粗且不留星号', type: '**x**', expect: (r) => r.blocks[0]?.marks.includes('strong') && r.blocks[0].txt === 'x' },
  { name: '*x* → 斜体且不留星号', type: '*x*', expect: (r) => r.blocks[0]?.marks.includes('emphasis') && r.blocks[0].txt === 'x' },
  { name: '_x_ → 斜体（下划线写法）', type: '_x_', expect: (r) => r.blocks[0]?.marks.includes('emphasis') },
  { name: '`x` → 行内代码', type: '`x`', expect: (r) => r.blocks[0]?.marks.includes('inlineCode') },
  { name: '~~x~~ → 删除线', type: '~~x~~', expect: (r) => r.blocks[0]?.marks.includes('strike_through') && r.blocks[0].txt === 'x' },
  { name: '==x== → 高亮', type: '==x==', expect: (r) => r.blocks[0]?.marks.includes('highlight') },
  { name: '$x$ → 行内公式', type: '$x$', expect: (r) => r.blocks[0]?.inline.includes('math_inline') },
  { name: '价格 $5 到 $10 → 不误判公式', type: '价格 $5 到 $10', expect: (r) => !r.blocks[0]?.inline.includes('math_inline') },
  { name: '[文字](地址) → 链接', type: '[文字](https://a.com)', expect: (r) => r.blocks[0]?.marks.includes('link') && r.blocks[0].txt === '文字' },
  { name: '![图](地址) → 图片节点', type: '![图](https://a.com/x.png)', expect: (r) => r.blocks[0]?.inline.includes('image') },
  { name: '[^1] → 脚注引用', type: '[^1]', expect: (r) => r.blocks[0]?.inline.includes('footnote_reference') },
  { name: '|2x2| + 空格 → 表格', type: '|2x2| ', expect: (r) => r.blocks[0]?.t === 'table' },
  { name: '$$ + 回车 → 公式块', type: '$$', keys: ['Enter'], expect: (r) => r.blocks[0]?.t === 'math_block' },
  { name: '( ) 自动配对且可越过', type: '(a)', expect: (r) => r.blocks[0]?.txt === '(a)' },
  { name: '嵌套括号 (()) 不产生多余括号', type: '(())', expect: (r) => r.blocks[0]?.txt === '(())' },
  { name: '中文引号自动配对', type: '「引用」', expect: (r) => r.blocks[0]?.txt === '「引用」' },
]

/** 快捷键用例 */
const keyCases = [
  { name: 'Ctrl+1 → 一级标题', type: 'abc', keys: ['1+Ctrl'], expect: (r) => r.blocks[0]?.lvl === 1 },
  { name: 'Ctrl+3 → 三级标题', type: 'abc', keys: ['3+Ctrl'], expect: (r) => r.blocks[0]?.lvl === 3 },
  { name: 'Ctrl+1 再 Ctrl+0 → 段落', type: 'abc', keys: ['1+Ctrl', '0+Ctrl'], expect: (r) => r.blocks[0]?.t === 'paragraph' },
  { name: 'Ctrl+= 两次 → 二级标题', type: 'abc', keys: ['=+Ctrl', '=+Ctrl'], expect: (r) => r.blocks[0]?.lvl === 2 },
  { name: 'Ctrl+3 再 Ctrl+- → 二级标题', type: 'abc', keys: ['3+Ctrl', '-+Ctrl'], expect: (r) => r.blocks[0]?.lvl === 2 },
  { name: 'Ctrl+Shift+K → 代码块', type: 'abc', keys: ['k+Ctrl+Shift'], expect: (r) => r.blocks[0]?.t === 'code_block' },
  { name: 'Ctrl+Shift+M → 公式块', type: 'abc', keys: ['m+Ctrl+Shift'], expect: (r) => r.blocks[0]?.t === 'math_block' },
  { name: 'Ctrl+Shift+Q → 引用', type: 'abc', keys: ['q+Ctrl+Shift'], expect: (r) => r.blocks[0]?.t === 'blockquote' },
  { name: 'Ctrl+Shift+] → 无序列表', type: 'abc', keys: [']+Ctrl+Shift'], expect: (r) => r.blocks[0]?.t === 'bullet_list' },
  { name: 'Ctrl+Shift+[ → 有序列表', type: 'abc', keys: ['[+Ctrl+Shift'], expect: (r) => r.blocks[0]?.t === 'ordered_list' },
  { name: 'Ctrl+T → 插入 3×3 表格', type: 'abc', keys: ['t+Ctrl'], synth: true, expect: (r) => r.blocks.some((b) => b.t === 'table') },
  { name: 'Ctrl+Shift+` → 行内代码', type: 'abc', keys: ['a+Ctrl', '`+Ctrl+Shift'], expect: (r) => r.blocks[0]?.marks.includes('inlineCode') },
  { name: 'Alt+Shift+5 → 删除线', type: 'abc', keys: ['a+Ctrl', '5+Alt+Shift'], expect: (r) => r.blocks[0]?.marks.includes('strike_through') },
  { name: 'Ctrl+U → 下划线', type: 'abc', keys: ['a+Ctrl', 'u+Ctrl'], expect: (r) => r.blocks[0]?.marks.includes('underline') },
  { name: 'Ctrl+U 两次 → 取消下划线', type: 'abc', keys: ['a+Ctrl', 'u+Ctrl', 'u+Ctrl'], expect: (r) => !r.blocks[0]?.marks.includes('underline') },
  { name: 'Ctrl+K → 插入链接弹窗', type: 'abc', keys: ['a+Ctrl', 'k+Ctrl'], expect: (r) => r.prompt === '插入链接' },
  { name: 'Ctrl+/ → 源码模式', type: 'abc', keys: ['/+Ctrl'], expect: (r) => r.sourceMode === true },
]

const main = async () => {
  const p = await launch('about:blank')
  const results = []
  try {
    await p.goto('http://localhost:1420/tests/app.html?files=functest.md')
    await p.waitFor('window.__H && window.__H.ready', 60000, 'ready')
    await p.eval(`
      const H = window.__H;
      await H.openWorkspace('C:\\\\work');
      await H.open('C:\\\\work\\\\functest.md', { skipLargeConfirm: true });
      await H.waitFor(() => !!document.querySelector('.milkdown [contenteditable="true"]'), 30000, 'editable');
      await H.sleep(600);
      return 1;
    `)

    const runKeys = async (combo) => {
      const parts = combo.split('+')
      const key = parts[0]
      const mods = parts.slice(1)
      const [code, vk] = KEYINFO[key] ?? [null, 0]
      let mask = 0
      for (const m of mods) mask |= MOD[m]
      await p.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key,
        code,
        windowsVirtualKeyCode: vk,
        nativeVirtualKeyCode: vk,
        modifiers: mask,
      })
      await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers: mask })
      await sleep(50)
    }

    const one = async (c, kind) => {
      await p.eval(RESET)
      await sleep(50)
      if (c.type) {
        for (const ch of c.type) {
          await p.insertText(ch)
          await sleep(10)
        }
      }
      for (const combo of c.keys ?? []) {
        if (c.synth) {
          const parts = combo.split('+')
          await p.eval(`
            const view = await window.__H.view();
            view.focus();
            const ev = new KeyboardEvent('keydown', {
              key: ${JSON.stringify(parts[0])},
              ctrlKey: ${parts.includes('Ctrl')},
              shiftKey: ${parts.includes('Shift')},
              altKey: ${parts.includes('Alt')},
              bubbles: true,
              cancelable: true,
            });
            view.dom.dispatchEvent(ev);
            return 1;
          `)
          await sleep(200)
        } else {
          await runKeys(combo)
        }
      }
      await sleep(200)
      const r = await p.eval(READ)
      const pass = !!c.expect(r)
      console.log(`${pass ? 'PASS' : 'FAIL'} [${kind}] ${c.name}${pass ? '' : ' :: ' + JSON.stringify({ src: r.sourceMode, path: r.activePath, tabs: r.tabCount, prompt: r.prompt, blocks: r.blocks.length })}`)
      results.push({ kind, name: c.name, pass, detail: r.blocks.map((b) => b.t + (b.lvl || '') + '(' + b.txt.slice(0, 16) + ')').join(' | ') + (r.sourceMode ? ' [源码]' : '') })
      if (r.prompt) {
        // 关掉弹窗，否则后续用例的输入会被弹窗挡住
        await p.eval(`window.__H.store.getState().closePrompt?.(); await window.__H.sleep(150); return 1;`)
      }
      if (r.sourceMode) {
        await p.eval(`
          await window.__H.store.getState().toggleSourceMode();
          await window.__H.waitFor(() => !!document.querySelector('.milkdown [contenteditable="true"]'), 15000, 'back to wysiwyg');
          await window.__H.sleep(300);
          return 1;
        `)
      }
    }

    for (const c of inputCases) await one(c, '输入')
    for (const c of keyCases) await one(c, '快捷键')

    // Ctrl+\ 清除格式：分两步断言
    await p.eval(RESET)
    for (const ch of 'abc') {
      await p.insertText(ch)
      await sleep(10)
    }
    await runKeys('a+Ctrl')
    await runKeys('b+Ctrl')
    const boldState = await p.eval(READ)
    await p.eval(`
      const view = await window.__H.view();
      if (view) view.focus();
      return 1;
    `)
    await runKeys('a+Ctrl')
    await runKeys('\\+Ctrl')
    await sleep(200)
    const clearedState = await p.eval(READ)
    results.push({
      kind: '快捷键',
      name: 'Ctrl+B 加粗后 Ctrl+\\ 清除格式',
      pass: boldState.blocks[0]?.marks.includes('strong') && !clearedState.blocks[0]?.marks.includes('strong'),
      detail: `加粗后=${JSON.stringify(boldState.blocks[0]?.marks)} 清除后=${JSON.stringify(clearedState.blocks[0]?.marks)}`,
    })

    // Ctrl+U 的序列化方向：文档里必须是 <u>文字</u>，不能是自定义节点名
    await p.eval(RESET)
    for (const ch of 'abc') {
      await p.insertText(ch)
      await sleep(10)
    }
    await runKeys('a+Ctrl')
    await runKeys('u+Ctrl')
    await sleep(200)
    const serialized = await p.eval(`
      const view = await window.__H.view();
      const ed = window.__H.store.getState().editor;
      if (!view || !ed) return '';
      return ed.action((ctx) => ctx.get(window.__H.m.serializerCtx)(view.state.doc));
    `)
    results.push({
      kind: '序列化',
      name: 'Ctrl+U 下划线保存为 <u>文字</u>',
      pass: /<u>abc<\/u>/.test(String(serialized)),
      detail: String(serialized).trim().slice(0, 80),
    })

    // 反过来：磁盘上已有的 <u>…</u> 打开后要变成可编辑的 underline mark，
    // 而不是不可编辑的 HTML 原子节点（否则再按 Ctrl+U 无法取消）
    const parsedMarks = await p.eval(`
      const ed = window.__H.store.getState().editor;
      if (!ed) return null;
      return ed.action((ctx) => {
        const parser = ctx.get(window.__H.m.parserCtx);
        const doc = parser('# t\\n\\n前<u>中</u>后\\n');
        let found = null;
        doc.descendants((n) => {
          if (n.isText && n.marks.some((m) => m.type.name === 'underline')) found = n.text;
        });
        return found;
      });
    `)
    results.push({
      kind: '解析',
      name: '打开 <u>中</u> → 还原成 underline mark（可继续编辑）',
      pass: parsedMarks === '中',
      detail: `解析结果=${JSON.stringify(parsedMarks)}`,
    })

    const fail = results.filter((r) => !r.pass)
    for (const r of results) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'} [${r.kind}] ${r.name} :: ${r.detail}`)
    }
    console.log(`\n==== ${results.length - fail.length}/${results.length} 通过 ====`)
    if (fail.length) process.exitCode = 1
    if (p.errors.length) console.log('页面异常：', p.errors.slice(0, 5))
  } catch (e) {
    console.log('TEST ERROR', String(e))
    process.exitCode = 1
  } finally {
    await p.close()
  }
}
main()
