// Called by build.bat's :fail label: restore the four version files from the
// backup taken by bump-version.cjs, then drop the backup and build marker.
//
// Without this, a failed build leaves package.json / Cargo.toml / Cargo.lock /
// tauri.conf.json already bumped, so a retry bumps AGAIN and the version number
// drifts away from the actual binary.

const fs = require('fs')
const path = require('path')

const root = (process.env.MYMDEDIT_ROOT || path.resolve(__dirname, '..')).replace(/[\\/]$/, '') + '/'
const backupDir = path.join(root, 'output', '.version-backup')
const marker = path.join(root, 'output', '.build-start-ms')
const FILES = [
  'package.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
]

if (!fs.existsSync(backupDir)) {
  console.log('[rollback] no backup found, nothing to restore')
  process.exit(0)
}

let restored = 0
for (const f of FILES) {
  const bak = path.join(backupDir, f.replace(/[\\/]/g, '__'))
  if (!fs.existsSync(bak)) continue
  fs.copyFileSync(bak, path.join(root, f))
  restored++
}
console.log('[rollback] restored ' + restored + ' version file(s)')

// Consume the backup: a later successful build must not restore stale files.
try { fs.rmSync(backupDir, { recursive: true, force: true }) } catch { /* ignore */ }
try { fs.unlinkSync(marker) } catch { /* ignore */ }
