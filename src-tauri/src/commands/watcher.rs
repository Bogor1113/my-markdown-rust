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
use tauri::{AppHandle, Emitter, State};

use super::{allow_asset_directory, lock_ok};

/// 当前运行的目录监听器（Tauri 托管状态，None 表示未监听）
pub struct DirWatcher(pub Mutex<Option<notify::RecommendedWatcher>>);

/// 大依赖/缓存目录段：递归监听时命中这些段的整棵子树都应跳过。
/// 只过滤几乎不可能作为 markdown 文档目录的通用词（node_modules/vendor/缓存），
/// 避免误伤用户把文档放在名字叫 build/dist/target/out 的目录下。
fn is_noise_seg(seg: &str) -> bool {
    seg.starts_with('.') || matches!(seg, "node_modules" | "vendor" | "__pycache__")
}

/// 临时/系统文件特征：编辑器临时锁文件、Office 解锁文件、缩略图等
fn is_noise_filename(name: &str) -> bool {
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
fn is_noise_path(path: &Path) -> bool {
    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if is_noise_filename(name) {
            return true;
        }
    }
    match path.parent() {
        Some(parent) => parent.components().any(|c| match c {
            std::path::Component::Normal(seg) => is_noise_seg(seg.to_string_lossy().as_ref()),
            _ => false,
        }),
        None => false,
    }
}

/// 开始递归监听指定目录；自动替换掉上一个监听器。
/// 事件统一以 `file-changed` 事件发给前端，payload: `{ kind, paths }`。
#[tauri::command]
pub fn watch_directory(
    app: AppHandle,
    state: State<'_, DirWatcher>,
    path: String,
) -> Result<(), String> {
    let app_for_emit = app.clone();
    let mut watcher = notify::recommended_watcher(
        move |res: Result<Event, notify::Error>| {
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
                .filter(|p| !is_noise_path(p))
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if paths.is_empty() {
                return;
            }
            let _ = app_for_emit.emit("file-changed", json!({ "kind": kind, "paths": paths }));
        },
    )
    .map_err(|e| format!("Failed to create watcher: {e}"))?;

    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch directory: {e}"))?;

    // 新监听器成功建立后再替换（drop）旧监听器：
    // 若 watch 失败（如目录不存在），旧监听器保持有效，不会让应用失去监听
    *lock_ok(&state.0) = Some(watcher);

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
