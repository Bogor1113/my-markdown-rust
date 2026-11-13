//! 跨文件全局搜索与替换命令
//!
//! 在指定根目录下递归搜索所有 .md / .markdown 文件，对每一行进行匹配，
//! 返回匹配的文件路径、行号、行内容。支持跨文件批量替换。
//!
//! 两个关键约束：
//! 1. **不阻塞 UI**：搜索/替换都是同步阻塞的磁盘 IO，必须放到
//!    `spawn_blocking` 里跑。否则在 Tauri 中同步 command 会占用主线程，
//!    大目录搜索期间整个界面（含窗口拖动）会无响应且无法取消。
//! 2. **替换可回滚**：批量替换先收集全部改动，再统一原子落盘；
//!    中途任一文件失败就把已写入的文件恢复成原内容，
//!    避免目录停留在「部分已改、部分未改」的半毁状态。

use super::ci_match::{line_match_utf16, replace_ci};
use serde::Serialize;
use std::collections::HashSet;

/// 递归深度上限：防止目录符号链接成环 / 超深目录导致栈溢出
/// （Rust 中栈溢出无法被 catch，是进程级终止）
const MAX_DEPTH: usize = 32;

/// 遍历时跳过的目录名（构建产物、依赖目录等）
/// 这些目录通常体量巨大且不含笔记内容，进去了既慢又产生大量噪音结果
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".venv",
    "venv",
    "__pycache__",
    "vendor",
    ".gradle",
    ".idea",
    ".vscode-server",
];

/// 视为 Markdown 文档的扩展名
fn is_markdown(path: &std::path::Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .as_deref(),
        Some("md") | Some("markdown")
    )
}

/// 是否跳过该目录项：隐藏文件（以 . 开头）+ 显式黑名单
fn should_skip(name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }
    SKIP_DIRS
        .iter()
        .any(|d| d.eq_ignore_ascii_case(name))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    /// 文件路径
    pub path: String,
    /// 文件名（不含路径）
    pub name: String,
    /// 行号（从 1 开始）
    pub line: usize,
    /// 匹配行的完整内容
    pub content: String,
    /// 匹配字符在行内的起始位置（**UTF-16 code unit** 偏移，前端 String.slice 直接可用）
    pub match_start: usize,
    /// 匹配字符在行内的结束位置（UTF-16 code unit 偏移）
    pub match_end: usize,
}

/// 替换结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceResult {
    /// 文件路径
    pub path: String,
    /// 替换的次数
    pub count: usize,
}

/// 搜索根目录下所有 Markdown 文件，返回匹配行列表
///
/// - `root`：根目录路径
/// - `query`：搜索关键字（大小写不敏感，子串匹配，一行内多处命中全部返回）
/// - `max_results`：最大返回结果数（默认 200）
#[tauri::command]
pub async fn search_files(
    root: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let max = max_results.unwrap_or(200);
    if max == 0 {
        return Ok(Vec::new());
    }

    // 阻塞型递归 IO 放到专用线程池，避免冻结 WebView 主线程
    tauri::async_runtime::spawn_blocking(move || {
        let mut results = Vec::new();
        search_walk(std::path::Path::new(&root), &query, &mut results, max);
        Ok(results)
    })
    .await
    .map_err(|e| format!("Search task failed: {e}"))?
}

/// 跨文件批量替换：在根目录下所有 Markdown 文件中将 query 替换为 replacement
///
/// 返回每个被修改文件的路径和替换次数。
/// 任一文件写盘失败会回滚此前已写入的全部文件，并返回 Err。
#[tauri::command]
pub async fn replace_files(
    root: String,
    query: String,
    replacement: String,
) -> Result<Vec<ReplaceResult>, String> {
    if query.is_empty() {
        return Ok(Vec::new());
    }

    tauri::async_runtime::spawn_blocking(move || replace_all(&root, &query, &replacement))
        .await
        .map_err(|e| format!("Replace task failed: {e}"))?
}

// 大小写不敏感匹配统一放在 ci_match 模块：按 char 索引 + UTF-16 前缀和定位，
// 不使用「小写串的字节偏移」反切原文（会 panic 或写出错位内容，详见该模块头注释）。

/// 迭代式目录遍历（显式栈，带深度上限），收集匹配行。
///
/// 不用递归的原因：目录符号链接成环或层级极深时会栈溢出，
/// 而 Rust 的栈溢出无法被 catch，直接终止进程。
fn search_walk(
    root: &std::path::Path,
    query: &str,
    results: &mut Vec<SearchResult>,
    max: usize,
) {
    let query_lower = query.to_lowercase();
    if query_lower.is_empty() {
        return;
    }
    // 已访问目录的真实路径（canonicalize 后），用于切断符号链接环
    let mut visited: HashSet<std::path::PathBuf> = HashSet::new();
    // 栈元素：(目录, 当前深度)。后进先出，保证遍历顺序与递归一致
    let mut stack: Vec<(std::path::PathBuf, usize)> = vec![(root.to_path_buf(), 0)];

    'outer: while let Some((dir, depth)) = stack.pop() {
        if depth > MAX_DEPTH || results.len() >= max {
            continue;
        }
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue, // 无权限 / 目录已消失：跳过，不中断整体搜索
        };

        let mut sub_dirs: Vec<std::path::PathBuf> = Vec::new();
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path();

            if path.is_dir() {
                if should_skip(&name) {
                    continue;
                }
                // 环检测：符号链接目录 canonicalize 后会指回祖先目录
                if let Ok(canon) = path.canonicalize() {
                    if !visited.insert(canon) {
                        continue;
                    }
                }
                sub_dirs.push(path);
                continue;
            }

            if !is_markdown(&path) {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(&path) else {
                continue; // 非 UTF-8 / 无权限：跳过
            };
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let path_str = path.to_string_lossy().to_string();

            for (line_num, line) in content.lines().enumerate() {
                if results.len() >= max {
                    break 'outer;
                }
                // 大小写不敏感匹配 + UTF-16 偏移换算（见 line_match_utf16 注释）
                for (start16, end16) in line_match_utf16(line, &query_lower) {
                    if results.len() >= max {
                        break 'outer;
                    }
                    results.push(SearchResult {
                        path: path_str.clone(),
                        name: name.clone(),
                        line: line_num + 1,
                        content: line.to_string(),
                        match_start: start16,
                        match_end: end16,
                    });
                }
            }
        }
        // 逆序压栈，保证出栈顺序（即遍历顺序）与递归一致：子目录按名称先后
        for d in sub_dirs.into_iter().rev() {
            stack.push((d, depth + 1));
        }
    }
}

/// 批量替换主流程：收集 → 统一原子写 → 失败回滚
fn replace_all(root: &str, query: &str, replacement: &str) -> Result<Vec<ReplaceResult>, String> {
    // ── 阶段 1：只读遍历，收集所有待写改动（此阶段不会碰任何文件）──
    let mut pending: Vec<(std::path::PathBuf, String, String, usize)> = Vec::new();
    let mut visited: HashSet<std::path::PathBuf> = HashSet::new();
    let mut stack: Vec<(std::path::PathBuf, usize)> =
        vec![(std::path::Path::new(root).to_path_buf(), 0)];

    while let Some((dir, depth)) = stack.pop() {
        if depth > MAX_DEPTH {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        let mut sub_dirs: Vec<std::path::PathBuf> = Vec::new();
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path();
            if path.is_dir() {
                if should_skip(&name) {
                    continue;
                }
                if let Ok(canon) = path.canonicalize() {
                    if !visited.insert(canon) {
                        continue;
                    }
                }
                sub_dirs.push(path);
                continue;
            }
            if !is_markdown(&path) {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(&path) else {
                continue;
            };
            let (new_content, count) = replace_ci(&content, query, replacement);
            if count > 0 {
                pending.push((path, content, new_content, count));
            }
        }
        for d in sub_dirs.into_iter().rev() {
            stack.push((d, depth + 1));
        }
    }

    if pending.is_empty() {
        return Ok(Vec::new());
    }

    // ── 阶段 2：逐个原子写入；失败立即回滚已写入的全部文件 ──
    let mut done: Vec<(std::path::PathBuf, String)> = Vec::new(); // (path, 原始内容)
    let mut results: Vec<ReplaceResult> = Vec::new();

    for (path, old_content, new_content, count) in pending {
        if let Err(e) =
            super::atomic_write(&path, new_content.as_bytes())
        {
            // 回滚：把已成功写入的文件恢复成原始内容
            let mut rollback_failed: Vec<String> = Vec::new();
            for (p, original) in &done {
                if let Err(re) = super::atomic_write(p, original.as_bytes()) {
                    rollback_failed.push(format!("{}（{re}）", p.display()));
                }
            }
            let mut msg = format!("替换中断，已回滚 {} 个文件。失败文件：{}（{e}）", done.len(), path.display());
            if !rollback_failed.is_empty() {
                msg.push_str(&format!("；以下文件回滚失败，请手动检查：{}", rollback_failed.join("、")));
            }
            return Err(msg);
        }
        done.push((path.clone(), old_content));
        results.push(ReplaceResult {
            path: path.to_string_lossy().to_string(),
            count,
        });
    }

    Ok(results)
}
