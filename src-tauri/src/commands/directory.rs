//! 目录遍历命令

use serde::Serialize;
use tauri::AppHandle;

use super::allow_asset_directory;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub extension: Option<String>,
}

/// 列出目录内容，文件夹优先、按名称排序，跳过隐藏文件。
///
/// `read_dir` 是阻塞 IO，放在 `spawn_blocking` 里跑：这个命令被文件树展开、
/// 会话恢复、以及**每次文件系统事件批处理**（watcher 推送后逐目录重扫）高频调用，
/// 大目录下 read_dir 可达数十 ms，同步 command 跑在 Tauri 主线程会连带冻结整个
/// 窗口（拖动、输入全部无响应）。
#[tauri::command]
pub async fn list_directory(app: AppHandle, path: String) -> Result<Vec<FileEntry>, String> {
    // 授权需要 AppHandle，保持在阻塞调用之前完成
    // 打开/展开的文件夹视为工作区路径，授权给 asset 协议（递归，含 .assets 子目录）
    allow_asset_directory(&app, &path, true);

    tauri::async_runtime::spawn_blocking(move || list_directory_sync(&path))
        .await
        .map_err(|e| format!("List directory task failed: {e}"))?
}

/// `list_directory` 的阻塞主体
fn list_directory_sync(path: &str) -> Result<Vec<FileEntry>, String> {
    let entries =
        std::fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files: Vec<FileEntry> = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        // 跳过隐藏文件/目录（以 . 开头）
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let extension = entry
            .path()
            .extension()
            .map(|e| e.to_string_lossy().to_string());
        files.push(FileEntry {
            name,
            path,
            is_dir,
            extension,
        });
    }

    // 排序：目录优先，再按名称不区分大小写。
    //
    // 注意不要写成 `sort_by(|a,b| ... a.name.to_lowercase().cmp(&b.name.to_lowercase()))`：
    // 比较器会被调用 O(n log n) 次，而每次比较都要为两个文件名各分配一个 String
    // （1000 项 ≈ 1 万次比较 ≈ 2 万次堆分配），中文文件名尤其吃亏。
    // 这里改用 sort_by_cached_key：每个元素只算一次键；
    // 随后的 is_dir 排序用 Rust 的稳定排序，不会打乱已排好的名称顺序。
    files.sort_by_cached_key(|f| f.name.to_lowercase());
    files.sort_by(|a, b| b.is_dir.cmp(&a.is_dir));

    Ok(files)
}