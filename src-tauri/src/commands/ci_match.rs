//! 大小写不敏感的子串定位与替换（纯 std，无 Tauri 依赖，可独立单测）。
//!
//! ## 为什么不能用「小写串的字节偏移」反切原文
//!
//! `to_lowercase()` 会改变字符的字节长度：`'İ'`(2B) → `"i̇"`(3B)、
//! `'ẞ'`(3B) → `"ß"`(2B)。更隐蔽的是变长与变短可以**互相抵消**使总长相等，
//! 于是「`lower.len() == line.len()` 就说明偏移一一对应」的快路径守卫并不成立：
//!
//! ```text
//! 原文 "İẞX" = [c4 b0 | e1 ba 9e | 58]        6 bytes
//! 小写 "i̇ßx" = [69 cc 87 | c3 9f | 78]       6 bytes  → 守卫通过
//! match_indices("ß") 的字节偏移 = 3，落在原文 "ẞ"(2..5) 内部
//! line[..3] 不是 char boundary → panic
//! ```
//!
//! 叠加 `[profile.release] panic = "abort"`，一次搜索就是整个进程退出；
//! 而替换路径的偏移可能「合法但错位」，静默写出被截断/串位的文件。
//!
//! ## 本实现的口径
//!
//! 全程使用 **char 索引** 与 **UTF-16 前缀和**，与字节偏移彻底解耦：
//! 逐字符小写化并记录每个小写 char 源自原文哪个 char，匹配后把窗口映射回
//! 原文 char 区间。搜索侧与替换侧共用同一套 `LowerIndex::find`，保证
//! 「搜索预览 N 处」与「实际替换 N 处」永远一致。
//!
//! 纯 ASCII 输入保留零分配的快路径（ASCII 小写化不改变字节长，字节偏移即
//! UTF-16 偏移）；该分支由单测与通用路径逐例对齐验证。

/// 逐字符小写化后的索引：小写 char 序列 → 原文 char 索引 → UTF-16 偏移。
struct LowerIndex {
    /// 小写化后的 char 序列
    lower: Vec<char>,
    /// `lower[i]` 源自原文第 `owner[i]` 个 char
    owner: Vec<usize>,
    /// 原文每个 char 的 UTF-16 起始偏移；`utf16[i]` = 前 i 个 char 的 UTF-16 长度
    utf16: Vec<usize>,
}

impl LowerIndex {
    fn new(s: &str) -> Self {
        let mut lower = Vec::with_capacity(s.len());
        let mut owner = Vec::with_capacity(s.len());
        let mut utf16 = Vec::with_capacity(s.chars().count() + 1);
        utf16.push(0);
        let mut acc = 0usize;
        for (i, c) in s.chars().enumerate() {
            acc += c.len_utf16();
            utf16.push(acc);
            for lc in c.to_lowercase() {
                lower.push(lc);
                owner.push(i);
            }
        }
        Self { lower, owner, utf16 }
    }

    /// 返回匹配窗口在原文中的 `(char 起始索引, char 结束索引)` 列表，窗口不重叠。
    /// 与 `str::match_indices` 的语义一致：命中后从窗口末尾继续，不产生重叠命中。
    fn find(&self, query_lower: &str) -> Vec<(usize, usize)> {
        if query_lower.is_empty() {
            return Vec::new();
        }
        let q: Vec<char> = query_lower.chars().collect();
        let n = q.len();
        if n > self.lower.len() {
            return Vec::new();
        }
        let mut out = Vec::new();
        let mut i = 0;
        while i + n <= self.lower.len() {
            if self.lower[i..i + n] == q[..] {
                out.push((self.owner[i], self.owner[i + n - 1] + 1));
                i += n;
            } else {
                i += 1;
            }
        }
        out
    }
}

/// 通用路径：按 char 索引定位，再换算成 UTF-16 code unit 偏移。
fn line_match_generic(line: &str, query_lower: &str) -> Vec<(usize, usize)> {
    let idx = LowerIndex::new(line);
    idx.find(query_lower)
        .into_iter()
        .map(|(s, e)| (idx.utf16[s], idx.utf16[e]))
        .collect()
}

/// 在一行内做大小写不敏感搜索，返回 `(起始, 结束)` 的 **UTF-16 code unit** 偏移
/// （前端 `String.slice` 直接可用）。`query_lower` 必须为已小写化的查询串。
pub fn line_match_utf16(line: &str, query_lower: &str) -> Vec<(usize, usize)> {
    // 必须显式挡空查询：str::match_indices("") 会在每个字符边界产生空命中，
    // 与通用路径（find 返回空）行为不一致，也让「搜索 N 处 / 替换 N 处」失配。
    if query_lower.is_empty() {
        return Vec::new();
    }
    // 纯 ASCII 快路径：小写化不改变字节长，字节偏移 == char 偏移 == UTF-16 偏移。
    if line.is_ascii() && query_lower.is_ascii() {
        let lower = line.to_ascii_lowercase();
        return lower
            .match_indices(query_lower)
            .map(|(s, m)| (s, s + m.len()))
            .collect();
    }
    line_match_generic(line, query_lower)
}

/// 通用路径：按 char 区间重建字符串，不使用任何字节偏移切片。
fn replace_generic(content: &str, query_lower: &str, replacement: &str) -> (String, usize) {
    let idx = LowerIndex::new(content);
    let ranges = idx.find(query_lower);
    if ranges.is_empty() {
        return (content.to_string(), 0);
    }
    let chars: Vec<char> = content.chars().collect();
    let count = ranges.len();
    let mut out = String::with_capacity(content.len() + replacement.len() * count);
    let mut last = 0usize;
    for (s, e) in ranges {
        for c in &chars[last..s] {
            out.push(*c);
        }
        out.push_str(replacement);
        last = e;
    }
    for c in &chars[last..] {
        out.push(*c);
    }
    (out, count)
}

/// 大小写不敏感替换，返回 `(新内容, 替换次数)`。
/// 与 `line_match_utf16` 共用 `LowerIndex`，两侧语义严格一致。
pub fn replace_ci(content: &str, query: &str, replacement: &str) -> (String, usize) {
    if query.is_empty() {
        return (content.to_string(), 0);
    }
    let query_lower = query.to_lowercase();

    // 纯 ASCII 快路径：小写化不改变字节长，字节偏移可安全用于切原文。
    if content.is_ascii() && query.is_ascii() {
        let ql = query.to_ascii_lowercase();
        let lower = content.to_ascii_lowercase();
        let matches: Vec<(usize, usize)> = lower
            .match_indices(&ql)
            .map(|(s, m)| (s, s + m.len()))
            .collect();
        if matches.is_empty() {
            return (content.to_string(), 0);
        }
        let count = matches.len();
        let mut out = String::with_capacity(content.len() + replacement.len() * count);
        let mut last = 0;
        for (s, e) in matches {
            out.push_str(&content[last..s]);
            out.push_str(replacement);
            last = e;
        }
        out.push_str(&content[last..]);
        return (out, count);
    }

    replace_generic(content, &query_lower, replacement)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ascii_basic_and_non_overlapping() {
        assert_eq!(line_match_utf16("aAb AAB", "aa"), vec![(0, 2), (4, 6)]);
        assert_eq!(line_match_utf16("aaaa", "aa"), vec![(0, 2), (2, 4)]);
        assert_eq!(line_match_utf16("", "a"), vec![]);
        assert_eq!(replace_ci("aAb AAB", "aa", "X"), ("Xb XB".to_string(), 2));
    }

    #[test]
    fn ascii_fast_path_matches_generic() {
        let cases = [
            ("Hello WORLD hello", "hello"),
            ("aaaa aaa aa a", "aa"),
            ("MiXeD CaSe 123", "case"),
            ("no match here", "zzz"),
            ("", "a"),
            ("tab\tand space ", "and"),
        ];
        for (line, q) in cases {
            assert_eq!(
                line_match_utf16(line, q),
                line_match_generic(line, q),
                "line={line:?} q={q:?}"
            );
            let (fast, fast_n) = replace_ci(line, q, "#");
            let (gen, gen_n) = replace_generic(line, &q.to_lowercase(), "#");
            assert_eq!((fast, fast_n), (gen, gen_n), "line={line:?} q={q:?}");
        }
    }

    #[test]
    fn empty_query_is_noop() {
        assert_eq!(line_match_utf16("abc", ""), vec![]);
        assert_eq!(replace_ci("abc", "", "X"), ("abc".to_string(), 0));
    }

    #[test]
    fn utf16_offsets_with_emoji() {
        // "😀" 占 2 个 UTF-16 code unit，前端 slice 以 UTF-16 为单位
        assert_eq!(line_match_utf16("😀a", "a"), vec![(2, 3)]);
        assert_eq!(line_match_utf16("😀A😀", "a"), vec![(2, 3)]);
        assert_eq!(replace_ci("😀A😀", "a", "X"), ("😀X😀".to_string(), 1));
    }

    #[test]
    fn cjk_offsets() {
        assert_eq!(line_match_utf16("中文abc中文", "abc"), vec![(2, 5)]);
        assert_eq!(replace_ci("中文abc中文", "ABC", "X"), ("中文X中文".to_string(), 1));
    }

    #[test]
    fn expanding_and_shrinking_lowercase_never_panics() {
        // 文档记录过的崩溃用例：总长相等但逐字符字节长互相抵消
        let line = "İẞX";
        let (out, n) = replace_ci(line, "ß", "Z");
        assert_eq!(n, 1, "line={line:?} out={out:?}");
        assert!(out.ends_with('Z') || out.contains('Z'), "out={out:?}");
        // 搜索侧必须给出合法 UTF-16 偏移，且不 panic
        let hits = line_match_utf16(line, "ß");
        assert_eq!(hits.len(), 1, "hits={hits:?}");
        let (s, e) = hits[0];
        let u: Vec<u16> = line.encode_utf16().collect();
        assert!(s < e && e <= u.len(), "s={s} e={e} len={}", u.len());
    }

    #[test]
    fn lowercase_expansion_of_query() {
        // 'İ' 小写化展开成 "i̇"（2 个 char）
        assert_eq!(replace_ci("İstanbul İ", "İ", "i"), ("istanbul i".to_string(), 2));
        assert_eq!(line_match_utf16("İstanbul", "i̇"), vec![(0, 1)]);
        // 'K' (U+212A KELVIN SIGN) 小写折叠为 ASCII 'k'
        assert_eq!(replace_ci("Kelvin", "k", "K"), ("Kelvin".to_string(), 1));
    }

    #[test]
    fn search_and_replace_counts_agree() {
        let cases = [
            ("İẞX", "ß"),
            ("İẞX", "x"),
            ("aAaA", "a"),
            ("中文中文", "文"),
            ("😀A😀A", "a"),
            ("ßßß", "ß"),
            ("İİİ", "İ"),
        ];
        for (content, q) in cases {
            let hits = line_match_utf16(content, &q.to_lowercase());
            let (_, n) = replace_ci(content, q, "#");
            assert_eq!(hits.len(), n, "content={content:?} q={q:?} hits={hits:?}");
        }
    }

    #[test]
    fn replacement_preserves_unmatched_content() {
        let (out, n) = replace_ci("a İ b ẞ c", "İ", "XX");
        assert_eq!(n, 1);
        assert_eq!(out, "a XX b ẞ c");
    }
}
