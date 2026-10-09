//! PDF 大纲（书签）注入。
//!
//! WebView2 的 `PrintToPdf` 本身**不支持**生成 PDF 大纲/书签（打印设置里没有相关选项），
//! 而 Typora 导出的 PDF 在阅读器侧边栏有大纲。这里在打印完成后用 lopdf 处理产物：
//! 1. 抽取每一页的文本（解析内容流 Tj/TJ 操作符 + 字体 ToUnicode CMap 解码，支持中文）；
//! 2. 把前端传来的文档标题（h1~h6）按文档顺序定位到对应页面；
//! 3. 写入 `/Outlines` 大纲树（书签点击跳转到对应页），挂到 PDF 目录后重新保存。

use std::collections::HashMap;

use lopdf::{Dictionary, Document, Object, ObjectId, StringFormat};

/// 前端传来的标题大纲条目（与 export.ts 中 extractOutline 对应）
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineEntry {
    pub level: u32,
    pub text: String,
}

/// 归一化：去掉所有空白（CJK 无空格；拉丁文的单词间空格在此一并抹除，避免匹配歧义）
fn normalize(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

/// PDF 字符串（UTF-16BE + BOM），保证中文标题在阅读器里正常显示
fn pdf_utf16be(s: &str) -> Object {
    let mut b = vec![0xFE, 0xFF];
    for u in s.encode_utf16() {
        b.extend_from_slice(&u.to_be_bytes());
    }
    Object::String(b, StringFormat::Literal)
}

// ---------------------------------------------------------------------------
// ToUnicode CMap 解析（lopdf 的 cmap 解析是 pub(crate)，这里自己实现 bfchar/bfrange）
// ---------------------------------------------------------------------------

fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

/// 提取一行里所有 `<hex>` 标记
fn hex_tokens(line: &str) -> Vec<Vec<u8>> {
    let b = line.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'<' {
            let mut j = i + 1;
            let mut nib = Vec::new();
            while j < b.len() && b[j] != b'>' {
                if let Some(d) = hex_val(b[j]) {
                    nib.push(d);
                }
                j += 1;
            }
            let mut bytes = Vec::with_capacity((nib.len() + 1) / 2);
            let mut k = 0;
            while k + 1 < nib.len() {
                bytes.push((nib[k] << 4) | nib[k + 1]);
                k += 2;
            }
            if k < nib.len() {
                bytes.push(nib[k] << 4);
            }
            out.push(bytes);
            i = j + 1;
        } else {
            i += 1;
        }
    }
    out
}

fn utf16be_to_string(bytes: &[u8]) -> Option<String> {
    if bytes.len() % 2 != 0 {
        return None;
    }
    let units: Vec<u16> = bytes
        .chunks(2)
        .map(|c| u16::from_be_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16(&units).ok()
}

fn seq_target(base: &[u8], k: usize) -> Option<String> {
    if base.len() < 2 || base.len() % 2 != 0 {
        return None;
    }
    let mut units: Vec<u16> = base
        .chunks(2)
        .map(|c| u16::from_be_bytes([c[0], c[1]]))
        .collect();
    if let Some(last) = units.last_mut() {
        *last = last.wrapping_add(k as u16);
    }
    String::from_utf16(&units).ok()
}

fn int_from_bytes(b: &[u8]) -> u32 {
    b.iter().fold(0u32, |acc, &x| (acc << 8) | x as u32)
}

fn int_to_bytes(v: u32, width: usize) -> Vec<u8> {
    let w = width.max(1);
    let mut out = Vec::with_capacity(w);
    for shift in (0..w).rev() {
        out.push(((v >> (8 * shift)) & 0xFF) as u8);
    }
    out
}

/// 解析 ToUnicode CMap：字符码（1~2 字节）→ Unicode 字符串
fn parse_to_unicode(data: &[u8]) -> HashMap<Vec<u8>, String> {
    let text = String::from_utf8_lossy(data);
    let mut map = HashMap::new();
    let mut mode = 0u8; // 0 无 / 1 bfchar / 2 bfrange
    for raw in text.lines() {
        let line = raw.trim();
        // 注意：真实 CMap 的段落行带计数前缀（如 `5 beginbfchar`），必须按词匹配而非 starts_with
        let op = |op: &str| line.split_whitespace().any(|w| w == op);
        if op("beginbfchar") {
            mode = 1;
            continue;
        }
        if op("endbfchar") {
            mode = 0;
            continue;
        }
        if op("beginbfrange") {
            mode = 2;
            continue;
        }
        if op("endbfrange") {
            mode = 0;
            continue;
        }
        if mode == 0 {
            continue;
        }
        let toks = hex_tokens(line);
        match mode {
            1 => {
                if toks.len() >= 2 {
                    if let Some(dst) = utf16be_to_string(&toks[1]) {
                        map.insert(toks[0].clone(), dst);
                    }
                }
            }
            2 => {
                if toks.len() < 3 {
                    continue;
                }
                let lo = int_from_bytes(&toks[0]);
                let hi = int_from_bytes(&toks[1]);
                if hi < lo || hi - lo > 0x10000 {
                    continue;
                }
                let width = toks[0].len().max(toks[1].len());
                if toks.len() == 3 {
                    // <lo> <hi> <dstStart>：顺序映射
                    for k in 0..=(hi - lo) {
                        if let Some(dst) = seq_target(&toks[2], k as usize) {
                            map.insert(int_to_bytes(lo + k, width), dst);
                        }
                    }
                } else {
                    // <lo> <hi> [<d1> <d2> ...]：数组映射
                    for (k, d) in toks[2..].iter().enumerate() {
                        if k as u32 > hi - lo {
                            break;
                        }
                        if let Some(dst) = utf16be_to_string(d) {
                            map.insert(int_to_bytes(lo + k as u32, width), dst);
                        }
                    }
                }
            }
            _ => {}
        }
    }
    map
}

// ---------------------------------------------------------------------------
// 页面内容流解析（轻量 tokenizer，提取 Tj / TJ 文本）
// ---------------------------------------------------------------------------

// Num 仅作为操作数占位（位置信息当前不参与匹配），编译器会提示字段未读，忽略即可
#[derive(Debug, Clone)]
#[allow(dead_code)]
enum Tok {
    Name(String),
    Num(f64),
    Str(Vec<u8>),
    Arr(Vec<Tok>),
    Word(String),
}

fn is_delim(c: u8) -> bool {
    matches!(
        c,
        b' ' | b'\t' | b'\r' | b'\n' | 0x0C | 0x00 | b'(' | b')' | b'<' | b'>' | b'[' | b']' | b'{' | b'}' | b'/' | b'%'
    )
}

fn read_literal(input: &[u8], start: usize) -> (Vec<u8>, usize) {
    let n = input.len();
    let mut out = Vec::new();
    let mut depth = 1usize;
    let mut i = start + 1;
    while i < n {
        match input[i] {
            b'\\' => {
                i += 1;
                if i >= n {
                    break;
                }
                match input[i] {
                    b'n' => {
                        out.push(b'\n');
                        i += 1;
                    }
                    b'r' => {
                        out.push(b'\r');
                        i += 1;
                    }
                    b't' => {
                        out.push(b'\t');
                        i += 1;
                    }
                    b'b' => {
                        out.push(8);
                        i += 1;
                    }
                    b'f' => {
                        out.push(12);
                        i += 1;
                    }
                    b'(' => {
                        out.push(b'(');
                        i += 1;
                    }
                    b')' => {
                        out.push(b')');
                        i += 1;
                    }
                    b'\\' => {
                        out.push(b'\\');
                        i += 1;
                    }
                    b'\r' => {
                        i += 1;
                        if i < n && input[i] == b'\n' {
                            i += 1;
                        }
                    }
                    b'\n' => {
                        i += 1;
                    }
                    b'0'..=b'7' => {
                        let mut v = 0u8;
                        let mut k = 0;
                        while k < 3 && i < n && (b'0'..=b'7').contains(&input[i]) {
                            v = v * 8 + (input[i] - b'0');
                            i += 1;
                            k += 1;
                        }
                        out.push(v);
                    }
                    _ => {
                        i += 1;
                    }
                }
            }
            b'(' => {
                depth += 1;
                out.push(b'(');
                i += 1;
            }
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return (out, i + 1);
                }
                out.push(b')');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    (out, n)
}

fn read_hex(input: &[u8], start: usize) -> (Vec<u8>, usize) {
    let n = input.len();
    let mut nib = Vec::new();
    let mut i = start + 1;
    while i < n && input[i] != b'>' {
        if let Some(d) = hex_val(input[i]) {
            nib.push(d);
        }
        i += 1;
    }
    let mut out = Vec::with_capacity((nib.len() + 1) / 2);
    let mut k = 0;
    while k + 1 < nib.len() {
        out.push((nib[k] << 4) | nib[k + 1]);
        k += 2;
    }
    if k < nib.len() {
        out.push(nib[k] << 4);
    }
    (out, i + 1)
}

fn read_array(input: &[u8], start: usize) -> (Vec<Tok>, usize) {
    let n = input.len();
    let mut toks = Vec::new();
    let mut i = start + 1;
    while i < n {
        match input[i] {
            b']' => return (toks, i + 1),
            b' ' | b'\t' | b'\r' | b'\n' | 0x0C | 0x00 => {
                i += 1;
            }
            b'%' => {
                while i < n && input[i] != b'\n' {
                    i += 1;
                }
            }
            b'(' => {
                let (s, ni) = read_literal(input, i);
                toks.push(Tok::Str(s));
                i = ni;
            }
            b'<' => {
                let (s, ni) = read_hex(input, i);
                toks.push(Tok::Str(s));
                i = ni;
            }
            _ => {
                let mut j = i;
                while j < n && !is_delim(input[j]) && input[j] != b'[' && input[j] != b']' {
                    j += 1;
                }
                if j == i {
                    i += 1; // 未知字节（如嵌套 [）：前进，保证不卡死
                    continue;
                }
                let w = String::from_utf8_lossy(&input[i..j]).into_owned();
                if let Ok(num) = w.parse::<f64>() {
                    toks.push(Tok::Num(num));
                } else {
                    toks.push(Tok::Word(w));
                }
                i = j;
            }
        }
    }
    (toks, n)
}

fn tokenize(input: &[u8]) -> Vec<Tok> {
    // 防御：任何情况下不得无进展死循环（真实 Chromium 内容流含 `<<`/`>>`、游离 `>`、二进制段等）
    const MAX_TOKENS: usize = 200_000;
    let n = input.len();
    let mut toks = Vec::new();
    let mut i = 0;
    while i < n {
        if toks.len() >= MAX_TOKENS {
            break;
        }
        match input[i] {
            b' ' | b'\t' | b'\r' | b'\n' | 0x0C | 0x00 => {
                i += 1;
            }
            b'%' => {
                while i < n && input[i] != b'\n' {
                    i += 1;
                }
            }
            b'(' => {
                let (s, ni) = read_literal(input, i);
                toks.push(Tok::Str(s));
                i = ni;
            }
            b'<' => {
                if i + 1 < n && input[i + 1] == b'<' {
                    i += 2; // 字典开括号 <<
                } else {
                    let (s, ni) = read_hex(input, i);
                    toks.push(Tok::Str(s));
                    i = ni;
                }
            }
            b'>' => {
                if i + 1 < n && input[i + 1] == b'>' {
                    i += 2; // 字典闭括号 >>
                } else {
                    i += 1; // 游离的 >
                }
            }
            b'/' => {
                let mut j = i + 1;
                while j < n && !is_delim(input[j]) {
                    j += 1;
                }
                toks.push(Tok::Name(String::from_utf8_lossy(&input[i + 1..j]).into_owned()));
                i = j;
            }
            b'[' => {
                let (a, ni) = read_array(input, i);
                toks.push(Tok::Arr(a));
                i = ni;
            }
            b']' => {
                i += 1;
            }
            _ => {
                let mut j = i;
                while j < n && !is_delim(input[j]) && input[j] != b'[' && input[j] != b']' {
                    j += 1;
                }
                if j == i {
                    i += 1; // 未知字节：前进，保证不卡死
                    continue;
                }
                let w = String::from_utf8_lossy(&input[i..j]).into_owned();
                if let Ok(num) = w.parse::<f64>() {
                    toks.push(Tok::Num(num));
                } else {
                    toks.push(Tok::Word(w));
                }
                i = j;
            }
        }
    }
    toks
}

/// 用 ToUnicode 映射解码一段文本字节（优先 2 字节码，失败回退 1 字节）
fn decode_with_cmap(bytes: &[u8], cmap: &HashMap<Vec<u8>, String>) -> String {
    let mut s = String::new();
    let mut i = 0;
    while i < bytes.len() {
        if i + 1 < bytes.len() {
            if let Some(v) = cmap.get(&bytes[i..i + 2]) {
                s.push_str(v);
                i += 2;
                continue;
            }
        }
        if let Some(v) = cmap.get(&bytes[i..i + 1]) {
            s.push_str(v);
            i += 1;
            continue;
        }
        // 无法解码的字节按 latin-1 保底（正常情况不会走到这里）
        s.push(bytes[i] as char);
        i += 1;
    }
    s
}

/// 页面的字体资源：字体资源名（/F1 等）→ ToUnicode 映射表。
///
/// `cache` 以 ToUnicode 对象的 ObjectId 为键做跨页复用：Chromium 打印产物中
/// 字体对象是全文档共享的，原来逐页解压并重新解析同一份 CMap，
/// 100 页文档会把同一份映射表解析 100 次，这是大纲注入在大文档上的主要耗时。
fn page_fonts(
    doc: &Document,
    page_id: ObjectId,
    cache: &mut HashMap<ObjectId, HashMap<Vec<u8>, String>>,
) -> HashMap<String, HashMap<Vec<u8>, String>> {
    let mut result = HashMap::new();
    let Ok(page) = doc.get_dictionary(page_id) else {
        return result;
    };
    let Ok(resources) = page.get_deref(b"Resources", doc) else {
        return result;
    };
    let Ok(resources_dict) = resources.as_dict() else {
        return result;
    };
    let Ok(fonts) = resources_dict.get_deref(b"Font", doc) else {
        return result;
    };
    let Ok(fonts_dict) = fonts.as_dict() else {
        return result;
    };
    for (name, obj) in fonts_dict.iter() {
        let name = String::from_utf8_lossy(name).into_owned();
        let font_dict = match obj {
            Object::Reference(id) => doc
                .get_object(*id)
                .ok()
                .and_then(|o| o.as_dict().ok()),
            o => o.as_dict().ok(),
        };
        let Some(font_dict) = font_dict else {
            continue;
        };
        let Ok(tou) = font_dict.get(b"ToUnicode") else {
            continue;
        };
        // 用引用避免 clone 整个 Stream（流数据可能上百 KB）
        let (tou_obj, tou_id): (&Object, Option<ObjectId>) = match tou {
            Object::Reference(id) => match doc.get_object(*id) {
                Ok(o) => (o, Some(*id)),
                Err(_) => continue,
            },
            o => (o, None),
        };
        let cmap = match tou_id {
            Some(id) => {
                if let Some(c) = cache.get(&id) {
                    c.clone()
                } else {
                    let c = parse_cmap_object(tou_obj);
                    cache.insert(id, c.clone());
                    c
                }
            }
            None => parse_cmap_object(tou_obj),
        };
        result.insert(name, cmap);
    }
    result
}

/// 从 ToUnicode 对象解析 CMap（流可能带 /FlateDecode 过滤器，解析失败回退原始字节）
fn parse_cmap_object(tou: &Object) -> HashMap<Vec<u8>, String> {
    let Ok(stream) = tou.as_stream() else {
        return HashMap::new();
    };
    let data = stream
        .decompressed_content()
        .unwrap_or_else(|_| stream.content.clone());
    parse_to_unicode(&data)
}

/// 抽取页面全部文本（按内容流操作顺序拼接，Chromium 会把同一行的多个文本块连续输出）
fn extract_page_text(
    doc: &Document,
    page_id: ObjectId,
    fonts: &HashMap<String, HashMap<Vec<u8>, String>>,
) -> String {
    let Ok(bytes) = doc.get_page_content(page_id) else {
        return String::new();
    };
    let toks = tokenize(&bytes);
    let mut pending: Vec<Tok> = Vec::new();
    let mut cur_font: Option<&HashMap<Vec<u8>, String>> = None;
    // Chromium 用 `/Span <</ActualText <FEFF...>> BDC ... EMC` 包裹文本，ActualText
    // 是真实 Unicode（比 ToUnicode CMap 可靠——子集字体的 CMap 有时会映射到 Kangxi 部首区）。
    let mut span_text: Option<String> = None;
    let mut span_applied = false;
    let mut out = String::new();
    for t in toks {
        match t {
            Tok::Name(_) | Tok::Num(_) | Tok::Str(_) | Tok::Arr(_) => pending.push(t),
            Tok::Word(w) => {
                match w.as_str() {
                    "Tf" => {
                        let font_name = pending.iter().rev().find_map(|p| match p {
                            Tok::Name(n) => Some(n.clone()),
                            _ => None,
                        });
                        if let Some(name) = font_name {
                            cur_font = fonts.get(&name);
                        }
                    }
                    "BDC" => {
                        span_text = pending.iter().rev().find_map(|p| match p {
                            Tok::Str(bytes)
                                if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF =>
                            {
                                utf16be_to_string(&bytes[2..])
                            }
                            _ => None,
                        });
                        span_applied = false;
                    }
                    "EMC" => {
                        span_text = None;
                        span_applied = false;
                    }
                    "Tj" => {
                        if let Some(Tok::Str(bytes)) = pending.pop() {
                            if let Some(actual) = span_text.as_ref() {
                                if !span_applied {
                                    out.push_str(actual);
                                    span_applied = true;
                                }
                            } else {
                                match cur_font {
                                    Some(cmap) => out.push_str(&decode_with_cmap(&bytes, cmap)),
                                    None => out.push_str(&String::from_utf8_lossy(&bytes)),
                                }
                            }
                        }
                    }
                    "TJ" => {
                        if let Some(Tok::Arr(items)) = pending.pop() {
                            if let Some(actual) = span_text.as_ref() {
                                if !span_applied {
                                    out.push_str(actual);
                                    span_applied = true;
                                }
                            } else {
                                for item in items {
                                    if let Tok::Str(bytes) = item {
                                        match cur_font {
                                            Some(cmap) => {
                                                out.push_str(&decode_with_cmap(&bytes, cmap))
                                            }
                                            None => out.push_str(&String::from_utf8_lossy(&bytes)),
                                        }
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
                pending.clear();
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// 大纲树构建与写入
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct Node {
    title: String,
    page: u32,
    children: Vec<Node>,
}

/// 按标题层级把扁平列表组装成树（标准栈算法）
fn build_tree(targets: &[(u32, String, u32)]) -> Vec<Node> {
    struct Raw {
        level: u32,
        title: String,
        page: u32,
        parent: Option<usize>,
        children: Vec<usize>,
    }
    let mut arena: Vec<Raw> = Vec::new();
    let mut stack: Vec<usize> = Vec::new();
    for (level, title, page) in targets {
        while let Some(&top) = stack.last() {
            if arena[top].level >= *level {
                stack.pop();
            } else {
                break;
            }
        }
        let parent = stack.last().copied();
        let idx = arena.len();
        if let Some(p) = parent {
            arena[p].children.push(idx);
        }
        arena.push(Raw {
            level: *level,
            title: title.clone(),
            page: *page,
            parent,
            children: Vec::new(),
        });
        stack.push(idx);
    }
    fn conv(arena: &[Raw], idx: usize) -> Node {
        Node {
            title: arena[idx].title.clone(),
            page: arena[idx].page,
            children: arena[idx]
                .children
                .iter()
                .map(|&c| conv(arena, c))
                .collect(),
        }
    }
    arena
        .iter()
        .enumerate()
        .filter(|(_, r)| r.parent.is_none())
        .map(|(i, _)| conv(&arena, i))
        .collect()
}

fn alloc_id(doc: &mut Document) -> ObjectId {
    doc.max_id += 1;
    (doc.max_id, 0)
}

/// 递归写入大纲条目，返回 (第一个, 最后一个, 后代总数)
///
/// `pages` 由调用方算好传入：原来每层递归都调一次 doc.get_pages()（它每次都会
/// 遍历整个页面树重建 BTreeMap），标题多时是 O(节点数 × 页面数) 的重复劳动。
#[allow(clippy::type_complexity)]
fn write_nodes(
    doc: &mut Document,
    nodes: &[Node],
    parent: Option<ObjectId>,
    pages: &std::collections::BTreeMap<u32, ObjectId>,
) -> (Option<ObjectId>, Option<ObjectId>, i64) {
    let mut first: Option<ObjectId> = None;
    let mut last: Option<ObjectId> = None;
    let mut total = 0i64;
    for node in nodes {
        let id = alloc_id(doc);
        let mut item = Dictionary::new();
        item.set("Title", pdf_utf16be(&node.title));
        let page_oid = pages.get(&node.page).copied().unwrap_or((1, 0));
        item.set(
            "Dest",
            Object::Array(vec![Object::Reference(page_oid), Object::Name(b"Fit".to_vec())]),
        );
        if let Some(p) = parent {
            item.set("Parent", p);
        }
        let sub = if node.children.is_empty() {
            0
        } else {
            let (f, l, c) = write_nodes(doc, &node.children, Some(id), pages);
            if let Some(f) = f {
                item.set("First", f);
            }
            if let Some(l) = l {
                item.set("Last", l);
            }
            c
        };
        item.set("Count", sub);
        if let Some(prev) = last {
            item.set("Prev", prev);
        }
        doc.objects.insert(id, Object::Dictionary(item));
        if let Some(prev) = last {
            if let Some(Object::Dictionary(d)) = doc.objects.get_mut(&prev) {
                d.set("Next", id);
            }
        } else {
            first = Some(id);
        }
        last = Some(id);
        total += sub + 1;
    }
    (first, last, total)
}

/// 注入大纲到已生成的 PDF：成功 Ok(())；失败返回 Err（调用方可选择忽略，不影响 PDF 本身）。
pub fn inject_outline(pdf_path: &str, entries: &[OutlineEntry]) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }
    let mut doc = Document::load(pdf_path).map_err(|e| format!("读取 PDF 失败：{e}"))?;

    // 1. 抽取每页文本（按页码升序）
    let pages = doc.get_pages();
    if pages.is_empty() {
        return Err("PDF 没有页面".into());
    }
    let mut page_texts: Vec<(u32, String)> = Vec::new();
    let mut font_cache: HashMap<ObjectId, HashMap<Vec<u8>, String>> = HashMap::new();
    for (page_no, page_id) in pages.iter() {
        let fonts = page_fonts(&doc, *page_id, &mut font_cache);
        let text = extract_page_text(&doc, *page_id, &fonts);
        // 与标题一致地归一化（去掉空白），否则 Chromium 输出的单词间空格会破坏 contains 匹配
        page_texts.push((*page_no, normalize(&text)));
    }

    // 2. 标题 → 页码（保持文档顺序：从上一个命中页往后找；未命中则沿用上一个命中页或跳过）
    let mut targets: Vec<(u32, String, u32)> = Vec::new(); // (level, title, page_no)
    let mut cursor = 0usize;
    let mut last_match: Option<u32> = None;
    for entry in entries {
        let norm = normalize(&entry.text);
        if norm.is_empty() {
            continue;
        }
        let mut found: Option<u32> = None;
        for (idx, (page_no, text)) in page_texts.iter().enumerate().skip(cursor) {
            if text.contains(&norm) {
                found = Some(*page_no);
                cursor = idx;
                break;
            }
        }
        let page = match found {
            Some(p) => {
                last_match = Some(p);
                p
            }
            None => match last_match {
                Some(p) => p,
                None => continue, // 完全无法定位：跳过该标题
            },
        };
        targets.push((entry.level, entry.text.clone(), page));
    }
    if targets.is_empty() {
        return Err("无法定位任何标题的页码".into());
    }

    // 3. 组装大纲树并写入对象
    let nodes = build_tree(&targets);
    let root_id = alloc_id(&mut doc);
    let (first, last, total) = write_nodes(&mut doc, &nodes, Some(root_id), &pages);
    let Some(first) = first else {
        return Err("大纲树为空".into());
    };
    let mut root = Dictionary::new();
    root.set("Type", Object::Name(b"Outlines".to_vec()));
    root.set("First", first);
    if let Some(l) = last {
        root.set("Last", l);
    }
    // 根 Outlines 的 /Count 按 PDF 规范（12.3.2.2）在全部展开时必须是
    // **所有层级**的可见条目总数；写顶层条目数会让严格阅读器截断大纲树
    root.set("Count", total as i64);
    doc.objects.insert(root_id, Object::Dictionary(root));

    // 4. 挂到文档目录（/Root → /Outlines）并保存
    let catalog_id = doc
        .trailer
        .get(b"Root")
        .and_then(Object::as_reference)
        .map_err(|_| "找不到 PDF 文档目录".to_string())?;
    let catalog = doc
        .get_dictionary_mut(catalog_id)
        .map_err(|_| "无法访问 PDF 文档目录".to_string())?;
    catalog.set("Outlines", root_id);

    // 原子写回：先写同目录临时文件再 rename 覆盖（Windows 上 rename 是原子的），
    // 避免 save 中途失败（如磁盘满）把刚打印好的 PDF 截断。
    let tmp_save = format!("{pdf_path}.outline.tmp");
    doc.save(&tmp_save).map_err(|e| format!("写回 PDF 失败：{e}"))?;
    if let Err(e) = std::fs::rename(&tmp_save, pdf_path) {
        // rename 失败时清理临时文件，避免 .outline.tmp 残留在用户文档目录
        let _ = std::fs::remove_file(&tmp_save);
        return Err(format!("替换 PDF 失败：{e}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::{dictionary, Stream};

    /// 构造一个 2 页 PDF：第 1 页文本「中文」，第 2 页文本「第二页」
    /// （ToUnicode CMap：<41>→中 <42>→文 <43>→第 <44>→二 <45>→页）。
    /// 返回 (page1_id, page2_id)。
    fn build_test_pdf(path: &std::path::Path) -> (ObjectId, ObjectId) {
        let mut doc = Document::new();
        doc.version = "1.4".to_string();

        let cmap = concat!(
            "/CIDInit /ProcSet findresource begin\n",
            "12 dict begin\n",
            "begincmap\n",
            "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n",
            "/CMapName /Adobe-Identity-UCS def\n",
            "/CMapType 2 def\n",
            "1 begincodespacerange\n",
            "<00> <ff>\n",
            "endcodespacerange\n",
            "5 beginbfchar\n",
            "<41> <4E2D>\n",
            "<42> <6587>\n",
            "<43> <7B2C>\n",
            "<44> <4E8C>\n",
            "<45> <9875>\n",
            "endbfchar\n",
            "endcmap\n",
            "CMapName currentdict /CMap defineresource pop\n",
            "end\n",
            "end\n",
        )
        .as_bytes()
        .to_vec();
        let font_id = doc.add_object(Object::Stream(Stream::new(Dictionary::new(), cmap)));
        let font_obj_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
            "ToUnicode" => font_id,
        }));

        let content1_id = doc.add_object(Object::Stream(Stream::new(
            Dictionary::new(),
            b"BT /F1 12 Tf 1 0 0 1 72 720 Tm <4142> Tj ET".to_vec(),
        )));
        let content2_id = doc.add_object(Object::Stream(Stream::new(
            Dictionary::new(),
            b"BT /F1 12 Tf 1 0 0 1 72 720 Tm <434445> Tj ET".to_vec(),
        )));

        let pages_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Count" => 2,
        }));
        let page1_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content1_id,
            "Resources" => dictionary! { "Font" => dictionary! { "F1" => font_obj_id } },
        }));
        let page2_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content2_id,
            "Resources" => dictionary! { "Font" => dictionary! { "F1" => font_obj_id } },
        }));
        let pages = doc.get_dictionary_mut(pages_id).unwrap();
        pages.set(
            "Kids",
            Object::Array(vec![Object::Reference(page1_id), Object::Reference(page2_id)]),
        );

        let catalog_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        }));
        doc.trailer.set("Root", catalog_id);

        doc.save(path).unwrap();
        (page1_id, page2_id)
    }

    /// 读取大纲条目的 /Title（UTF-16BE + BOM 解码）
    fn title_text(doc: &Document, item_id: ObjectId) -> String {
        let item = doc.get_dictionary(item_id).unwrap();
        match item.get(b"Title").unwrap() {
            Object::String(bytes, _) => {
                if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
                    let units: Vec<u16> = bytes[2..]
                        .chunks(2)
                        .map(|c| u16::from_be_bytes([c[0], c[1]]))
                        .collect();
                    String::from_utf16(&units).unwrap()
                } else {
                    String::from_utf8_lossy(bytes).into_owned()
                }
            }
            _ => panic!("Title 不是字符串"),
        }
    }

    fn dest_page(doc: &Document, item_id: ObjectId) -> ObjectId {
        let item = doc.get_dictionary(item_id).unwrap();
        match item.get(b"Dest").unwrap() {
            Object::Array(a) => a[0].as_reference().unwrap(),
            _ => panic!("Dest 应为数组"),
        }
    }

    #[test]
    fn injects_outline_with_pages() {
        let path = std::env::temp_dir().join(format!("pdf-outline-test-{}.pdf", std::process::id()));
        let (page1_id, page2_id) = build_test_pdf(&path);

        let entries = vec![
            OutlineEntry {
                level: 1,
                text: "中文".into(),
            },
            OutlineEntry {
                level: 2,
                text: "第二页".into(),
            },
        ];
        inject_outline(path.to_str().unwrap(), &entries).expect("inject_outline 应成功");

        // 重新加载校验
        let doc = Document::load(&path).expect("重新加载 PDF");
        let catalog_id = doc
            .trailer
            .get(b"Root")
            .and_then(Object::as_reference)
            .unwrap();
        let catalog = doc.get_dictionary(catalog_id).unwrap();
        let outlines_ref = catalog.get(b"Outlines").and_then(Object::as_reference).unwrap();
        let outlines = doc.get_dictionary(outlines_ref).unwrap();
        let count = outlines.get(b"Count").and_then(Object::as_i64).unwrap();
        assert_eq!(count, 1, "顶层应有 1 个大纲条目（h2 是 h1 的子级）");
        let first = outlines.get(b"First").and_then(Object::as_reference).unwrap();
        let last = outlines.get(b"Last").and_then(Object::as_reference).unwrap();
        assert_eq!(first, last, "只有一个顶层条目");

        // 顶层条目：中文 → 第 1 页，含子条目 第二页
        assert_eq!(title_text(&doc, first), "中文");
        assert_eq!(dest_page(&doc, first), page1_id, "中文应定位到第 1 页");
        let item1 = doc.get_dictionary(first).unwrap();
        let child_first = item1.get(b"First").and_then(Object::as_reference).unwrap();
        let child_last = item1.get(b"Last").and_then(Object::as_reference).unwrap();
        assert_eq!(child_first, child_last, "子条目只有一个");
        let sub_count = item1.get(b"Count").and_then(Object::as_i64).unwrap();
        assert_eq!(sub_count, 1, "中文应有 1 个子条目");

        // 子条目：第二页 → 第 2 页，Parent 指向顶层条目
        assert_eq!(title_text(&doc, child_first), "第二页");
        assert_eq!(dest_page(&doc, child_first), page2_id, "第二页应定位到第 2 页");
        let parent = doc
            .get_dictionary(child_first)
            .unwrap()
            .get(b"Parent")
            .and_then(Object::as_reference)
            .unwrap();
        assert_eq!(parent, first, "子条目 Parent 应指向顶层条目");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn unmatched_heading_falls_back() {
        let path = std::env::temp_dir().join(format!("pdf-outline-fallback-{}.pdf", std::process::id()));
        build_test_pdf(&path);

        // 「不存在」无法匹配 → 应沿用上一个命中页（第 1 页）
        let entries = vec![
            OutlineEntry {
                level: 1,
                text: "中文".into(),
            },
            OutlineEntry {
                level: 1,
                text: "不存在的标题".into(),
            },
        ];
        inject_outline(path.to_str().unwrap(), &entries).expect("inject_outline 应成功");

        let doc = Document::load(&path).expect("重新加载 PDF");
        let catalog_id = doc
            .trailer
            .get(b"Root")
            .and_then(Object::as_reference)
            .unwrap();
        let catalog = doc.get_dictionary(catalog_id).unwrap();
        let outlines_ref = catalog.get(b"Outlines").and_then(Object::as_reference).unwrap();
        let outlines = doc.get_dictionary(outlines_ref).unwrap();
        let first = outlines.get(b"First").and_then(Object::as_reference).unwrap();
        assert_eq!(title_text(&doc, first), "中文");
        let last = outlines.get(b"Last").and_then(Object::as_reference).unwrap();
        assert_eq!(title_text(&doc, last), "不存在的标题");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn extracts_text_with_to_unicode() {
        let path = std::env::temp_dir().join("pdf-outline-debug.pdf");
        build_test_pdf(&path);
        let doc = Document::load(&path).unwrap();
        let pages = doc.get_pages();
        let mut font_cache: HashMap<ObjectId, HashMap<Vec<u8>, String>> = HashMap::new();
        for (no, id) in pages.iter() {
            let fonts = page_fonts(&doc, *id, &mut font_cache);
            assert!(!fonts.is_empty(), "第 {} 页应解析出字体 ToUnicode", no);
            let text = extract_page_text(&doc, *id, &fonts);
            assert!(!text.is_empty(), "第 {} 页应抽取到文本", no);
        }
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn real_chromium_pdf_outline() {
        // 用真实的 Chromium 内核（Chrome/Edge，与 WebView2 同源）生成 PDF 再注入大纲，
        // 覆盖 xref 流 + FlateDecode + 子集字体 ToUnicode 等真实产物特征。
        let chrome = std::env::var("CHROME_PATH").ok().or_else(|| {
            [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            ]
            .iter()
            .find(|p| std::path::Path::new(p).exists())
            .map(|s| s.to_string())
        });
        let Some(chrome) = chrome else {
            eprintln!("未找到 Chrome/Edge，跳过真实 Chromium 集成测试");
            return;
        };

        let dir = std::env::temp_dir();
        let html_path = dir.join(format!("pdf-outline-real-{}.html", std::process::id()));
        let pdf_path = dir.join(format!("pdf-outline-real-{}.pdf", std::process::id()));
        let html = concat!(
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\">",
            "<style>@page{size:A4;margin:15mm}h1{font-size:24pt}h2{font-size:18pt}",
            ".page{page-break-after:always}</style></head><body>",
            "<h1>第一章 简介</h1><p>这是正文内容。</p><div class=\"page\"></div>",
            "<h2>1.1 背景</h2><p>第二页正文。</p><div class=\"page\"></div>",
            "<h1>第二章 深入</h1><p>第三页正文。</p></body></html>",
        );
        std::fs::write(&html_path, html).unwrap();

        let user_dir = dir.join(format!("pdf-outline-chrome-{}", std::process::id()));
        let output = std::process::Command::new(&chrome)
            .args(["--headless=new", "--disable-gpu", "--no-pdf-header-footer"])
            .arg(format!("--user-data-dir={}", user_dir.display()))
            .arg(format!("--print-to-pdf={}", pdf_path.display()))
            .arg(html_path.to_str().unwrap())
            .output();
        let _ = std::fs::remove_dir_all(&user_dir);
        let _ = std::fs::remove_file(&html_path);

        let Ok(output) = output else {
            return; // 启动失败：跳过
        };
        if !pdf_path.exists() {
            eprintln!(
                "Chrome 未生成 PDF，跳过：{}",
                String::from_utf8_lossy(&output.stderr)
            );
            return;
        }

        let entries = vec![
            OutlineEntry {
                level: 1,
                text: "第一章 简介".into(),
            },
            OutlineEntry {
                level: 2,
                text: "1.1 背景".into(),
            },
            OutlineEntry {
                level: 1,
                text: "第二章 深入".into(),
            },
        ];
        inject_outline(pdf_path.to_str().unwrap(), &entries).expect("inject_outline 应成功");

        let doc = Document::load(&pdf_path).expect("重新加载真实 Chromium PDF");
        let catalog_id = doc
            .trailer
            .get(b"Root")
            .and_then(Object::as_reference)
            .unwrap();
        let catalog = doc.get_dictionary(catalog_id).unwrap();
        let outlines_ref = catalog
            .get(b"Outlines")
            .and_then(Object::as_reference)
            .unwrap();
        let outlines = doc.get_dictionary(outlines_ref).unwrap();
        let count = outlines.get(b"Count").and_then(Object::as_i64).unwrap();
        assert_eq!(count, 2, "顶层应有 2 个条目（1.1 是第一章的子级）");
        let first = outlines.get(b"First").and_then(Object::as_reference).unwrap();
        let last = outlines.get(b"Last").and_then(Object::as_reference).unwrap();
        assert_eq!(title_text(&doc, first), "第一章 简介");
        assert_eq!(title_text(&doc, last), "第二章 深入");

        // 1.1 背景 是 第一章 的子条目
        let item1 = doc.get_dictionary(first).unwrap();
        let child = item1.get(b"First").and_then(Object::as_reference).unwrap();
        assert_eq!(title_text(&doc, child), "1.1 背景");

        // 页面定位：第一章 → 第 1 页，第二章 → 第 3 页
        let pages = doc.get_pages();
        let page_of = |dest: ObjectId| {
            pages
                .iter()
                .find(|(_, v)| **v == dest)
                .map(|(k, _)| *k)
                .unwrap()
        };
        assert_eq!(page_of(dest_page(&doc, first)), 1, "第一章应在第 1 页");
        assert_eq!(page_of(dest_page(&doc, last)), 3, "第二章应在第 3 页");

        let _ = std::fs::remove_file(&pdf_path);
    }
}
