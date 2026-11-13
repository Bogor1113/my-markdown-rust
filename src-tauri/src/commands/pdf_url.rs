//! 本地路径 → `file://` URL（纯 std，可独立单测）。

/// Windows 临时目录路径常含用户名，用户名可能带空格、`#`、`%`、中文等非 ASCII
/// 字符。旧实现 `format!("file:///{}", tmp_path.replace('\\', "/"))` 不做百分号
/// 编码：`#` 会被当作 fragment 起点、`%` 会被当成转义序列开头、非 ASCII 字节被
/// 按 Latin-1 解释 → WebView2 导航 404 → 30s 超时 → 这类用户完全无法导出 PDF。
///
/// 按 RFC 3986 逐字节百分号编码，只保留 unreserved 字符、路径分隔符 `/` 和
/// 盘符冒号 `:`；其余字符（含 `?` `#` `%` 空格与非 ASCII 字节）一律编码，最保守。
pub fn path_to_file_url(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    let mut out = String::with_capacity(normalized.len() + 8);
    out.push_str("file:///");
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    for &b in normalized.as_bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~' | b'/' | b':') {
            out.push(b as char);
        } else {
            out.push('%');
            out.push(HEX[(b >> 4) as usize] as char);
            out.push(HEX[(b & 0x0f) as usize] as char);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_ascii_path() {
        assert_eq!(path_to_file_url(r"C:\Temp\a.html"), "file:///C:/Temp/a.html");
    }

    #[test]
    fn encodes_space_hash_percent() {
        assert_eq!(
            path_to_file_url(r"C:\Users\A B#x%y\a.html"),
            "file:///C:/Users/A%20B%23x%25y/a.html"
        );
    }

    #[test]
    fn encodes_utf8_bytes() {
        // 张 = E5 BC A0，三 = E4 B8 89
        assert_eq!(
            path_to_file_url(r"C:\Users\张三\a.html"),
            "file:///C:/Users/%E5%BC%A0%E4%B8%89/a.html"
        );
    }

    #[test]
    fn never_leaves_fragment_or_query() {
        let url = path_to_file_url(r"C:\tmp\a?b#c.html");
        assert!(!url.contains('?'));
        assert!(!url.contains('#'));
        assert!(url.contains("%3F"));
        assert!(url.contains("%23"));
    }
}
