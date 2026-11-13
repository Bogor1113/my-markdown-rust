//! 自定义 IPC 命令的路径形态校验（纯 std，可独立单测）。
//!
//! ## 为什么不是 `canonicalize()` + `starts_with(工作区根)`
//!
//! 审查建议给所有自定义命令加「工作区根」白名单，但本产品是**通用 Markdown
//! 编辑器**：双击 .md 文件关联、拖入任意路径、文件树里打开工作区外的文件都是
//! 一等公民能力，强制限定在 `rootPath` 内会直接把这些入口废掉。而项目没有使用
//! `tauri-plugin-fs`，capabilities 的 scope 对这些自定义命令本来就不生效。
//!
//! 因此采用「门禁 + 形态校验」的组合：release 构建不编译 DevTools（见
//! `Cargo.toml` 的 `devtools` feature），CSP 收敛远程内容，剩下能直接调 IPC 的
//! 只有应用自身代码；这里再挡住一批明确的恶意/危险路径形态，避免出现
//! 「写设备名 / 写 NTFS 交替数据流 / 用设备命名空间绕过 Win32 规范化」。
//!
//! 刻意**保留** UNC 网络路径（`\\server\share\...`）——用户可能把笔记放在网络盘，
//! 且 `file.rs` 已对无回收站的 UNC 删除做了单独拒绝。

use std::path::Path;

/// 校验 IPC 传入的路径形态。返回 `Err` 时调用方应直接拒绝该命令。
pub fn validate_path(path: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("路径为空".into());
    }
    if path.chars().any(|c| c == '\0' || c.is_control()) {
        return Err("路径包含非法控制字符".into());
    }

    // Win32 设备命名空间会绕过路径规范化（可访问保留设备名、超长路径、
    // 让 `..` 不被归一化），自定义命令一律不接受。
    if path.starts_with("\\\\?\\") || path.starts_with("//?/")
        || path.starts_with("\\\\.\\") || path.starts_with("//./")
    {
        return Err("不支持设备命名空间路径".into());
    }

    // 刻意**不**拒绝 `..` 组件：文档里的相对图片（`../images/a.png`）经
    // `joinPath` 拼接后就是含 `..` 的绝对路径，导出时会传给 `read_file_b64` 等
    // 读命令，拒绝它会造成真实的裂图回归。且本产品允许任意绝对路径，`..`
    // 并不带来额外能力；真正能让 `..` 绕过系统规范化的是设备命名空间，
    // 已在上面拒绝。Win32 会在 open 时自行规范化普通路径里的 `..`。
    let p = Path::new(path);
    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
        // 盘符根 / UNC 根的 file_name 为 None，不会误伤。
        // Windows 保留设备名（含 `CON.txt`、`COM1.log` 这类带扩展名形式、
        // 以及结尾空格）会被 OS 解释成设备而不是普通文件。
        let stem = name.split('.').next().unwrap_or("").trim_end().to_ascii_uppercase();
        let bytes = stem.as_bytes();
        let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || (bytes.len() == 4
                && (stem.starts_with("COM") || stem.starts_with("LPT"))
                && bytes[3].is_ascii_digit()
                && bytes[3] != b'0');
        if reserved {
            return Err(format!("路径包含 Windows 保留设备名：{name}"));
        }
        // 文件名中的额外冒号是 NTFS 交替数据流（ADS），可用来隐藏写入内容。
        // 盘符冒号位于 Prefix 组件，不会出现在 file_name 里。
        if name.contains(':') {
            return Err("路径文件名包含非法冒号（ADS）".into());
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_normal_paths() {
        assert!(validate_path(r"C:\work\note.md").is_ok());
        assert!(validate_path(r"C:\work").is_ok());
        assert!(validate_path(r"C:\").is_ok());
        assert!(validate_path(r"\\server\share\note.md").is_ok());
        assert!(validate_path("/home/user/note.md").is_ok());
        assert!(validate_path(r"C:\Users\张三\文档.md").is_ok());
    }

    #[test]
    fn rejects_empty_and_control_chars() {
        assert!(validate_path("").is_err());
        assert!(validate_path("   ").is_err());
        assert!(validate_path("C:\\work\\a\0b.md").is_err());
        assert!(validate_path("C:\\work\\a\u{0007}.md").is_err());
    }

    #[test]
    fn rejects_device_namespace() {
        assert!(validate_path(r"\\?\C:\work\note.md").is_err());
        assert!(validate_path("//?/C:/work/note.md").is_err());
        assert!(validate_path(r"\\.\COM1").is_err());
    }

    #[test]
    fn accepts_parent_dir_for_relative_image_paths() {
        // 导出链路 joinPath(dir, "../images/a.png") 会生成这样的路径，不能误伤
        assert!(validate_path(r"C:\work\..\images\a.png").is_ok());
        assert!(validate_path("../images/a.png").is_ok());
    }

    #[test]
    fn rejects_reserved_device_names() {
        for n in ["CON", "con.txt", "PRN", "AUX", "NUL", "COM1", "com9.log", "LPT1", "lpt3.txt"] {
            let p = format!(r"C:\work\{n}");
            assert!(validate_path(&p).is_err(), "should reject {p}");
        }
        // 普通名字不能误伤
        assert!(validate_path(r"C:\work\console.md").is_ok());
        assert!(validate_path(r"C:\work\com.md").is_ok());
        assert!(validate_path(r"C:\work\COM10.txt").is_ok());
        assert!(validate_path(r"C:\work\COM0.txt").is_ok());
    }

    #[test]
    fn rejects_ntfs_ads_colon() {
        assert!(validate_path(r"C:\work\note.md:hidden").is_err());
        // 盘符冒号不算
        assert!(validate_path(r"C:\work\note.md").is_ok());
    }
}
