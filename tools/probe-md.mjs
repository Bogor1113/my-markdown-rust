/**
 * Markdown 快捷输入探针：逐条验证「打字 → 块/标记变化」是否符合 Typora 行为。
 * 用真实 CDP 键盘输入（Input.insertText / dispatchKeyEvent），不是 page 内模拟。
 */
import { launch, sleep } from './cdp-lib.mjs'

const MOD = { Alt: 1, Ctrl: 2, Meta: 4, Shift: 8 }

const RESET = `
  const view = await window.__H.view();
  const S = view.state.schema;
  const para = S.nodes.paragraph.create();
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, para));
  const Sel = view.state.selection.constructor;
  view.dispatch(view.state.tr.setSelection(Sel.near(view.state.doc.resolve(1))));
  view.focus();
  return 1;
`

const READ = `
  const view = await window.__H.view();
  const blocks = [];
  view.state.doc.forEach((n) => {
    const b = { t: n.type.name, txt: n.textContent.slice(0, 24) };
    if (n.type.name === 'heading') b.lvl = n.attrs.level;
    if (n.firstChild && n.firstChild.marks && n.firstChild.marks.length) b.marks = n.firstChild.marks.map((m) => m.type.name);
    b.inline = [];
    n.forEach((c) => {
      if (c.isText && c.marks.length) b.inline.push(c.marks.map((m) => m.type.name).join('+'));
      if (!c.isText) b.inline.push(c.type.name + (c.attrs && 'checked' in c.attrs ? ':' + c.attrs.checked : ''));
    });
    if (n.type.name.endsWith('list')) {
      n.forEach((li) => { b.kids = (b.kids || []); b.kids.push(li.type.name + (li.attrs && 'checked' in li.attrs ? ':' + li.attrs.checked : '')); });
    }
    blocks.push(b);
  });
  const sel = view.state.selection;
  return {
    blocks,
    selFrom: sel.from,
    selParent: sel.$from.parent.type.name,
    selMarks: (sel.$from.marks() || []).map((m) => m.type.name),
  };
`

const cases = [
  // ---- 标题 ----
  { name: 'H1: "# " ', type: '# ' },
  { name: 'H2: "## " ', type: '## ' },
  { name: 'H3: "### " ', type: '### ' },
  { name: 'H7: "####### " ', type: '####### ' },
  { name: 'H1: "#" + Enter', type: '#', keys: [['Enter', 'Enter', 13, 0]] },
  { name: 'H2: "##" + Enter', type: '##', keys: [['Enter', 'Enter', 13, 0]] },
  { name: 'H2 内 Enter（应出新段落）', type: '## 标题', keys: [['Enter', 'Enter', 13, 0]] },
  { name: 'H2 开头 Backspace（应变段落）', type: '## 标题', keys: [['Home', 'Home', 36, 0], ['Backspace', 'Backspace', 8, 0]] },
  // ---- 代码块 ----
  { name: '代码块: "```" + Enter', type: '```', keys: [['Enter', 'Enter', 13, 0]] },
  { name: '代码块: "```" + 空格', type: '``` ' },
  { name: '代码块: "```js" + Enter', type: '```js', keys: [['Enter', 'Enter', 13, 0]] },
  { name: '代码块: "```js " 空格', type: '```js ' },
  { name: '代码块: "~~~" + Enter', type: '~~~', keys: [['Enter', 'Enter', 13, 0]] },
  { name: '代码块: "~~~js" + Enter', type: '~~~js', keys: [['Enter', 'Enter', 13, 0]] },
  { name: '代码块: "```c++" + Enter', type: '```c++', keys: [['Enter', 'Enter', 13, 0]] },
  // ---- 引用 ----
  { name: '引用: "> "', type: '> ' },
  { name: '引用: ">" + 文字', type: '>引用文字' },
  { name: '引用: "> " + 文字', type: '> 引用文字' },
  { name: '引用: ">" + Enter', type: '>', keys: [['Enter', 'Enter', 13, 0]] },
  // ---- 列表 ----
  { name: '无序: "- "', type: '- ' },
  { name: '无序: "* "', type: '* ' },
  { name: '无序: "+ "', type: '+ ' },
  { name: '有序: "1. "', type: '1. ' },
  { name: '有序: "3. "', type: '3. ' },
  { name: '任务: "- [ ] "', type: '- [ ] ' },
  { name: '任务: "- [x] "', type: '- [x] ' },
  { name: '列表内 Enter 续行', type: '- 一', keys: [['Enter', 'Enter', 13, 0]] },
  { name: '列表空项 Enter 退出', type: '- ', keys: [['Enter', 'Enter', 13, 0]] },
  { name: '列表 Tab 缩进', type: '- 一', keys: [['Tab', 'Tab', 9, 0]] },
  // ---- 分隔线 ----
  { name: '分割线: "---"', type: '---' },
  { name: '分割线: "---" + Enter', type: '---', keys: [['Enter', 'Enter', 13, 0]] },
  { name: '分割线: "***" + 空格', type: '*** ' },
  { name: '分割线: "___" + 空格', type: '___ ' },
  // ---- 行内 ----
  { name: '加粗: **x**', type: '**x**' },
  { name: '斜体: *x*', type: '*x*' },
  { name: '下划线斜体: _x_', type: '_x_' },
  { name: '行内代码: `x`', type: '`x`' },
  { name: '删除线: ~~x~~', type: '~~x~~' },
  { name: '高亮: ==x==', type: '==x==' },
  { name: '行内公式: $x$', type: '$x$' },
  { name: '链接: [t](u)', type: '[t](https://a.com)' },
  { name: '图片: ![a](u)', type: '![a](https://a.com/x.png)' },
  // ---- 其它块 ----
  { name: '表格: "|2x2| "', type: '|2x2| ' },
  { name: '公式块: "$$" + Enter', type: '$$', keys: [['Enter', 'Enter', 13, 0]] },
  { name: '公式块: "$$" + 空格', type: '$$ ' },
  { name: '脚注: [^1]', type: '[^1]' },
  { name: '行内公式前有空格: "a $x$"', type: 'a $x$' },
  { name: '美元金额不该变公式: "价格 $5 到 $10"', type: '价格 $5 到 $10' },
]

const main = async () => {
  const p = await launch('about:blank')
  const report = []
  try {
    await p.goto('http://localhost:1420/tests/app.html?files=functest.md')
    await p.waitFor('window.__H && window.__H.ready', 60000, 'ready')
    await p.eval(`
      const H = window.__H;
      await H.openWorkspace('C:\\\\work');
      await H.open('C:\\\\work\\\\functest.md', { skipLargeConfirm: true });
      await H.waitFor(() => !!document.querySelector('.milkdown [contenteditable="true"]'), 30000, 'editable');
      await H.sleep(800);
      return 1;
    `)

    for (const c of cases) {
      await p.eval(RESET)
      await sleep(60)
      // 逐字符输入：输入规则（InputRule）是按「每次按键」匹配的，
      // 一次性 insertText 整串会让 `## 标题` 这类规则全部失效，测量结果失真。
      if (c.type) {
        for (const ch of c.type) {
          await p.insertText(ch)
          await sleep(12)
        }
      }
      if (c.keys) {
        for (const [key, code, vk, mods] of c.keys) {
          await p.send('Input.dispatchKeyEvent', {
            type: 'rawKeyDown',
            key,
            code,
            windowsVirtualKeyCode: vk,
            nativeVirtualKeyCode: vk,
            modifiers: mods,
          })
          await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers: mods })
          await sleep(40)
        }
      }
      await sleep(180)
      const r = await p.eval(READ)
      report.push({ case: c.name, ...r })
    }
    console.log(JSON.stringify(report, null, 1))
    if (p.errors.length) console.log('\nERRORS:', p.errors.slice(0, 8))
  } catch (e) {
    console.log('PROBE ERROR', String(e))
    console.log(p.logs.slice(-15).join('\n'))
  } finally {
    await p.close()
  }
}
main()
