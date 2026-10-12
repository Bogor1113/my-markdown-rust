// Copy the freshly built binary into output/ as MyMdEdit-v<version>.exe.
//
// Why this lives in its own file instead of an inline `node -e "..."` in
// build.bat:
// cmd.exe mangles long inline node payloads. A double-quoted argument that
// contains > = ( ) and quotes gets partially eaten, and the code that reaches
// node is syntactically broken. Real failure seen on this machine:
//
//   [eval]:1
//   ...;if( '+t.mainBinaryName+'.exe -> output/'+p.basename(to));}
//   SyntaxError: Unexpected token '>'
//
// Step 1 of build.bat (the version bump) survives this only because it calls
// process.exit(0) early when the version is unchanged, so the fragile tail
// never runs. Both steps are safer as files.
//
// Requires MYMDEDIT_ROOT to be set by the caller (build.bat already does).

const fs = require('fs')
const path = require('path')

const root = (process.env.MYMDEDIT_ROOT || path.resolve(__dirname, '..')).replace(/[\\/]$/, '') + '/'
const conf = JSON.parse(fs.readFileSync(root + 'src-tauri/tauri.conf.json', 'utf8'))
const src = root + 'src-tauri/target/release/' + conf.mainBinaryName + '.exe'
const outDir = root + 'output'

fs.mkdirSync(outDir, { recursive: true })
const to = path.join(outDir, 'MyMdEdit-v' + conf.version + '.exe')

if (!fs.existsSync(src)) {
  console.log('      [WARN] No ' + conf.mainBinaryName + '.exe found in target/release')
  process.exit(0)
}

if (fs.existsSync(to)) fs.unlinkSync(to)
fs.copyFileSync(src, to)
console.log('      Ok: ' + conf.mainBinaryName + '.exe -> output/' + path.basename(to))
