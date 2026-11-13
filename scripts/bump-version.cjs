// Step 1 of build.bat: version bump + build-start marker + stale-artifact removal.
//
// Moved out of the inline `node -e "..."` in build.bat because cmd.exe mangles
// long inline payloads containing ( ) > = and quotes. It also makes the two
// safety guarantees explicit:
//   1. Back up the four version files BEFORE writing anything, so a failed
//      build can be rolled back (build.bat calls version-rollback.cjs).
//   2. Delete the previous release exe, so a failed/incremental Rust build
//      can never leave an OLD binary in target/release for rename-exe.cjs to
//      publish under the NEW version number.
//
// Requires MYMDEDIT_ROOT (set by build.bat) and MYMDEDIT_BUMP.

const fs = require('fs')
const path = require('path')

const root = (process.env.MYMDEDIT_ROOT || path.resolve(__dirname, '..')).replace(/[\\/]$/, '') + '/'
const bump = process.env.MYMDEDIT_BUMP || 'patch'

const FILES = [
  'package.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
]
const backupDir = path.join(root, 'output', '.version-backup')
const marker = path.join(root, 'output', '.build-start-ms')

function fail(msg) {
  console.error('[bump-version] [ERROR] ' + msg)
  process.exit(1)
}

function backupName(f) {
  return f.replace(/[\\/]/g, '__')
}

try {
  const conf = JSON.parse(fs.readFileSync(root + 'src-tauri/tauri.conf.json', 'utf8'))
  if (!conf.mainBinaryName) fail('tauri.conf.json has no mainBinaryName')

  // 1) Back up the four files byte-for-byte before any write.
  fs.mkdirSync(backupDir, { recursive: true })
  for (const f of FILES) {
    const from = path.join(root, f)
    if (!fs.existsSync(from)) fail('missing ' + f)
    fs.copyFileSync(from, path.join(backupDir, backupName(f)))
  }

  // 2) Report (but do not block on) a pre-existing version mismatch.
  //    The old script silently overwrote three files from tauri.conf.json and
  //    thereby hid drift; surfacing it lets a human notice a bad baseline.
  const pkg = JSON.parse(fs.readFileSync(root + 'package.json', 'utf8'))
  const cargoToml = fs.readFileSync(root + 'src-tauri/Cargo.toml', 'utf8')
  const cargoVer = (cargoToml.match(/^version\s*=\s*"([^"]+)"/m) || [])[1]
  const versions = {
    'tauri.conf.json': conf.version,
    'package.json': pkg.version,
    'Cargo.toml': cargoVer,
  }
  if (new Set(Object.values(versions).filter(Boolean)).size > 1) {
    console.log('[bump-version] [WARN] version mismatch before bump: ' + JSON.stringify(versions))
  }

  // 3) Compute the next version. "no" keeps the current one (debug / retry).
  let [mj, mi, p] = String(conf.version).split('.').map(Number)
  if (![mj, mi, p].every(Number.isFinite)) fail('invalid tauri.conf.json version: ' + conf.version)
  if (bump === 'major') { mj++; mi = 0; p = 0 }
  else if (bump === 'minor') { mi++; p = 0 }
  else if (bump === 'patch') { p++ }
  else if (bump !== 'no') fail('unknown bump mode: ' + bump)
  const next = bump === 'no' ? conf.version : [mj, mi, p].join('.')
  console.log('[1/3] Version: ' + conf.version + ' => ' + next + (bump === 'no' ? ' (no bump)' : ''))

  if (next !== conf.version) {
    pkg.version = next
    conf.version = next
    fs.writeFileSync(root + 'package.json', JSON.stringify(pkg, null, 2) + '\n')
    fs.writeFileSync(root + 'src-tauri/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n')
    const newCargo = cargoToml.replace(/(^version\s*=\s*")[^"]+(")/m, '$1' + next + '$2')
    fs.writeFileSync(root + 'src-tauri/Cargo.toml', newCargo)
    let lock = fs.readFileSync(root + 'src-tauri/Cargo.lock', 'utf8')
    // \r?\n: Cargo.lock may be CRLF; the old hard-coded \n silently missed it.
    lock = lock.replace(/(name\s*=\s*"mymdedit"\r?\nversion\s*=\s*")[^"]+(")/, '$1' + next + '$2')
    fs.writeFileSync(root + 'src-tauri/Cargo.lock', lock)
    console.log('      Updated package.json / Cargo.toml / Cargo.lock / tauri.conf.json')
  }

  // 4) Remove the stale release exe. Cargo may skip relinking when sources are
  //    unchanged; without this, rename-exe.cjs would copy last build's binary.
  const exe = path.join(root, 'src-tauri', 'target', 'release', conf.mainBinaryName + '.exe')
  if (fs.existsSync(exe)) {
    fs.unlinkSync(exe)
    console.log('      Removed stale ' + conf.mainBinaryName + '.exe from target/release')
  }

  // 5) Marker for rename-exe.cjs (mtime sanity check).
  fs.writeFileSync(marker, String(Date.now()))
} catch (e) {
  fail(String((e && e.stack) || e))
}
