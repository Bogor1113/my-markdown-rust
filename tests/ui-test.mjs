/**
 * 真实应用级 UI 全量回归。
 *
 * 做法：在 Chrome 里挂载**完整 App**（Tauri IPC 用 tests/tauri-shim.js 的虚拟文件系统
 * 模拟），先跑关键业务流（编辑命令 / 文件操作 / 保存 / 查找替换 / 全局搜索 / 命令面板 /
 * 设置 / 主题 / 片段 / 大纲跳转 / 源码模式 / 状态栏开关 / 导出 / 校验），
 * 最后再做一轮「把所有按钮都点一遍」的巡检，确保没有按钮点了报错或让界面崩掉。
 *
 * 用法: node tests/ui-test.mjs [outfile]
 *   HEADFUL=1 用带窗口的 Chrome
 */
import { launch, sleep } from '../tools/cdp-lib.mjs'
import { writeFileSync } from 'node:fs'

const OUT = process.argv[2] || 'ui-test-result.json'
const HEADFUL = process.env.HEADFUL === '1'

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail).slice(0, 500) })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
}

const HELPERS = `
/** 可见性判断：不能用 offsetParent —— position:fixed 的元素（如全屏退出按钮）恒为 null */
const visible = (e) => e.getClientRects().length > 0;
window.__T = {
  errors: [],
  state: () => window.__H.state(),
  files: () => [...window.__MOCK__.MEM.entries()].map(([k, v]) => ({ path: k, dir: v.isDir, len: v.content.length })),
  calls: () => window.__MOCK__.calls.map((c) => c.cmd),
  clearCalls: () => { window.__MOCK__.calls.length = 0 },
  q: (sel) => document.querySelector(sel),
  qa: (sel) => [...document.querySelectorAll(sel)],
  text: (sel) => document.querySelector(sel)?.textContent?.trim() ?? null,
  count: (sel) => document.querySelectorAll(sel).length,
  /** 按文本/title 匹配可见按钮并点击 */
  click: (label) => {
    const els = [...document.querySelectorAll('button,[role="button"],a,div[role="menuitem"]')].filter(visible)
    const el =
      els.find((e) => (e.textContent || '').trim() === label) ||
      els.find((e) => (e.getAttribute('title') || '') === label) ||
      els.find((e) => (e.getAttribute('title') || '').includes(label)) ||
      els.find((e) => (e.textContent || '').trim().includes(label))
    if (!el) return 'not-found'
    el.scrollIntoView({ block: 'center' })
    el.click()
    return 'ok'
  },
  clickSel: (sel) => {
    const el = document.querySelector(sel)
    if (!el) return 'not-found'
    el.click()
    return 'ok'
  },
  /**
   * 按路径找文件树/标签页节点。
   * 不能写成 button[title="C:\\work\\a.md"] —— CSS 属性选择器里反斜杠是转义符，
   * 路径永远匹配不上（之前「右键重命名/删除」就是这么失败的），只能取 title 再比字符串。
   */
  byPath: (path) => [...document.querySelectorAll('button, .mditor-tab')].find((b) => {
    const t = b.getAttribute('title') || ''
    return t === path || t.endsWith('\\\\' + path)
  }),
  clickPath: (path) => {
    const el = window.__T.byPath(path)
    if (!el) return 'not-found'
    el.click()
    return 'ok'
  },
  /** 右键菜单：在指定元素上触发 contextmenu */
  ctx: (sel, x = 120, y = 240) => {
    const el = document.querySelector(sel)
    if (!el) return 'not-found'
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 10 || x, clientY: r.y + 10 || y }))
    return 'ok'
  },
  ctxPath: (path) => {
    const el = window.__T.byPath(path)
    if (!el) return 'not-found'
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 10, clientY: r.y + 10 }))
    return 'ok'
  },
  /** 按可见文本找菜单项 */
  menuItem: (label) =>
    [...document.querySelectorAll('div,button')].find((e) => visible(e) && (e.textContent || '').trim() === label) || null,
  /** 往受控 input 里写值（React 受控组件需要原生 setter + input 事件） */
  setInput: (sel, value) => {
    const el = typeof sel === 'number' ? [...document.querySelectorAll('.mditor-findbar input')][sel] : document.querySelector(sel)
    if (!el) return 'not-found'
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return 'ok'
  },
  /** 派发 Esc：焦点在输入框时由输入框处理，否则由文档级监听处理 */
  esc: () => {
    const active = document.activeElement
    const fire = (t) => {
      t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }))
      t.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }))
    }
    if (active && active !== document.body) fire(active)
    fire(document)
    fire(window)
    return 'ok'
  },
}
window.addEventListener('error', (e) => window.__T.errors.push(String(e.message)))
window.addEventListener('unhandledrejection', (e) => window.__T.errors.push('REJ:' + String(e.reason)))
'ready'
`

/** 打开工作区与两个文件，进入可测状态 */
const setup = async (p) => {
  await p.goto('http://localhost:1420/tests/app.html?files=functest.md,big.md')
  await p.waitFor('window.__H && window.__H.ready', 60000, 'harness')
  await p.eval(HELPERS)
  await sleep(400)
  await p.eval(`
    const H = window.__H;
    await H.openWorkspace('C:\\\\work');
    await H.open('C:\\\\work\\\\functest.md', { skipLargeConfirm: true });
    await H.waitFor(() => !!document.querySelector('.milkdown [contenteditable="true"]'), 20000, 'editor');
    await H.sleep(900);
    return 1
  `)
}

const run = async (p) => {
  await setup(p)
  check('启动：打开工作区并载入文档', (await p.eval(`return window.__T.state().tabs.length`)) === 1, JSON.stringify(await p.eval('return window.__T.state()')))
  check('编辑器渲染 Markdown 结构', (await p.eval(`return window.__T.count('.milkdown h1') > 0 && window.__T.count('.milkdown table') > 0`)) === true)

  // ============ 编辑命令 ============
  const boldOk = await p.eval(`
    const H = window.__H;
    const ed = H.store.getState().editor;
    const out = await ed.action(async (ctx) => {
      const view = ctx.get(H.m.editorViewCtx);
      const doc = view.state.doc;
      let from = -1, to = -1;
      doc.descendants((n, pos) => {
        if (from < 0 && n.isText && n.text.length > 8 && n.marks.length === 0) { from = pos + 1; to = pos + 6 }
        return from < 0
      });
      if (from < 0) return 'no-text';
      const { TextSelection } = await import('/node_modules/.vite/deps/@milkdown_kit_prose_state.js');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, from, to)));
      return 'ok:' + from + '-' + to;
    });
    await H.sleep(150);
    window.__T.click('粗体 (Ctrl+B)');
    await H.sleep(250);
    return { out, strong: window.__T.count('.milkdown strong') };
  `)
  check('工具栏「粗体」：选中文本后加粗', boldOk.strong >= 1, JSON.stringify(boldOk))

  const h1Ok = await p.eval(`
    window.__T.click('一级标题');
    await window.__H.sleep(300);
    return window.__T.count('.milkdown h1')
  `)
  check('工具栏「H1」：段落转一级标题', h1Ok >= 2, `h1=${h1Ok}`)

  const tableDlg = await p.eval(`
    window.__T.click('表格');
    await window.__H.sleep(300);
    return { dlg: window.__T.count('.mditor-dialog'), fields: window.__T.count('.mditor-dialog input') }
  `)
  check('工具栏「表格」：弹出插入对话框', tableDlg.dlg >= 1, JSON.stringify(tableDlg))
  await p.eval(`return window.__T.esc()`)
  await sleep(200)

  // ============ 文件操作：新建 / 重命名 / 删除 ============
  const createOk = await p.eval(`
    const H = window.__H;
    // 文件树空白处右键 → 新建文件（根目录）
    const tree = [...document.querySelectorAll('div')].find((d) => d.className.includes('overflow-y-auto') && d.closest('[class*="sidebar"], aside, div') && d.querySelector('button[title]'));
    if (!tree) return 'no-tree';
    const r = tree.getBoundingClientRect();
    tree.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + r.height - 20 }));
    await H.sleep(300);
    const mk = [...document.querySelectorAll('div,button')].find((e) => e.offsetParent && (e.textContent || '').trim() === '新建文件');
    if (!mk) return 'no-menu-item';
    mk.click();
    await H.sleep(300);
    if (!window.__T.q('.mditor-dialog input')) return 'no-dialog';
    window.__T.setInput('.mditor-dialog input', 'uitest-file');
    await H.sleep(80);
    const confirm = [...document.querySelectorAll('.mditor-dialog button')].find((b) => /创建|确定/.test(b.textContent || ''));
    if (!confirm) return 'no-confirm';
    confirm.click();
    await H.sleep(700);
    return window.__T.files().some((f) => f.path.endsWith('uitest-file.md')) ? 'created' : 'not-created'
  `)
  check('文件树：右键新建文件', createOk === 'created', String(createOk))

  const renameOk = await p.eval(`
    const H = window.__H;
    window.__T.esc();
    await H.sleep(200);
    if (!window.__T.byPath('uitest-file.md')) return 'no-node';
    window.__T.ctxPath('uitest-file.md');
    await H.sleep(300);
    const item = window.__T.menuItem('重命名');
    if (!item) return 'no-rename-item';
    item.click();
    await H.sleep(300);
    if (!window.__T.q('.mditor-dialog input')) return 'no-dialog';
    window.__T.setInput('.mditor-dialog input', 'uitest-renamed');
    await H.sleep(80);
    const confirm = [...document.querySelectorAll('.mditor-dialog button')].find((b) => /确定|重命名|创建/.test(b.textContent || ''));
    confirm?.click();
    await H.sleep(700);
    return window.__T.files().some((f) => f.path.endsWith('uitest-renamed.md')) ? 'renamed' : 'not-renamed'
  `)
  check('文件树：右键重命名', renameOk === 'renamed', String(renameOk))

  const deleteOk = await p.eval(`
    const H = window.__H;
    window.__MOCK__.presets.askResult = true;
    window.__T.esc();
    await H.sleep(200);
    if (!window.__T.byPath('uitest-renamed.md')) return 'no-node';
    window.__T.ctxPath('uitest-renamed.md');
    await H.sleep(300);
    const item = window.__T.menuItem('删除');
    if (!item) return 'no-delete-item';
    item.click();
    await H.sleep(800);
    return window.__T.files().some((f) => f.path.endsWith('uitest-renamed.md')) ? 'still-there' : 'deleted'
  `)
  check('文件树：右键删除（进回收站）', deleteOk === 'deleted', String(deleteOk))

  // ============ 保存 ============
  const saveOk = await p.eval(`
    const H = window.__H;
    window.__T.esc();
    const ed = H.store.getState().editor;
    ed.action((ctx) => {
      const view = ctx.get(H.m.editorViewCtx);
      view.dispatch(view.state.tr.insertText('保存测试', 1));
    });
    await H.sleep(400);
    const dirtyBefore = H.state().tabs[0].dirty;
    window.__T.clearCalls();
    H.store.getState().contentFlusher?.();
    await H.store.getState().saveCurrentFile();
    await H.sleep(900);
    const t = H.state().tabs[0];
    return { dirtyBefore, dirtyAfter: t.dirty, wrote: window.__T.calls().includes('write_file'), len: t.len };
  `)
  check('保存：写盘并清除未保存标记', saveOk.dirtyBefore === true && saveOk.dirtyAfter === false && saveOk.wrote === true, JSON.stringify(saveOk))

  // ============ 查找替换 ============
  const findOk = await p.eval(`
    const H = window.__H;
    H.store.getState().openFind();
    await H.sleep(350);
    if (!window.__T.q('.mditor-findbar')) return { ok: false, reason: 'no-findbar' };
    window.__T.setInput('.mditor-findbar input', 'SEARCHME');
    await H.sleep(500);
    return { ok: true, matches: window.__T.count('.ProseMirror-search-match'), inputs: window.__T.count('.mditor-findbar input') };
  `)
  check('查找：输入关键词后高亮匹配', findOk.ok === true && findOk.matches >= 1, JSON.stringify(findOk))

  const replaceOk = await p.eval(`
    const H = window.__H;
    const inputs = window.__T.qa('.mditor-findbar input');
    if (inputs.length < 2) return { ok: false, reason: 'no-replace-input' };
    // 注意：不能用 '.mditor-findbar input:nth-of-type(2), .mditor-findbar input' 这类
    // 逗号选择器——querySelector 返回的是「文档序第一个命中任意选择器的元素」，
    // 结果是第一个输入框（查找）被写成了替换文本。
    window.__T.setInput(1, 'REPLACED');
    await H.sleep(250);
    // 必须按 title 精确命中「全部替换」：按文本正则 /替换/ 会先命中「替换当前」
    const btn = window.__T.qa('.mditor-findbar button').find((b) => b.getAttribute('title') === '全部替换');
    if (!btn) return { ok: false, reason: 'no-replace-btn', btns: window.__T.qa('.mditor-findbar button').map((b) => b.textContent || b.title) };
    btn.click();
    await H.sleep(600);
    const txt = document.querySelector('.milkdown').textContent || '';
    return { ok: txt.includes('REPLACED') && !txt.includes('SEARCHME'), matches: window.__T.count('.ProseMirror-search-match') };
  `)
  check('查找替换：全部替换生效', replaceOk.ok === true, JSON.stringify(replaceOk))
  await p.eval(`window.__H.store.getState().closeFind?.(); return window.__T.esc()`)
  await sleep(200)

  // ============ 全局搜索 ============
  const searchOk = await p.eval(`
    const H = window.__H;
    H.store.getState().openSearch();
    await H.sleep(400);
    const input = window.__T.q('[class*="search"] input');
    if (!input) return { ok: false, reason: 'no-input' };
    window.__T.setInput('[class*="search"] input', '标题');
    await H.sleep(1000);
    const items = window.__T.count('[class*="search"] [class*="result"], [class*="search"] li, [class*="search"] button');
    return { ok: items > 0, items };
  `)
  check('全局搜索：返回结果列表', searchOk.ok === true, JSON.stringify(searchOk))
  await p.eval(`window.__H.store.getState().closeSearch?.(); return 1`)
  await sleep(200)

  // ============ 命令面板 ============
  const paletteOk = await p.eval(`
    const H = window.__H;
    // 必须走 openPalette('commands')：直接 setState({paletteOpen:true}) 会沿用
    // 默认的 'files' 模式，量到的是文件列表而不是命令列表
    H.store.getState().openPalette('commands');
    await H.sleep(400);
    const has = !!window.__T.q('.mditor-palette');
    const items = window.__T.count('.mditor-palette button');
    // 输入过滤
    let filtered = 0;
    if (window.__T.q('.mditor-palette input')) {
      window.__T.setInput('.mditor-palette input', '导出');
      await H.sleep(300);
      filtered = window.__T.count('.mditor-palette button');
    }
    window.__T.esc();
    await H.sleep(250);
    return { has, items, filtered, closed: !window.__T.q('.mditor-palette') };
  `)
  check('命令面板：打开 / 过滤 / Esc 关闭', paletteOk.has === true && paletteOk.filtered > 0 && paletteOk.closed === true, JSON.stringify(paletteOk))

  // ============ 设置 ============
  const settingsOk = await p.eval(`
    const H = window.__H;
    window.__T.click('设置');
    await H.sleep(400);
    const opened = !!window.__T.q('.mditor-settings-body');
    const tabs = window.__T.count('.mditor-settings-tabs button');
    // 改字号，验证设置生效
    const range = window.__T.q('.mditor-settings-range');
    let fontSizeChanged = null;
    if (range) {
      const before = H.settings.getState().fontSize;
      const next = before + 2;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(range, String(next));
      range.dispatchEvent(new Event('input', { bubbles: true }));
      await H.sleep(300);
      fontSizeChanged = H.settings.getState().fontSize !== before;
    }
    // 切到第二个分页
    const tabBtns = window.__T.qa('.mditor-settings-tabs button');
    if (tabBtns[1]) { tabBtns[1].click(); await H.sleep(300) }
    const secondTabBody = window.__T.q('.mditor-settings-body')?.textContent?.length ?? 0;
    window.__T.esc();
    await H.sleep(250);
    return { opened, tabs, fontSizeChanged, secondTabBody, closed: !window.__T.q('.mditor-settings-body') };
  `)
  check('设置：打开 / 换分页 / 调字号 / 关闭', settingsOk.opened === true && settingsOk.tabs >= 2 && settingsOk.fontSizeChanged === true && settingsOk.closed === true, JSON.stringify(settingsOk))

  // ============ 主题 ============
  const themeOk = await p.eval(`
    const H = window.__H;
    const before = document.documentElement.dataset.theme;
    const trigger = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('title') || '').startsWith('主题'));
    if (!trigger) return { ok: false, reason: 'no-trigger' };
    trigger.click();
    await H.sleep(300);
    const items = [...document.querySelectorAll('.mditor-glass-menu button')];
    if (!items.length) return { ok: false, reason: 'no-menu' };
    items[items.length - 1].click();
    await H.sleep(400);
    return { ok: document.documentElement.dataset.theme !== before, before, after: document.documentElement.dataset.theme };
  `)
  check('主题菜单：切换主题生效', themeOk.ok === true, JSON.stringify(themeOk))
  // 切回暗色，避免影响后续视觉断言
  await p.eval(`window.__H.settings.getState().setTheme?.('dark'); return 1`)

  // ============ 片段库 ============
  const snippetOk = await p.eval(`
    const H = window.__H;
    window.__T.click('片段库');
    await H.sleep(400);
    const opened = /片段库/.test(document.body.innerText);
    const items = [...document.querySelectorAll('div,button')].filter((e) => e.getClientRects().length > 0 && /插入|使用/.test(e.textContent || '')).length;
    window.__T.esc();
    await H.sleep(250);
    return { opened, items };
  `)
  check('片段库：弹窗可打开', snippetOk.opened === true, JSON.stringify(snippetOk))

  // ============ 大纲跳转 ============
  /**
   * 点击中间那一项，断言「高亮的正是被点的那一项」。
   * 不点最后一项：短文档/文档末尾的标题永远滚不到视口顶端（scrollTop 会被
   * clamp 到最大值），此时高亮落到「视口顶部所在的最后一节」是 scroll-spy 的
   * 正常语义（大文档 225 个标题实测中间项 112→112 精确命中）。
   */
  const outlineOk = await p.eval(`
    const H = window.__H;
    const rows = [...document.querySelectorAll('button.truncate')];
    if (rows.length < 2) return { ok: false, reason: 'no-outline-rows' };
    const sc = document.querySelector('.milkdown');
    const before = sc.scrollTop;
    const idx = 1;
    const expected = H.store.getState().outline[idx];
    rows[idx].click();
    await H.sleep(700);
    const activeRows = [...document.querySelectorAll('button.truncate')]
      .map((r, i) => (r.className.includes('font-bold') ? i : -1))
      .filter((i) => i >= 0);
    return {
      ok: true,
      before,
      after: sc.scrollTop,
      rows: rows.length,
      clickedIdx: idx,
      activeRows,
      activePos: H.store.getState().activeOutlinePos,
      expectedPos: expected?.pos ?? null,
    };
  `)
  check(
    '大纲：点击条目跳转并高亮正确项',
    outlineOk.after >= outlineOk.before &&
      outlineOk.activeRows.length === 1 &&
      outlineOk.activeRows[0] === outlineOk.clickedIdx &&
      outlineOk.activePos === outlineOk.expectedPos,
    JSON.stringify(outlineOk),
  )

  // ============ 源码模式 ============
  const sourceOk = await p.eval(`
    const H = window.__H;
    const before = H.state().tabs[0];
    window.__T.click('源码');
    await H.sleep(800);
    const inSource = H.state().tabs[0].src === true;
    const textarea = !!window.__T.q('textarea');
    window.__T.click('源码');
    await H.sleep(1200);
    const after = H.state().tabs[0];
    return { inSource, textarea, back: after.src !== true, lenBefore: before.len, lenAfter: after.len };
  `)
  check('源码模式：可进可出且内容不丢', sourceOk.inSource === true && sourceOk.textarea === true && sourceOk.back === true && Math.abs(sourceOk.lenAfter - sourceOk.lenBefore) < 60, JSON.stringify(sourceOk))

  // ============ 状态栏开关 ============
  for (const [label, key, store] of [
    ['专注', 'focusMode', 'app'],
    ['打字机', 'typewriterMode', 'app'],
    ['拼写', 'spellcheck', 'settings'],
    ['编号', 'headingNumbering', 'settings'],
  ]) {
    const r = await p.eval(`
      const H = window.__H;
      const S = ${store === 'app' ? 'H.store' : 'H.settings'};
      const before = S.getState().${key};
      window.__T.click('${label}');
      await H.sleep(300);
      const after = S.getState().${key};
      window.__T.click('${label}');
      await H.sleep(250);
      const restored = S.getState().${key};
      return { before, after, restored };
    `)
    check(`状态栏「${label}」开关可切换且可复原`, r.after !== r.before && r.restored === r.before, JSON.stringify(r))
  }

  // ============ 全屏 ============
  const fullOk = await p.eval(`
    const H = window.__H;
    const before = H.store.getState().isFullscreen;
    window.__T.click('全屏');
    await H.sleep(400);
    const after = H.store.getState().isFullscreen;
    // 退出走悬浮按钮（全屏时标题栏/工具栏已卸载，那个按钮是唯一鼠标入口）。
    // 注意它是 position:fixed，所以 click 助手不能用 offsetParent 判可见性。
    window.__T.click('退出全屏');
    await H.sleep(400);
    return { before, after, restored: H.store.getState().isFullscreen, toolbar: window.__T.count('button[title="设置"]') };
  `)
  check(
    '状态栏「全屏」可切换且可退出（退出后工具栏回归）',
    fullOk.after !== fullOk.before && fullOk.restored === fullOk.before && fullOk.toolbar === 1,
    JSON.stringify(fullOk),
  )

  // ============ 侧栏开关（Ctrl+Shift+L）与打字机居中 ============
  const sideOk = await p.eval(`
    const H = window.__H;
    const send = (key, ctrl, shift) => window.dispatchEvent(new KeyboardEvent('keydown', {
      key, ctrlKey: !!ctrl, shiftKey: !!shift, bubbles: true, cancelable: true,
    }));
    const widthBefore = window.__T.q('aside.mditor-sidebar')?.style.width ?? null;
    const visibleBefore = window.__T.count('aside.mditor-sidebar');
    send('L', true, true);
    await H.sleep(300);
    const hidden = window.__T.count('aside.mditor-sidebar');
    send('L', true, true);
    await H.sleep(300);
    const visibleAfter = window.__T.count('aside.mditor-sidebar');
    const widthAfter = window.__T.q('aside.mditor-sidebar')?.style.width ?? null;
    return { visibleBefore, hidden, visibleAfter, widthBefore, widthAfter };
  `)
  check(
    'Ctrl+Shift+L：侧栏可隐藏并可恢复（宽度保持）',
    sideOk.visibleBefore >= 1 && sideOk.hidden === sideOk.visibleBefore - 1 && sideOk.visibleAfter === sideOk.visibleBefore && sideOk.widthBefore === sideOk.widthAfter,
    JSON.stringify(sideOk),
  )

  const twOk = await p.eval(`
    const H = window.__H;
    const send = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    const root = document.documentElement;
    // 先确保两个模式都关，避免上一轮残留
    if (H.store.getState().focusMode) H.store.getState().toggleFocusMode();
    if (H.store.getState().typewriterMode) H.store.getState().toggleTypewriterMode();
    await H.sleep(200);
    send('F8');
    await H.sleep(250);
    const focusOn = { f: H.store.getState().focusMode, t: H.store.getState().typewriterMode, cls: root.classList.contains('focus-mode'), tw: root.classList.contains('typewriter-mode') };
    send('F9');
    await H.sleep(250);
    const bothOn = { f: H.store.getState().focusMode, t: H.store.getState().typewriterMode, cls: root.classList.contains('typewriter-mode') };
    send('F8');
    await H.sleep(250);
    const onlyTw = { f: H.store.getState().focusMode, t: H.store.getState().typewriterMode, cls: root.classList.contains('focus-mode') };
    send('F9');
    await H.sleep(250);
    const allOff = { f: H.store.getState().focusMode, t: H.store.getState().typewriterMode, cls: root.classList.contains('focus-mode') || root.classList.contains('typewriter-mode') };
    return { focusOn, bothOn, onlyTw, allOff };
  `)
  check(
    'F8 专注 / F9 打字机：可独立开关且互不影响',
    twOk.focusOn.f === true && twOk.focusOn.t === false && twOk.focusOn.cls === true && twOk.focusOn.tw === false
      && twOk.bothOn.f === true && twOk.bothOn.t === true && twOk.bothOn.cls === true
      && twOk.onlyTw.f === false && twOk.onlyTw.t === true && twOk.onlyTw.cls === false
      && twOk.allOff.f === false && twOk.allOff.t === false && twOk.allOff.cls === false,
    JSON.stringify(twOk),
  )

  // ============ 导出 ============
  const exportOk = await p.eval(`
    const H = window.__H;
    // 全屏时标题栏（含导出按钮）会被卸载，先确保回到普通布局
    if (H.store.getState().isFullscreen) { window.__T.click('退出全屏'); await H.sleep(400) }
    window.__MOCK__.presets.savePath = 'C:\\\\work\\\\out.html';
    window.__T.clearCalls();
    const trigger = [...document.querySelectorAll('button')].find((b) => b.getAttribute('title') === '导出');
    if (!trigger) return { ok: false, reason: 'no-export-btn', fullscreen: H.store.getState().isFullscreen };
    trigger.click();
    await H.sleep(350);
    const items = [...document.querySelectorAll('.mditor-glass-menu button')];
    if (!items.length) return { ok: false, reason: 'no-menu' };
    const html = items.find((b) => /HTML/.test(b.textContent || ''));
    if (!html) return { ok: false, reason: 'no-html-item', items: items.map((b) => b.textContent) };
    html.click();
    await H.sleep(3000);
    const calls = [...new Set(window.__T.calls())];
    const wrote = window.__T.files().some((f) => f.path.endsWith('out.html') && f.len > 0);
    return { ok: wrote || calls.includes('write_file'), wrote, calls, toast: H.state().toast };
  `)
  check('导出 HTML：生成文件', exportOk.ok === true, JSON.stringify(exportOk))

  const exportPdfOk = await p.eval(`
    const H = window.__H;
    window.__MOCK__.presets.savePath = 'C:\\\\work\\\\out.pdf';
    window.__T.clearCalls();
    const trigger = [...document.querySelectorAll('button')].find((b) => b.getAttribute('title') === '导出');
    if (!trigger) return { ok: false, reason: 'no-export-btn' };
    trigger.click();
    await H.sleep(350);
    const pdf = [...document.querySelectorAll('.mditor-glass-menu button')].find((b) => /PDF/.test(b.textContent || ''));
    if (!pdf) { window.__T.esc(); return { ok: false, reason: 'no-pdf-item' } }
    pdf.click();
    await H.sleep(3000);
    window.__T.esc();
    return { ok: window.__T.calls().includes('export_pdf'), calls: [...new Set(window.__T.calls())] };
  `)
  check('导出 PDF：调用打印导出命令', exportPdfOk.ok === true, JSON.stringify(exportPdfOk))

  // ============ 校验链接/图片 ============
  const validateOk = await p.eval(`
    const H = window.__H;
    window.__T.click('校验链接/图片');
    await H.sleep(2000);
    const opened = /链接 \\/ 图片路径校验/.test(document.body.innerText);
    window.__T.esc();
    await H.sleep(200);
    return { opened };
  `)
  check('校验链接/图片：弹出结果面板', validateOk.opened === true, JSON.stringify(validateOk))

  // ============ 多标签 ============
  const tabOk = await p.eval(`
    const H = window.__H;
    await H.open('C:\\\\work\\\\big.md', { skipLargeConfirm: true });
    await H.sleep(1500);
    const two = H.state().tabs.length === 2;
    // 标签项是 div.mditor-tab（不是 button），选择器必须按这个类名找
    const tabsNow = [...document.querySelectorAll('.mditor-tab')];
    const first = tabsNow.find((t) => (t.getAttribute('title') || '').endsWith('functest.md'));
    if (!first) return { two, reason: 'no-first-tab', titles: tabsNow.map((t) => t.getAttribute('title')) };
    first.click();
    await H.sleep(700);
    const switched = H.state().active.endsWith('functest.md');
    // 关闭非活动标签（big.md，未修改，不需要确认）
    const bigTab = [...document.querySelectorAll('.mditor-tab')].find((t) => (t.getAttribute('title') || '').endsWith('big.md'));
    const closeBtn = bigTab?.querySelector('button[title="关闭"]');
    if (!closeBtn) return { two, switched, reason: 'no-close-btn' };
    window.__T.clearCalls();
    closeBtn.click();
    await H.sleep(900);
    return {
      two,
      switched,
      after: H.state().tabs.length,
      active: H.state().active,
      titles: [...document.querySelectorAll('.mditor-tab')].map((t) => t.getAttribute('title')),
      calls: [...new Set(window.__T.calls())],
      toast: H.state().toast,
    };
  `)
  check(
    '多标签：打开 / 切换 / 关闭',
    tabOk.two === true && tabOk.switched === true && tabOk.after === 1,
    JSON.stringify(tabOk),
  )

  const pageErrors = await p.eval(`return window.__T.errors.slice(0, 8)`)
  check('业务流全程无未捕获异常', pageErrors.length === 0, JSON.stringify(pageErrors))

  // ============ 按钮全量巡检（最后做，允许它改变状态） ============
  await setup(p)
  const sweep = await p.eval(`
    const H = window.__H;
    const skip = ['删除', '关闭', '退出', '移除', '清空', '重置']
    const total = document.querySelectorAll('button').length
    const report = []
    const errBase = window.__T.errors.length
    for (let i = 0; i < total; i++) {
      const btns = [...document.querySelectorAll('button')]
      const el = btns[i]
      if (!el || el.disabled) continue
      const label = (el.getAttribute('title') || (el.textContent || '').trim()).slice(0, 24)
      if (skip.some((k) => label.includes(k))) { report.push({ label, skipped: true }); continue }
      try {
        el.scrollIntoView({ block: 'center' })
        el.click()
        await new Promise((r) => setTimeout(r, 110))
        window.__T.esc()
        await new Promise((r) => setTimeout(r, 40))
        report.push({ label, ok: true })
      } catch (e) {
        report.push({ label, ok: false, err: String(e) })
      }
    }
    return { total, report, newErrors: window.__T.errors.slice(errBase) }
  `)
  const clickedCount = sweep.report.filter((r) => r.ok).length
  check(
    '按钮巡检：所有按钮点击均不抛异常',
    sweep.newErrors.length === 0,
    `共 ${sweep.total} 个按钮，点击 ${clickedCount} 个，跳过 ${sweep.report.filter((r) => r.skipped).length} 个；新异常 ${JSON.stringify(sweep.newErrors).slice(0, 200)}`,
  )
  // 巡检可能把界面留在全屏（标题栏已卸载），恢复后再判断存活
  await p.eval(`if (window.__H.store.getState().isFullscreen) window.__H.store.getState().toggleFullscreen(); return 1`)
  await sleep(300)
  const stillAlive = await p.eval(`return !!document.querySelector('.milkdown [contenteditable="true"]') || !!document.querySelector('.mditor-statusbar')`)
  check('按钮巡检后界面仍存活（未白屏/未崩溃）', stillAlive === true)

  // 有头模式下留一张全景截图，供人眼确认布局没被这些改动弄坏
  if (HEADFUL && p.shot) {
    await setup(p)
    await p.shot('ui-final.png')
  }
}

const main = async () => {
  const p = await launch('about:blank', { headless: !HEADFUL })
  try {
    await run(p)
  } catch (e) {
    check('测试脚本自身异常', false, String(e))
    console.log('LOGS:', p.logs.slice(-15).join('\n'))
  } finally {
    await p.close()
  }
  const pass = results.filter((r) => r.pass).length
  console.log(`\n==== ${pass}/${results.length} 通过 ====`)
  writeFileSync(OUT, JSON.stringify({ total: results.length, pass, results }, null, 2))
  process.exitCode = pass === results.length ? 0 : 1
}

main()
