/**
 * 通用探针：打开 app harness + 打开指定文件，然后执行一段自定义脚本并回传 JSON。
 * 用法: node tools/probe.mjs <file> <scriptFile>
 */
import { launch, sleep } from './cdp-lib.mjs'
import { readFileSync } from 'node:fs'

const FILE = process.argv[2] || 'big5.md'
// 支持 "a.md,b.md"：逗号分隔的全部写入虚拟文件系统，只打开第一个
const OPEN = FILE.split(',')[0]
const SCRIPT = readFileSync(process.argv[3], 'utf8')

const main = async () => {
  const p = await launch('about:blank')
  try {
    await p.goto(`http://localhost:1420/tests/app.html?files=${FILE}`)
    await p.waitFor('window.__H && window.__H.ready', 60000, 'ready')
    await p.eval(`
      const H = window.__H;
      await H.openWorkspace('C:\\\\work');
      await H.open('C:\\\\work\\\\${OPEN}', { skipLargeConfirm: true });
      await H.waitFor(() => {
        const d = document.querySelector('.milkdown [contenteditable="true"]');
        return d && d.textContent.length > 20;
      }, 40000, 'editable');
      await H.sleep(1200);
      return 1;
    `)
    const out = await p.eval(SCRIPT)
    console.log(JSON.stringify(out, null, 2))
    if (p.errors.length) console.log('\nERRORS:', p.errors.slice(0, 5))
  } catch (e) {
    console.log('PROBE ERROR', String(e))
    console.log(p.logs.slice(-20).join('\n'))
  } finally {
    await p.close()
  }
}
main()
