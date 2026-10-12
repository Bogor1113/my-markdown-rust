//! 文件系统监听命令
//!
//! 递归监听当前根目录，把外部修改（新建/修改/删除/重命名）通过
//! `file-changed` 事件推送给前端，由前端刷新文件树与已打开的标签。
//!
//! 注意（notify 在 Windows 上的行为）：
//! - 一次保存会触发多条 Modify 事件（数据 + 元数据），由前端统一防抖合并；
//! - 重命名会拆成 `ModifyKind::Name(RenameMode::From)`（旧路径）与
//!   `RenameMode::To`（新路径）两个事件，前端按「同父目录」启发式配对。

use std::path::Path;
use std::sync::Mutex;

use notify::event::{ModifyKind, RenameMode};
use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, State};

use super::{allow_asset_directory, lock_ok};

/// 共享的监听器句柄。
///
/// 用 `Arc<Mutex<..>>` 而非裸 `Arc`：`Watcher::watch` 需要 `&mut self`，
/// 而事件回调要拿到同一个实例去「补注册新建目录」，必须可跨线程可变借用。
type WatcherHandle = std::sync::Arc<std::sync::Mutex<notify::RecommendedWatcher>>;

/// 当前运行的目录监听器（Tauri 托管状态，None 表示未监听）。
pub struct DirWatcher(pub Mutex<Option<WatcherHandle>>);

/// 大依赖/缓存目录段：递归监听时命中这些段的整棵子树都应跳过。
/// 只过滤几乎不可能作为 markdown 文档目录的通用词（node_modules/vendor/缓存），
/// 避免误伤用户把文档放在名字叫 build/dist/target/out 的目录下。
fn is_noise_seg(seg: &str) -> bool {
    seg.starts_with('.') || matches!(seg, "node_modules" | "vendor" | "__pycache__")
}

/// 临时/系统文件特征：编辑器临时锁文件、Office 解锁文件、缩略图等
fn is_noise_filename(name: &str) -> bool {
    // 本应用原子写的临时文件（.mymdedit-tmp-...）：每次保存都会产生
    // create/rename 事件，全部是自产自销的噪音
    if name.starts_with(".mymdedit-tmp-") {
        return true;
    }
    if name.starts_with('~') || name.starts_with('#') {
        return true;
    }
    let lower = name.to_lowercase();
    if lower == "thumbs.db" || lower == "desktop.ini" {
        return true;
    }
    ["tmp", "temp", "swp", "swo", "lock"]
        .iter()
        .any(|ext| lower.ends_with(&format!(".{ext}")))
}

/// 路径是否为需要跳过的噪音：隐藏段（.git 等）/ 大依赖目录 / 临时文件。
/// 事件过滤放 Rust 侧（而非只靠前端防抖），避免噪音事件持续占用 IPC 与 JS 主线程。
///
/// `root` 是监听根目录：只对**相对根的路径段**做隐藏段判断。
/// 若检查全部祖先，根路径里含点开头的段（如 C:\Users\x\.config\notes）会让
/// 该目录下所有事件的 parent 都命中隐藏段，监听器静默失效、永远收不到事件。
fn is_noise_path(path: &Path, root: &Path) -> bool {
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if is_noise_filename(name) {
            return true;
        }
    }
    let rel = path.strip_prefix(root).unwrap_or(path);
    rel.components().any(|c| match c {
        std::path::Component::Normal(seg) => is_noise_seg(seg.to_string_lossy().as_ref()),
        _ => false,
    })
}

/// 单次监听注册的目录数上限。
///
/// notify 在 Windows 上为**每个**目录申请一个独立的 OS 监听句柄
/// （ReadDirectoryChangesW 不支持递归）。直接用 `RecursiveMode::Recursive` 打开
/// 一个含 node_modules 的仓库目录，会连带把整棵依赖树注册进去 ——
/// 十万级文件把句柄数和注册耗时一起推高，期间主线程被占、界面直接冻结。
const MAX_WATCH_DIRS: usize = 4000;

/// 递归下钻的深度上限。文档目录正常只有 5~6 层，16 层是异常结构（超深嵌套 / 环）的兜底。
const MAX_WATCH_DEPTH: usize = 16;

/// 收集需要注册的监听目录（**不含** root 自身，由调用方补在最前）。
///
/// 逐层下钻并主动跳过：噪音段（.git / node_modules / 隐藏段）、符号链接
/// （junction / 软链可能指回祖先形成环）、超深层级、超量目录。
/// 过滤依据复用事件侧的 `is_noise_path`，保证「注册什么」与「收到什么」口径一致。
fn collect_watch_dirs(
    dir: &Path,
    root: &Path,
    depth: usize,
    out: &mut Vec<std::path::PathBuf>,
) {
    if depth > MAX_WATCH_DEPTH || out.len() >= MAX_WATCH_DIRS {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() >= MAX_WATCH_DIRS {
            return;
        }
        let path = entry.path();
        // symlink_metadata 不跟随链接：先判类型再决定要不要下钻，避免软链成环
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if !meta.is_dir() || is_noise_path(&path, root) {
            continue;
        }
        out.push(path.clone());
        collect_watch_dirs(&path, root, depth + 1, out);
    }
}

/// 开始递归监听指定目录；自动替换掉上一个监听器。
/// 事件统一以 `file-changed` 事件发给前端，payload: `{ kind, paths }`。
///
/// 逐目录以 `NonRecursive` 注册（而非直接 `Recursive`），理由见 `MAX_WATCH_DIRS`。
/// 代价是新建子目录不会自动纳入，因此事件回调里检测到「新建目录」时补注册它 ——
/// 空目录注册后，其内部后续的文件变化即可正常上报。
#[tauri::command]
pub async fn watch_directory(app: AppHandle, path: String) -> Result<(), String> {
    let root = std::path::PathBuf::from(&path);
    // 目录遍历本身是阻塞 IO：打开大仓库时递归 read_dir 要跑很久，不能占着主线程
    let root_for_walk = root.clone();
    let dirs = tauri::async_runtime::spawn_blocking(move || {
        let mut collected = Vec::new();
        collect_watch_dirs(&root_for_walk, &root_for_walk, 0, &mut collected);
        collected
    })
    .await
    .map_err(|e| format!("Failed to scan directory: {e}"))?;

    // watcher 需放进共享句柄，才能在事件回调里「补注册新目录」；回调只持 Weak，避免自引用泄漏
    let slot: std::sync::Arc<std::sync::Mutex<Option<WatcherHandle>>> =
        std::sync::Arc::new(std::sync::Mutex::new(None));
    let slot_weak = std::sync::Arc::downgrade(&slot);

    let app_for_emit = app.clone();
    let root_for_filter = root.clone();
    let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            let Ok(event) = res else { return };
            // 忽略访问类事件；重命名拆成 from/to 两个 kind 供前端配对
            let kind = match event.kind {
                EventKind::Create(_) => "create",
                EventKind::Remove(_) => "remove",
                EventKind::Modify(ModifyKind::Name(mode)) => match mode {
                    RenameMode::From => "rename-from",
                    RenameMode::To => "rename-to",
                    _ => "modify",
                },
                EventKind::Modify(_) => "modify",
                _ => return,
            };
            // 过滤隐藏路径与噪音路径（.git、node_modules、临时文件等），
            // 减少系统索引/杀软产生的持续事件对 IPC 与 JS 主线程的占用
            let paths: Vec<String> = event
                .paths
                .iter()
                .filter(|p| !is_noise_path(p, &root_for_filter))
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if paths.is_empty() {
                return;
            }

            // 新建目录：手动 NonRecursive 注册不像 Recursive 那样自动扩展，
            // 这里按需补注册（含其直接子目录），否则目录内的后续变化收不到事件。
            if kind == "create" {
                if let Some(slot) = slot_weak.upgrade() {
                    let mut new_dirs: Vec<std::path::PathBuf> = Vec::new();
                    for p in &event.paths {
                        if is_noise_path(p, &root_for_filter) {
                            continue;
                        }
                        let Ok(meta) = std::fs::symlink_metadata(p) else {
                            continue;
                        };
                        if !meta.is_dir() {
                            continue;
                        }
                        new_dirs.push(p.clone());
                        // 只下钻一层：新目录通常为空，而它自己注册之后，
                        // 其内部再新建子目录还会再触发一次 create 事件
                        collect_watch_dirs(p, &root_for_filter, 1, &mut new_dirs);
                    }
                    if !new_dirs.is_empty() {
                        if let Ok(guard) = slot.lock() {
                            if let Some(handle) = guard.as_ref() {
                                if let Ok(mut w) = handle.lock() {
                                    for d in &new_dirs {
                                        let _ = w.watch(d, RecursiveMode::NonRecursive);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let _ = app_for_emit.emit("file-changed", json!({ "kind": kind, "paths": paths }));
        })
        .map_err(|e| format!("Failed to create watcher: {e}"))?;

    let handle: WatcherHandle = std::sync::Arc::new(std::sync::Mutex::new(watcher));

    // 逐目录注册：单个子目录失败（如权限不足 / 已被删除）不阻断其余目录。
    // 锁顺序约定：这里只锁 handle（不锁 slot），回调是 slot → handle，
    // 两条路径不会同时持有两把锁，因此不存在死锁。
    let root_ok = {
        let mut w = handle
            .lock()
            .map_err(|_| "watcher lock poisoned".to_string())?;
        let root_ok = w
            .watch(root.as_path(), RecursiveMode::NonRecursive)
            .is_ok();
        for dir in dirs.iter() {
            let _ = w.watch(dir, RecursiveMode::NonRecursive);
        }
        root_ok
    };

    // 新监听器成功建立后再替换（drop）旧监听器：
    // 若根目录都注册不上，直接报错，旧监听器保持有效，不会让应用失去监听
    if !root_ok {
        return Err("Failed to watch directory".to_string());
    }
    let state = app.state::<DirWatcher>();
    *lock_ok(&slot) = Some(handle.clone());
    *lock_ok(&state.0) = Some(handle);

    // 用户选择的工作区根目录授权给 asset 协议（递归），供文档内本地图片显示
    allow_asset_directory(&app, &path, true);
    Ok(())
}

/// 停止目录监听
#[tauri::command]
pub fn stop_watching(state: State<'_, DirWatcher>) {
    let mut guard = lock_ok(&state.0);
    *guard = None;
}
