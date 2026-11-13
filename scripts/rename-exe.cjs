// Copy the freshly built binary into output/ as MyMd-v<version>.exe.
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
const to = path.join(outDir, 'MyMd-v' + conf.version + '.exe')
const marker = path.join(outDir, '.build-start-ms')

if (!fs.existsSync(src)) {
  // A missing binary means the build did NOT produce anything. Reporting
  // success here used to let build.bat print "Build finished successfully"
  // while publishing nothing (or a stale exe from an earlier run).
  console.error('[rename-exe] [ERROR] No freshly built ' + conf.mainBinaryName + '.exe in target/release')
  process.exit(1)
}

// Sanity check: the exe must be from THIS build. bump-version.cjs already
// deletes the old one and writes .build-start-ms; allow 2s for filesystem
// timestamp granularity. This guards against a Rust build that silently
// failed yet left an older binary behind.
if (fs.existsSync(marker)) {
  const start = Number(fs.readFileSync(marker, 'utf8').trim())
  const mtime = fs.statSync(src).mtimeMs
  if (Number.isFinite(start) && mtime < start - 2000) {
    console.error('[rename-exe] [ERROR] ' + path.basename(src) + ' predates this build; refusing to publish a stale binary')
    process.exit(1)
  }
}

if (fs.existsSync(to)) fs.unlinkSync(to)
fs.copyFileSync(src, to)
console.log('      Ok: ' + conf.mainBinaryName + '.exe -> output/' + path.basename(to))

// Build succeeded: consume the rollback backup and the build marker.
try { fs.rmSync(path.join(outDir, '.version-backup'), { recursive: true, force: true }) } catch { /* ignore */ }
try { fs.unlinkSync(marker) } catch { /* ignore */ }
