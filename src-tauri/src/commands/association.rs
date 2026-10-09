//! 文件关联检查与设置（Windows：HKCU 注册表，无需管理员权限）

use serde::Serialize;

/// 统一 ProgId，.md / .markdown 都映射到它
const PROG_ID: &str = "MyMdEdit.Markdown";
const PROG_DESCRIPTION: &str = "Markdown Document (MyMdEdit)";
const EXTENSIONS: &[&str] = &[".md", ".markdown"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssociationStatus {
    pub associated: bool,
    pub prog_id: String,
    pub message: String,
}

/// 当前可执行文件路径（注册表命令用）
fn exe_path() -> Result<String, String> {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get current exe path: {}", e))
}

/// 读取 .md 当前关联的 ProgId（None 表示尚未关联给任何程序）
#[cfg(target_os = "windows")]
fn current_md_prog_id() -> Result<Option<String>, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let classes = hkcu
        .open_subkey_with_flags("Software\\Classes", KEY_READ)
        .map_err(|e| format!("Failed to open HKCU\\Software\\Classes: {}", e))?;

    let classes_prog_id = classes
        .open_subkey_with_flags(".md", KEY_READ)
        .and_then(|k| k.get_value::<String, _>(""))
        .ok();

    // UserChoice（资源管理器"打开方式"写入）对双击行为有更高优先级：
    // 只读 Classes 默认值会把"用户已选择其他程序但 Classes 无默认值"误判为
    // 无主，导致应用自认已关联而双击行为不变
    let user_choice_prog_id = hkcu
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.md\\UserChoice",
            KEY_READ,
        )
        .and_then(|k| k.get_value::<String, _>("ProgId"))
        .ok();

    Ok(user_choice_prog_id.or(classes_prog_id))
}

/// 检查 .md 文件是否已关联到本应用
#[tauri::command]
pub fn check_md_association() -> Result<AssociationStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let current_prog_id = current_md_prog_id()?;
        let associated = current_prog_id.as_deref() == Some(PROG_ID);

        Ok(AssociationStatus {
            associated,
            prog_id: PROG_ID.to_string(),
            message: if associated {
                "md files are associated with MyMdEdit".into()
            } else {
                format!(
                    "md files are associated with '{}', not MyMdEdit",
                    current_prog_id.unwrap_or_else(|| "(none)".into())
                )
            },
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(AssociationStatus {
            associated: true,
            prog_id: PROG_ID.to_string(),
            message: "File association is only managed on Windows".into(),
        })
    }
}

/// 将 .md / .markdown 关联到本应用（写入 HKCU，无需管理员权限）
#[tauri::command]
pub fn set_md_association() -> Result<AssociationStatus, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let exe = exe_path()?;
        let open_command = format!("\"{}\" \"%1\"", exe);
        let icon = format!("\"{}\",0", exe);

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (classes, _) = hkcu
            .create_subkey("Software\\Classes")
            .map_err(|e| format!("Failed to create HKCU\\Software\\Classes: {}", e))?;

        // 1. ProgId 定义
        {
            let (prog, _) = classes
                .create_subkey(PROG_ID)
                .map_err(|e| format!("Failed to create ProgId key: {}", e))?;
            prog.set_value("", &PROG_DESCRIPTION.to_string())
                .map_err(|e| format!("Failed to set ProgId description: {}", e))?;

            let (icon_key, _) = prog
                .create_subkey("DefaultIcon")
                .map_err(|e| format!("Failed to create DefaultIcon key: {}", e))?;
            icon_key
                .set_value("", &icon)
                .map_err(|e| format!("Failed to set DefaultIcon: {}", e))?;

            let (shell, _) = prog
                .create_subkey("shell")
                .map_err(|e| format!("Failed to create shell key: {}", e))?;
            let (open, _) = shell
                .create_subkey("open")
                .map_err(|e| format!("Failed to create shell\\open key: {}", e))?;
            let (command, _) = open
                .create_subkey("command")
                .map_err(|e| format!("Failed to create shell\\open\\command key: {}", e))?;
            command
                .set_value("", &open_command)
                .map_err(|e| format!("Failed to set open command: {}", e))?;
        }

        // 2. 扩展名 → ProgId 映射 + OpenWithProgids
        for ext in EXTENSIONS {
            let (ext_key, _) = classes
                .create_subkey(ext)
                .map_err(|e| format!("Failed to create {} key: {}", ext, e))?;
            ext_key
                .set_value("", &PROG_ID.to_string())
                .map_err(|e| format!("Failed to set {} ProgId: {}", ext, e))?;

            let (open_with, _) = ext_key
                .create_subkey("OpenWithProgids")
                .map_err(|e| format!("Failed to create OpenWithProgids: {}", e))?;
            // REG_NONE 空值，表明该 ProgId 支持打开此扩展
            open_with
                .set_raw_value(
                    PROG_ID,
                    &winreg::RegValue {
                        bytes: Vec::new(),
                        vtype: REG_NONE,
                    },
                )
                .map_err(|e| format!("Failed to set OpenWithProgids entry: {}", e))?;
        }

        // 3. 通知资源管理器刷新关联
        notify_shell();

        check_md_association()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("File association is only supported on Windows".into())
    }
}

/// 启动时调用：**仅在 .md 尚未关联给任何程序时**才自动接管。
///
/// 旧实现是「没关联给我 → 立即抢过来」，会静默覆盖用户已经配好的
/// Typora / VSCode / Obsidian，用户往往很久之后才发现双击行为变了。
/// 这是会招致负面评价的激进行为。现在的策略是：
/// - .md 无主（全新系统 / 用户解除过关联）→ 自动接管，属于合理的开箱体验；
/// - .md 已有归属（无论是不是本应用）→ 一律不动，由用户在设置里主动点击。
pub fn ensure_md_association() -> Result<AssociationStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let status = check_md_association()?;
        if status.associated {
            return Ok(status);
        }
        // 已关联给其他程序 → 保持原样，不抢夺
        if current_md_prog_id()?.is_some() {
            eprintln!(
                "[association] .md 已关联给其他程序，保持原样，不自动接管"
            );
            return Ok(status);
        }
        set_md_association()
    }
    #[cfg(not(target_os = "windows"))]
    {
        check_md_association()
    }
}

/// 广播 SHChangeNotify，让资源管理器立即感知关联变更
#[cfg(target_os = "windows")]
fn notify_shell() {
    use windows_sys::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
    unsafe {
        SHChangeNotify(
            SHCNE_ASSOCCHANGED as i32,
            SHCNF_IDLIST,
            std::ptr::null(),
            std::ptr::null_mut(),
        );
    }
}