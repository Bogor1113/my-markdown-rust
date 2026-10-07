pub mod association;
pub mod directory;
pub mod file;
pub mod pdf;
pub mod pdf_outline;
pub mod search;
pub mod watcher;

use std::collections::HashSet;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::sync::{Mutex, MutexGuard, OnceLock};
use tauri::{AppHandle, Manager};

/// 已向 asset 协议作用域放行过的 (目录, recursive) 集合。
///
/// tauri 的 `allow_directory` 只追加、不提供移除，且作用域匹配是线性扫描；
/// 长会话里反复打开文档/保存图片会无限膨胀条目。这里进程内去重，
/// 同一目录同参数只真正放行一次。
fn allowed_dirs() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

/// 把目录加入 asset 协议作用域（用于在编辑器中显示本地图片）。
///
/// 背景：asset 协议（convertFileSrc 生成的 `http://asset.localhost/...`）默认不应
/// 放行任意文件——恶意文档里的图片 URL 可能借此加载本机任意路径。因此只授权用户
/// 主动打开过的目录，而非配置里静态放行 `**`：
/// - 打开文件夹 → 授权整个工作区（递归）；
/// - 打开文档 → 授权其所在目录（递归，含 `.assets` 子目录及相对路径图片）；
/// - 保存图片 → 授权目标 `.assets` 目录（仅直接子文件）。
///
/// 授权幂等（HashSet 去重），重复调用无副作用、不膨胀作用域。
pub fn allow_asset_directory(app: &AppHandle, dir: &str, recursive: bool) {
    // key 里带上 recursive：同一目录先非递归再递归放行属于「升级」，需要真正放行一次
    let key = if recursive { format!("{dir}\u{0}R") } else { format!("{dir}\u{0}F") };
    if !lock_ok(allowed_dirs()).insert(key) {
        return;
    }
    let _ = app.asset_protocol_scope().allow_directory(dir, recursive);
}

/// 取锁并容忍 Mutex 中毒。
///
/// 直接用 `lock().unwrap()` 时，一旦某个持锁线程 panic，Mutex 会进入中毒状态，
/// 之后**所有**取锁点都会 panic——托盘「退出程序」路径上 panic 会让应用无法退出。
/// 这里统一用 `into_inner()` 恢复数据（本项目这些 Mutex 只保护简单容器，
/// 不存在「部分修改导致结构不一致」的风险），把 panic 的破坏范围限制在单点。
pub fn lock_ok<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// 原子写文件：写同目录临时文件 → fsync → rename 覆盖。
///
/// 直接 `std::fs::write(path, data)` 的语义是 `truncate + write`：
/// 文件会先被清零，再写入新内容。这个窗口内一旦发生进程崩溃、系统断电、磁盘写满、
/// 杀毒软件拦截或网盘同步冲突，用户拿到的就是被截断/清零的文档，且无法恢复。
///
/// 改成分两步后，目标文件要么保持旧内容（写临时文件阶段失败），
/// 要么整体切换到新内容（rename 是原子操作），不存在中间态。
/// Windows 上 `MoveFileEx(MOVEFILE_REPLACE_EXISTING)`、`std::fs::rename` 均保证原子性。
///
/// 注意：临时文件与目标文件必须在**同一分区**，否则 rename 会退化为「复制+删除」，
/// 失去原子性——这里用 `with_extension` 保证同目录，因此一定同分区。
pub fn atomic_write(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let tmp = match path.file_name() {
        Some(name) => {
            let mut tmp_name = std::ffi::OsString::from(".mymdedit-tmp-");
            tmp_name.push(name);
            path.with_file_name(tmp_name)
        }
        None => path.with_extension("mymdedit-tmp"),
    };

    // 先写临时文件并强制落盘（sync_all 保证数据真正进入磁盘而非只进页缓存）
    match (|| -> std::io::Result<()> {
        let mut f = File::create(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?;
        Ok(())
    })() {
        Ok(()) => {}
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            return Err(e);
        }
    }

    // 原子替换；失败时清理临时文件，避免留下垃圾
    match std::fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            Err(e)
        }
    }
}
