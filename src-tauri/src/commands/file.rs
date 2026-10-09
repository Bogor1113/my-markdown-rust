//! 文件读写命令
//!
//! 写盘统一走 `atomic_write`（临时文件 + fsync + rename），
//! 避免「截断后、写完前」的窗口内崩溃导致用户文档被清零。见 `commands/mod.rs`。

use base64::Engine as _;
use std::path::Path;
use tauri::AppHandle;

use super::{allow_asset_directory, atomic_write};

/// base64 编解码（标准 alphabet，带 padding）
const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

/// 读取文件内容
#[tauri::command]
pub fn read_file(app: AppHandle, path: String) -> Result<String, String> {
    // 打开文档 → 授权其所在目录（递归），使文档引用的本地图片可显示：
    // 含 `<文档名>.assets/`、`images/` 等相对路径以及绝对路径图片。
    // 跳过盘符根目录：直接授权整个磁盘违背收窄本意（如 C:\a.md 不授权 C:\**）
    if let Some(parent) = Path::new(&path).parent() {
        let dir = parent.to_string_lossy().to_string();
        if !dir.is_empty() && parent.parent().is_some() {
            allow_asset_directory(&app, &dir, true);
        }
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// 写入文件内容（原子写）
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    atomic_write(Path::new(&path), content.as_bytes())
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// 写入二进制文件（图片等），自动创建父目录
#[tauri::command]
pub fn save_image(app: AppHandle, path: String, bytes: Vec<u8>) -> Result<(), String> {
    write_image_bytes(&app, &path, &bytes)
}

/// 读取二进制文件内容（图片等）
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// 读取二进制文件内容，以 base64 字符串返回。
///
/// 图片走 `Vec<u8>` 时，Tauri 会把它 JSON 序列化成数字数组
/// （5MB 图片 ≈ 500 万个整数 ≈ 20MB 字符串 + JS 侧 40MB+ 数组），
/// 是导出/插图卡顿的主因。base64 只膨胀 33%，且 JS 侧一次 `atob` 即可还原。
#[tauri::command]
pub fn read_file_b64(path: String) -> Result<String, String> {
    let bytes =
        std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(B64.encode(&bytes))
}

/// 写入二进制文件（base64 载荷），自动创建父目录。
/// 与 `read_file_b64` 配对，用于替代 `Vec<u8>` 的 JSON 数组传输。
#[tauri::command]
pub fn save_image_b64(app: AppHandle, path: String, data: String) -> Result<(), String> {
    let bytes = B64
        .decode(data)
        .map_err(|e| format!("Failed to decode base64 data: {}", e))?;
    write_image_bytes(&app, &path, &bytes)
}

/// 写图片字节到目标路径（自动建父目录 + 授权 asset 协议）
fn write_image_bytes(app: &AppHandle, path: &str, bytes: &[u8]) -> Result<(), String> {
    let target = Path::new(path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
            // 图片保存目录（.assets）授权给 asset 协议：仅直接子文件
            let dir = parent.to_string_lossy().to_string();
            allow_asset_directory(app, &dir, false);
        }
    }
    atomic_write(target, bytes).map_err(|e| format!("Failed to write file: {}", e))
}

/// 创建文件（自动创建父目录），已存在则报错；可传入初始内容
#[tauri::command]
pub fn create_file(app: AppHandle, path: String, content: Option<String>) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        let dir = parent.to_string_lossy().to_string();
        if !dir.is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
            // 新建文档同样授权其所在目录：新建即写入的图片（粘贴/拖入）可立即显示
            if parent.parent().is_some() {
                allow_asset_directory(&app, &dir, true);
            }
        }
    }
    let data = content.unwrap_or_default();
    // 用 create_new 原子创建：先 exists() 检查再 rename 覆盖存在 TOCTOU 窗口，
    // 窗口期内目标若被其他进程创建会被无条件覆盖（与 rename_path 同样的考量）。
    // 新文件没有旧内容需要保护，直接写入即可，无需临时文件原子替换。
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::AlreadyExists => format!("File already exists: {}", path),
            _ => format!("Failed to create file: {}", e),
        })?;
    std::io::Write::write_all(&mut f, data.as_bytes())
        .map_err(|e| format!("Failed to create file: {}", e))
}

/// 创建目录（含父目录）
#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))
}

/// 重命名文件或目录，目标已存在则报错
#[tauri::command]
pub fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    let old = Path::new(&old_path);
    let new = Path::new(&new_path);
    // 不预先做 exists() 检查：检查与操作之间存在 TOCTOU 窗口，
    // 直接执行 rename 并把 OS 返回的错误翻译成可读信息，语义更准确。
    match std::fs::rename(old, new) {
        Ok(()) => Ok(()),
        Err(e) => {
            let msg = match e.kind() {
                std::io::ErrorKind::NotFound => format!("Path not found: {}", old_path),
                std::io::ErrorKind::AlreadyExists => format!("Target already exists: {}", new_path),
                _ => format!("Failed to rename: {}", e),
            };
            Err(msg)
        }
    }
}

/// 删除结果：`recycled` 表示是否成功移入回收站（false 表示退化成了永久删除）
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResult {
    pub recycled: bool,
}

/// 删除文件或目录（目录递归删除）。
///
/// 优先移入系统回收站——侧边栏「删除」是常用入口，误删一个含几十篇笔记的文件夹
/// 就是不可逆的灾难。回收站不可用时（如部分网络驱动器、文件被独占占用）
/// 才退化为永久删除，并通过 `recycled: false` 让前端明确提示用户。
#[tauri::command]
pub fn delete_path(path: String) -> Result<DeleteResult, String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("Path not found: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        match recycle_delete_windows(&path) {
            Ok(()) => return Ok(DeleteResult { recycled: true }),
            // 用户在系统对话框里取消（fAnyOperationsAborted）≠ 回收站不可用：
            // 绝不能把「用户主动取消」变成不可逆的永久删除，直接报错返回
            Err(RecycleError::Aborted) => {
                return Err("删除已取消".into());
            }
            // 回收站不可用（网络驱动器/文件被占用等）：退化为永久删除，
            // 通过 recycled:false 让前端明确提示用户「已永久删除」。
            // 原因记日志，便于事后诊断为何发生了不可逆删除。
            Err(RecycleError::Unavailable(reason)) => {
                eprintln!("[delete] recycle unavailable, falling back to permanent delete: {reason}");
            }
        }
    }

    if target.is_dir() {
        std::fs::remove_dir_all(target).map_err(|e| format!("Failed to delete directory: {}", e))?;
    } else {
        std::fs::remove_file(target).map_err(|e| format!("Failed to delete file: {}", e))?;
    }
    Ok(DeleteResult { recycled: false })
}

/// Windows：把文件/目录移入回收站（SHFileOperationW + FOF_ALLOWUNDO）
#[cfg(target_os = "windows")]
enum RecycleError {
    /// 用户在系统对话框中取消了操作
    Aborted,
    /// 回收站不可用（网络驱动器/策略限制等）
    Unavailable(String),
}

/// Windows：把文件/目录移入回收站（SHFileOperationW + FOF_ALLOWUNDO）
#[cfg(target_os = "windows")]
fn recycle_delete_windows(path: &str) -> Result<(), RecycleError> {
    use windows_sys::Win32::UI::Shell::{SHFileOperationW, SHFILEOPSTRUCTW, FO_DELETE};

    // FOF_ALLOWUNDO  0x0040 → 允许撤销（即进回收站）
    // FOF_SILENT     0x0004 → 不显示进度对话框
    // FOF_NOCONFIRMATION 0x0010 → 不弹确认框（前端已自行确认）
    // FOF_NOERRORUI  0x0400 → 出错时不弹系统错误框
    const FOF_ALLOWUNDO: u16 = 0x0040;
    const FOF_SILENT: u16 = 0x0004;
    const FOF_NOCONFIRMATION: u16 = 0x0010;
    const FOF_NOERRORUI: u16 = 0x0400;

    // pFrom 必须是「双 null 结尾」的宽字符串（可同时包含多个路径，各路径单 null 分隔）
    let mut wide: Vec<u16> = path.encode_utf16().collect();
    wide.push(0); // 路径结尾
    wide.push(0); // 列表结尾

    unsafe {
        // SHFILEOPSTRUCTW 是纯 POD 结构，zeroed 初始化后逐字段填充
        let mut op: SHFILEOPSTRUCTW = std::mem::zeroed();
        op.wFunc = FO_DELETE as u32;
        op.pFrom = wide.as_ptr();
        op.fFlags = FOF_ALLOWUNDO | FOF_SILENT | FOF_NOCONFIRMATION | FOF_NOERRORUI;

        let ret = SHFileOperationW(&mut op);
        if ret != 0 {
            return Err(RecycleError::Unavailable(format!("SHFileOperationW failed: {}", ret)));
        }
        // 用户取消（如 UAC 弹窗被拒）：与「回收站不可用」严格区分，
        // 调用方对 Aborted 不得降级为永久删除
        if op.fAnyOperationsAborted != 0 {
            return Err(RecycleError::Aborted);
        }
    }
    Ok(())
}
