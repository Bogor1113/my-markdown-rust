# MyMdEdit 代码审查与优化建议

> 审查日期：2026-11-13
> 项目：`D:/my-markdown-rust`（Tauri v2 + React 19 + Milkdown 7）
> 审查范围：前端 `src/` 18,475 行 TS/TSX + 88 KB CSS、Rust `src-tauri/src/` 3,370 行、构建脚本、配置、测试与 CDP 工具库
> 方法：按 5 个模块并行静态审查 → 对高危项逐条回读源码复核 → 对可复现结论做最小验证
> **口径说明**：标「已复核」的条目已亲自读源码确认；标「需实测」的属于静态推断成立但触发条件依赖运行时时序，建议先写回归用例再改；未复核的推测未写入本文。

## 0. 摘要

| 级别 | 数量 | 典型后果 |
| --- | --- | --- |
| P0 致命 | 6 | 进程崩溃、未保存内容丢失、不可逆删除、发布错版本 |
| P1 高危 | 14 | 功能不可用、UI 全应用级损坏、release 攻击面 |
| P2 中风险 | 13 | 边界条件下错图/错位/静默降级 |
| P3 优化 | 13 类 + 5 项 UI 一致性 | 启动体积、输入性能、构建与测试可靠性 |

**最该先做的 5 件事**：① 修 Rust 搜索/替换的 UTF-8 偏移 panic；② 修回收站取消判断顺序；③ 修重命名后 `activeTabId` 与 `tab.id` 分叉；④ 统一退出保存的前后端超时与失败反馈；⑤ 构建脚本加版本回滚与产物 mtime 校验。这 5 项都直接关系**数据不可恢复或版本不可信**。

---

# 一、P0 致命（数据丢失 / 崩溃 / 不可逆）

## P0-1 Rust 搜索与批量替换用「小写串的字节偏移」切原串 → 非字符边界 panic

- **位置**：`src-tauri/src/commands/search.rs:142-152`（`line_match_utf16`）、`search.rs:274-292`（`replace_ci`）
- **复核**：已复核，并用 Python 复现了偏移错位

```rust
if line_lower.len() == line.len() {          // 只比总长
    return line_lower.match_indices(query_lower).map(|(s, m)| {
        let start = line[..s].encode_utf16().count();   // s 来自 line_lower
        let end = start + line[s..s + m.len()].encode_utf16().count();
```

守卫的前提是「小写化不改变字节长度」，但**总长相等不代表逐字符字节长相等**：`İ`(2B) → `i̇`(`i` + 组合点，共 3B) 与 `ẞ`(3B) → `ß`(2B) 可以互相抵消。按 Rust 的字节偏移语义实测：

```
原文 "İẞX"  = [c4 b0 | e1 ba 9e | 58]          6 bytes
小写 "i̇ßx"  = [69 | cc 87 | c3 9f | 78]        6 bytes  → 快路径被选中
match_indices("ß") 的字节偏移 = 3
line[..3] 截在 "ẞ"(e1 ba 9e, 偏移 2..4) 中间 → 不是 char boundary → panic
（等价验证：取原文前 3 字节 `c4 b0 e1` 无法整体解码为 UTF-8，Python 报
`unexpected end of data`；Rust 会直接 `panic: byte index 3 is not a char boundary`）
```

`replace_ci` 同样把 `content_lower` 的 `s/e` 直接用于 `content[last..s]`，更坏的情况是偏移「合法但错位」→ 替换出被截断/串位的文件，而后端是原子写，会直接落盘。

- **放大因素**：`src-tauri/Cargo.toml:65` 设了 `panic = "abort"`，任意 panic 不是「本次搜索失败」，而是**整个进程退出**，所有未保存标签一并消失。
- **影响**：搜索含土耳其语 `İ`、德语 `ẞ`、部分数学符号（如 `K`）的笔记必崩；批量替换可能静默写坏文件。
- **建议**：删除两条快路径，统一走 `search.rs:155-171` / `:295+` 的逐 `char` 路径；或在切片前 `assert!(content.is_char_boundary(s))`，不满足则退慢路径。同时把 `panic` 改为 `unwind`，或至少给 `spawn_blocking` 闭包包 `catch_unwind`。

## P0-2 回收站「用户取消」被判成「回收站不可用」→ 不可逆永久删除

- **位置**：`src-tauri/src/commands/file.rs:281-289`（调用方 `file.rs:222-235`）
- **复核**：已复核，且代码注释与实现自相矛盾

```rust
let ret = SHFileOperationW(&mut op);
if ret != 0 { return Err(RecycleError::Unavailable(...)); }   // 先判返回值
if op.fAnyOperationsAborted != 0 { return Err(RecycleError::Aborted); }  // 永远可能不可达
```

`SHFileOperationW` 在被取消（含 UAC/占用弹窗被拒、返回 `DE_OPCANCELLED 0x4C7`）时**可以同时返回非零 ret 并置 `fAnyOperationsAborted`**。而 `file.rs:285-286` 的注释明确写着「调用方对 Aborted 不得降级为永久删除」——判断顺序让这条保护形同虚设。

- **影响**：用户取消删除 → 走 `Unavailable` 分支 → `remove_dir_all` / `remove_file` **不可逆删除**，UI 还提示「已直接删除」。误删整个笔记目录无法恢复。
- **建议**：把 `fAnyOperationsAborted` 判断提到 `ret` 之前；把 `0x4C7` 等取消码显式映射为 `Aborted`；UNC 网络盘本就没有回收站，应直接拒绝而不是降级。

## P0-3 重命名只 remap `activeTabId`、不 remap `tab.id` → 编辑区空白、保存静默失效

- **位置**：`src/stores/useAppStore.ts:846-867`；`tab.id = path` 见 `:790`
- **复核**：已复核

```ts
tabs: s.tabs.map((t) => {
  const path = remap(t.path)
  if (path === t.path) return t
  return { ...t, path, name: ... }        // id 保持旧路径
}),
activeTabId: s.activeTabId ? remap(s.activeTabId) : s.activeTabId,  // id 语义被改成新路径
```

`openFile` 把 `id` 直接赋成 `path`，全项目把两者当同一个东西用。重命名当前文件（或其父目录）后，`activeTabId` 变成新路径，而任何 `tab.id` 都不是它。

- **影响**：`EditorArea` 的 `tabs.find(t => t.id === activeTabId)` 返回 `undefined` → 编辑区空白、Milkdown 被卸载；`saveCurrentFile` → `saveTab(activeTabId)` → `saveTab` 内部 `find` 不到 → `if (!tab || !tab.isDirty) return`（`useAppStore.ts:959`）**静默不写盘且无 toast**；`imageDisplay.currentDocDir()` 取不到目录导致相对图片全裂；`persistSession` 把 `activePath` 与 `openPaths` 两种语义混写，重启后活动标签退化。
- **建议**：`id` 作为稳定内部标识，重命名时**不要** remap `activeTabId`；若坚持让 id 跟随路径，则同步 remap `t.id` 并迁移所有以 id 为键的 Map（`cachesRef` / `snapshotRef` / `onChangeByKeyRef` / `_saveInflight`）。另把 `persistSession` 的 `activePath` 改成 `tabs.find(t => t.id === activeTabId)?.path`。

## P0-4 退出保存：前端 5s、Rust 3s，超时与失败都当成功，然后无条件退出

- **位置**：`src/stores/useAppStore.ts:991-1009`、`src/App.tsx:204-218`、`src-tauri/src/lib.rs:119`
- **复核**：已复核（三处代码 + 常量）

```ts
await Promise.race([Promise.all(tasks), timeout])   // 5s 到点 resolve 成「成功」
// tasks 里 saveTab(...).catch(e => showToast(...)) 把失败全部吞掉
```
```tsx
.flushAllDirty().finally(() => { void invoke('quit_now') })   // finally 无条件执行
```
```
const QUIT_FLUSH_GRACE_MS: u64 = 3000;   // Rust 侧 3s 兜底
```

`FLUSH_TIMEOUT_MS = 5000`（`useAppStore.ts:188`）**大于 Rust 的 3s**，重负载下前端还没刷完进程就被结束；写盘失败只弹一个窗口已销毁后看不到的 toast。

- **影响**：网络盘/大文件写盘慢、`writeFile` 因权限/磁盘满/文件被删 reject 时，未落盘的编辑随窗口销毁丢失，用户完全无感知。
- **建议**：`race` 的超时分支返回失败标记而非 resolve；`quit_now` 从 `finally` 移到「所有 tasks 真正 fulfilled」之后；`flushAllDirty` 返回失败清单，失败时走 Rust 侧「N 个文件未保存，仍退出？」确认；统一前后端超时（前端上限必须小于 Rust 兜底）。

## P0-5 「整理文档格式」用 200ms 前的 store 内容整体重建文档，丢最后一次输入

- **位置**：`src/plugins/docActions.ts:151-165`；调用点 `Toolbar.tsx:393-396`、`CommandPalette.tsx:55`
- **复核**：已复核，并与正确实现做了对照

```ts
const md = tabs.find((t) => t.id === activeTabId)?.content ?? ''
const formatted = formatMarkdown(md)
editor.action((ctx) => { replaceAll(formatted)(ctx) })
```

`tab.content` 由 `MilkdownEditor` 的 `dirtyTracker` 在停顿 **200ms** 后才回写（`MilkdownEditor.tsx:524` 的 `}, 200)`）。而 `saveTab` 明确知道要防这一点：

```ts
// useAppStore.ts:957
get().contentFlusher?.()   // 保存前强制 flush
```

两个调用点都没做这一步，且 `replaceAll` 会清空撤销栈。

- **影响**：敲完立刻点「整理文档格式」，最近 200ms 的输入被静默丢弃且无法撤销找回。
- **建议**：格式化前先 `useAppStore.getState().contentFlusher?.()`；或直接用 `ctx.get(serializerCtx)(view.state.doc)` 取当前文档（与 `svgSourceEditor.applySaveNow` 一致）。

## P0-6 构建失败仍把上一次的旧 exe 复制成新版本号，并报告「Build finished successfully」

- **位置**：`build.bat:37,53-54,61-62,74-79`、`scripts/rename-exe.cjs:24-37`
- **复核**：已复核（脚本控制流 + 产物脚本全文）

```js
if (!fs.existsSync(src)) { console.log('[WARN] ...'); process.exit(0) }  // 没产物也「成功」
if (fs.existsSync(to)) fs.unlinkSync(to)
fs.copyFileSync(src, to)   // 未校验 src 是不是本次构建的产物
```

版本号在 Step 1 就写进 `package.json` / `Cargo.toml` / `Cargo.lock` / `tauri.conf.json`，Step 2 失败后 `:fail` 只 echo + pause，**无回滚**；Rust 构建失败也不会删除 `target/release/` 里上一次的 exe。只要 `:54 if errorlevel 1 goto :fail` 未能跳转（见 P3-1 的行尾问题），Step 3 就会把旧二进制复制成新版本号并打印成功。

- **影响**：发布 `MyMd-v2.0.5.exe` 而内容仍是 2.0.4；失败后四个文件已被写脏，重跑再 +1，版本号与产物彻底失配。
- **建议**：bump 前备份四个文件，任一失败恢复；或把「写版本号」移到构建成功之后（Step 1 只计算 next）。`rename-exe.cjs` 记录构建开始时间、校验 `src` 的 mtime 晚于该时间；`!existsSync(src)` 必须 `process.exit(1)`。

---

# 二、P1 高危（功能不可用 / 状态损坏 / 发布安全）

## P1-1 拆分单元格生成 `paragraph > paragraph` 非法文档
`src/plugins/table.ts:152-164`。`children.push(cell.content.child(j))` 取的是**段落节点**，又经 `wrapInlineToCell` 再包一层 paragraph（`:80-84`）；`childCount` 是段落数（通常 1），`colspan=2` 时第一个新 cell 拿到空数组、第二个拿到 `paragraph>paragraph`。点击「拆分单元格」即产出 schema 违规节点。文件自己在 `:69-77` 已备好正确的 `collectInlineNodes()`（合并单元格在用），拆分应改用它，按 colspan 均分行内节点后包成**一个** paragraph。

## P1-2 Delete 键分支是 Backspace 的复制粘贴，成对括号里按 Delete 删掉两个字符
`src/plugins/autoPair.ts:142-160` 与 `:122-140` 一字不差，都是 `tr.delete($pos.pos - 1, $pos.pos + 1)`。光标在自动配出的 `()` 中间按 Delete，开括号也被删掉，属静默内容丢失。Delete 分支应只处理 `pos..pos+1`（删闭合符）或整段删掉交还 PM。

## P1-3 亮色主题的语法高亮 CSS 选择器写错，浅色下失效且 `<html>` 被错误着色
`src/index.css:606-616`、`:1200-1202`：

```css
:root[data-theme='light'], :root[data-theme='paper'] .ProseMirror pre code .hljs-keyword,
... { color: #d73a49; }
```

逗号让 `:root[data-theme='light']` 单独成为一个选择器（作用于 `<html>`），真正带后代选择器的只有 `data-theme='paper'` 分支；而 `themes.ts:267` 只写 `root.dataset.theme = p.kind`（`light|dark`），`paper` 已被迁移，DOM 上永远不存在该值。结果：亮色主题代码块沿用 One Dark 深色配色，且 `<html>` 被反复设置 `color` / `background`。每条选择器都要补全 `:root[data-theme='light'] .ProseMirror pre code .hljs-xxx`。

## P1-4 拖拽分隔条中途卸载 → `document` 监听与 `body.mditor-resizing` 永久残留
`src/components/Layout/AppLayout.tsx:45-71`：`onMouseDown` 里注册 `mousemove`/`mouseup`，仅在 `onMouseUp` 内部移除，组件**没有 useEffect cleanup**。拖拽中 F11 全屏 / Ctrl+Shift+L 隐藏侧栏 / `hasOutline` 变化都会卸载 `AppLayout`，此时 `body.mditor-resizing { user-select: none }`（`index.css:480`）永久挂着 → 全应用无法选中文本，且每次泄漏一对监听。用 `useEffect(() => () => { remove...; body.classList.remove(...) }, [])` 做卸载兜底。

## P1-5 五个 Tauri `listen()` 缺 `cancelled` 防护，StrictMode 下重复注册
`src/App.tsx:204-218` 等 5 处均为 `void listen(...).then(fn => { unlisten = fn })`，cleanup 只 `unlisten?.()`；promise 在 cleanup 之后 resolve 就再也取消不掉。同一工程 `App.tsx:48-57` 的 `setupFsWatcher` 和 `TitleBar.tsx:23-46` 都写了 `cancelled/disposed`，唯独这 5 处遗漏。`main.tsx:23` 用了 `<React.StrictMode>`，开发模式下托盘「新建」弹两次、退出时两次 `flushAllDirty` + 两次 `quit_now`。抽 `useTauriListen` hook，`.then(fn => { if (cancelled) fn(); else unlisten = fn })`。

## P1-6 全局快捷键的模态屏蔽只覆盖 `promptDialog`
`src/components/Editor/EditorArea.tsx:62` 的 `isModalBlocking = () => !!useAppStore.getState().promptDialog`，漏掉 `settingsOpen`（在 useSettingsStore）、`paletteOpen/findOpen/searchOpen/validationOpen`、`modalOpen`（片段库）。结果：设置弹窗里 Ctrl+F 在背后开查找栏、Ctrl+S 保存、F8/F9 切模式；命令面板里 Ctrl+P 重复触发。更糟的是 `EditorArea.tsx:68-72` 的全屏 Esc 分支**无条件** `toggleFullscreen()`，与各浮层自己的 Esc 监听同时触发 → 一次 Esc 既关浮层又退全屏。抽统一的 `isAnyOverlayOpen()` 聚合四个 store，并让全屏 Esc 在有其它浮层时让位。

## P1-7 Rust PDF 导出：清理路径被任意 `?` 跳过、COM 反初始化顺序、file URL 未编码
`src-tauri/src/commands/pdf.rs`：
- `:91` `let _ = CoInitializeEx(...)` 丢弃 HRESULT，`:325` 却无条件 `CoUninitialize()`；`RPC_E_CHANGED_MODE` 时后续全部 COM 调用在未正确初始化的公寓上执行。
- `:269` `let url = format!("file:///{}", tmp_path.replace('\\', "/"))` 无百分号编码。`std::env::temp_dir()` 含 Windows 用户名，用户名带空格/`#`/`%`/中文时导航失败 → 30s 超时 → 这类用户**完全无法导出 PDF**。
- `:321-327` 的 `controller.Close()` / `DestroyWindow` / `CoUninitialize` / `remove_dir_all(udf_dir)` 在函数末尾；`:192-195` 等处任何 `?` 提前返回都跳过全部清理，且成功路径上 COM 接口 `Drop` 晚于 `CoUninitialize()`（STA 上未定义行为）。`RegisterClassW` 从不注销。

建议：用 RAII `Cleanup` guard（入口创建，`Drop` 里统一清理）；显式 `drop(core/webview7/...)` 置于 `CoUninitialize` 之前；用 `url::Url::from_file_path()` 生成 URL。补充：`:142/:171` 的 `.expect("send env")` 与无超时的 `recv()` 在回调未投递时会让 worker 线程连同 HWND/UDF 永久阻塞（叠加 `panic=abort` 风险）。

## P1-8 asset 授权去重键先写、失败被吞 → 目录永久加载不出图片
`src-tauri/src/commands/mod.rs:41-48`：`HashSet::insert(key)` 在 `allow_directory` **之前**执行，后者返回值 `let _ =` 丢弃。`create_file` 在 `create_dir_all(parent)` 之前就授权，父目录尚不存在时授权可能失败；一旦失败，去重键已存在，之后所有调用第一行就 `return`，整个会话不再重试且无日志。应先取 `allow_directory` 结果，仅成功时 `insert`。另外 `directory.rs:24` 在校验路径前就对 `list_directory(path, recursive=true)` 授权，配合下一条等于可把任意目录（含 `C:\`）递归加入 asset scope。

## P1-9 watcher 的 `strip_prefix` 失败回退会重新引入「整棵子树被过滤」
`src-tauri/src/commands/watcher.rs:68`：`let rel = path.strip_prefix(root).unwrap_or(path)`。注释明确说要「只检查相对根的路径段」，但回退到完整路径后就又检查了所有祖先段。Windows 盘符大小写、`\\?\` 前缀、UNC、尾斜杠都会让 `strip_prefix` 失败；此时若根路径含 `.` 开头的段（如 `C:\Users\x\.config\notes`），**所有事件被判为噪音**，watcher 完全静默无日志。应改为失败时直接 `return false`，或先 `canonicalize` 归一化。

## P1-10 release 构建仍带 DevTools，CSP 放行任意远程资源，自定义文件命令无路径校验
- `src-tauri/Cargo.toml:31` 的 `features = [..., "devtools", ...]` 无条件启用；`lib.rs` 的 `#[cfg(debug_assertions)]` 只控制「启动时自动打开」，不控制是否编译进去。
- `src-tauri/tauri.conf.json:29` 的 `img-src / frame-src / media-src` 允许裸 `http:` `https:`，`connect-src` 漏了 HMR 端口 1421（`vite.config.ts:63-68` 用的是 1421），dev 热更新会被 CSP 拦。
- 所有 `#[tauri::command]`（`file.rs`、`directory.rs`、`search.rs`、`watcher.rs`）直接把 `String` 转 `Path` 调 `std::fs::*`，无工作区根校验。项目**没用 `tauri-plugin-fs`**，因此 `capabilities/default.json` 的 scope 对这些自定义命令不起约束作用。

三者叠加：release 里 F12 打开 DevTools 即可调用 `read_file/write_file/delete_path` 读写任意本机路径。建议：`devtools` 改为按 feature 条件开启；CSP 收敛为 `'self' asset: http://asset.localhost data: blob:`；在 Tauri state 里维护工作区根，所有路径 `canonicalize()` 后校验 `starts_with(root)`，拒绝 `..` 逃逸 / UNC / `\\?\` / 保留设备名。

## P1-11 新 Mermaid 双态：销毁后仍可能派发事务；SVG 缓存键不含主题
`src/plugins/mermaid.ts`（本次刚改）：
- `:351-373` 的 `onUp` 捕获 `activeView`，没有 `isDestroyed` / `el.isConnected` 检查；3s 兜底 timer 的 id 未保存、编辑器 `destroy()` 时不清。按下图后立刻切源码模式/关标签，`mouseup` 会打到已销毁 view。
- `svgCache` 只以 `code` 为键（`:62`）；`refreshMermaidTheme()` 做 `clear() + epoch++`，但**在途的 `mermaid.render` promise 会在 clear 之后写回旧主题 SVG**（`:105-113`），后续同源码的图一直命中脏缓存。

建议：`onUp/onClick` 开头校验并把 timer 纳入 `cleanup()`；缓存键改为 `${theme}:${code}`，或在 `.then` 里校验写入时的 epoch/theme 与当前一致才 `set`。

## P1-12 视口位置缓存不含文档维度，`clearViewportPos` 全项目从未被调用
`src/utils/viewportPos.ts:23-27,58`：缓存命中只看 `scrollTop / height / 60ms`；切标签走 `view.updateState()`（view 对象不变，WeakMap 键不变），而 `clearViewportPos` 的定义是全项目唯一出现处。若两篇文档 `scrollTop`/`clientHeight` 恰好相同，60ms 内 `syncActiveHeading`、行号同步、高亮补齐会拿到**上一篇文档**的位置。缓存条目加 `doc: Node`（`view.state.doc !== hit.doc` 即失效）即可，无需手动清。

## P1-13 SearchPanel 关闭后 debounce 仍执行，把已清空的状态写回
`src/components/SearchPanel/SearchPanel.tsx:34,56-60,62-75`：`debounceTimer` 存在 `useState`，清理 effect 只在组件真正卸载或 timer 变化时跑；但组件由 `AppLayout` 常驻渲染，关闭只是 `return null`，`closeSearch()` 也不改 timer。输入后 300ms 内按 Esc 关闭，`runSearch(value)` 仍会发起全量跨文件搜索并写回 `searchQuery/searchResults`。改用 `useRef` + 在 `searchOpen` 变 false 的 effect 里 `clearTimeout`。

## P1-14 源码模式吞掉 Shift+Tab（键盘焦点陷阱），且硬编码关闭拼写检查
`src/components/Editor/SourceEditor.tsx:43-53`：`if (e.key !== 'Tab') return; e.preventDefault()` 不区分 `shiftKey`，键盘用户无法用 Tab/Shift+Tab 离开 textarea（违反 WCAG 2.1.2）；`:63` `spellCheck={false}` 完全忽略设置里的开关。另 `EditorArea.tsx:78-82` 的 Ctrl+F 无条件 `openFind()`，而 `:171` 是 `{isMd && !sourceMode && <FindReplace />}` → 源码模式按 Ctrl+F 无任何反馈。

---

# 三、P2 中风险（边界条件 / 静默降级）

| # | 位置 | 问题与建议 |
| --- | --- | --- |
| P2-1 | `src/plugins/emojiAutocomplete.ts:138-153` | **需实测**。`colonPos = from + 1`，而 `:110` 注释说 `popup.startPos` 是「冒号的文档绝对位置」；`replaceWithEmoji` 以它作 `absStart`，冒号可能残留、过滤少一字符。另 `:140` 的 `setTimeout` 未保存 id，`destroy()` 只 `popup.hide()`，卸载后仍会 `coordsAtPos`。建议 `colonPos = from` 并保存/清理 timer。 |
| P2-2 | `src/utils/incrementalDecorations.ts:114-140` | `prevStarts` 是 `Map<Node, number>`，复制粘贴产生同一 Node 引用时只记最后一个位置；`prevStarts.delete(child)` 只做了新文档侧去重，旧文档侧重复会让「被复制块」的 decoration 只删不建（行号槽/高亮/mermaid 图消失直到下次编辑）。改为 `Map<Node, number[]>` 或检测到重复引用时退化为 `full` 全量重建。 |
| P2-3 | `src/plugins/tableDragReorder.ts:69-83,133-137` | widget 闭包与 `key` 把 `tablePos`/`rowIdx` 在建 decoration 时固定，增量 `map` 只平移位置不改闭包（文件 `:60-67` 注释自己说明了 PM 只调用一次 `toDOM`）。表格前插入内容后拖拽可能移动**错误表格**的行。改为 `mousedown` 时用 `view.posAtDOM(el,0)` 反查，或对该表格走全量重建。 |
| P2-4 | `src/services/publish.ts:28-30,59,65` | `escapeHtml` 不转义 `"`；`STYLE_PROPS` 含 `fontFamily`（值常为 `"Segoe UI", ...`），拼进 `style="…"` 会截断；`img src` 完全未转义。对比 `services/export.ts:20-26` 的同类函数含 `&quot;`，属遗漏。**前提**：`copyWechatHtml` 当前全项目无调用方（死代码），接入即触发。 |
| P2-5 | `src/services/export.ts:114-123`、`exportDocx.ts:424-440` | 本地图片 src 带 `?v=2` / `#frag` 时，`ext` 与 `readFileBytes` 用到的是带查询串的路径 → PDF/HTML 裂图、Word 解码失败。而 `imageDisplay.ts:56` 明确支持这种形态。解析前统一 `src.split(/[?#]/)[0]`（先排除 `http(s)` / `data:`）。 |
| P2-6 | `src/services/exportDocx.ts:69,870-874` | 模块级 `activeInlineImages` 在 `editor.action`（含 await）期间可被第二次导出覆盖/置 null，行内图片静默丢失。命令面板的导出没有 `busy` 保护，快速执行两次即可交错。改为沿 `WalkCtx` 传局部变量或加互斥。 |
| P2-7 | `src/stores/useAppStore.ts:66-88,128-146,1061` | `writeSession` 写了 `sourceModePaths`，`readSession` 返回对象漏了该字段 → `:1061` 恒为空数组。用户手动切源码模式的大文件重启后回到 WYSIWYG 全量 parse，注释承诺的「避免冻结」失效。 |
| P2-8 | `src/stores/settings.ts:55-61,95-121` | `loadBoolean` 把 `'1'/'yes'`/损坏值一律判为 `false`（而非 fallback），自动保存会被静默关闭；写入侧 `localStorage.setItem` 无 try/catch，配额满/被禁用时点设置直接抛错。 |
| P2-9 | `src/stores/useAppStore.ts:90-99,109-118` | `readRecentFiles/readRecentLangs` 只判 `Array.isArray`，不过滤元素类型；损坏数据里的 `null/number` 会在 `pathKey` 的 `toLowerCase()` / `fuzzySearch` 的 `p.split` 抛错，中断 `openFile`。对比 `readSession` 同处做了 `typeof` 过滤。 |
| P2-10 | `src/components/CommandPalette.tsx:20-33,112-117` | `filteredCmds` 的 `useMemo` 依赖 `[query, mode]`，内部 `buildCommands()` 读 `getState().tab/editor` 快照。以空查询关闭面板、期间切换文件，再打开可能用**旧 tab.path 配新编辑器内容**导出（文件名与图片相对目录错配）。把 `open/activeTabId` 加进依赖或改为执行时实时构造。 |
| P2-11 | `src/components/Editor/MilkdownEditor.tsx:482-528` + `plugins/headingId.ts:164-186` | **需实测**。`dirtyTracker.update` 对任何 `doc !== prev.doc` 都 `markDirty`，而 `headingId.updateId` 的 400ms 防抖用 `setNodeMarkup` 改 attrs（序列化不写入）。特定「编辑标题→快速切走→切回快照」时序下，后台事务可能误标脏，触发有损归一化回写——正是 `MilkdownEditor.tsx:205-215` 注释极力要防的场景。建议按「事务是否含 ReplaceStep / 是否 `addToHistory:false`」过滤。 |
| P2-12 | `src/plugins/typewriter.ts:73-82`、`copyButton.ts:71-74` | `typewriter.apply` 内的居中 rAF 未记 id，`destroy()` 只取消另一个 rAF；切标签时残留 rAF 用旧文档几何覆盖 `applyLoaded` 恢复的 `scrollTop`。`copyButton` 的 1500ms 恢复文案 timer 同理，DOM 销毁后仍写 `textContent`。 |
| P2-13 | `src/plugins/svgSourceEditor.ts:52-65` | 弹窗开着时任何 `docChanged` 事务（含 headingId 的 attrs 修正）都 `removePersistentRoot()`，textarea 里未应用的源码直接丢失；且 `state.apply` 里做模块级 DOM 副作用、单例 Plugin 跨实例串味。收窄为「目标节点已失效」才关闭，并在关闭前缓存 textarea 值。 |

---

# 四、P3 性能与工程优化

## 4.1 运行时性能
1. **Mermaid 预览态全量同步渲染**：`src/plugins/mermaid.ts:198-226` 的 `init` / epoch 重建对**全文所有** mermaid 块无条件 `renderInto`，`mermaid.render` 是 20–80ms 同步布局。几十张图的文档或切主题会阻塞主线程数秒。建议按 `viewportTopPos` 只渲视口 ± 一屏，其余占位 + 滚动/空闲补；`waitForMermaidRenders()` 导出路径保留「强制全量」开关。
2. **非虚拟化分支每次同步遍历所有 `<pre>`**：`src/plugins/codeBlockLineNumbers.ts:243-252`，`syncPre` 内 `getComputedStyle` + `Range.getClientRects()` 强制同步布局；阈值是 3000 顶层块，2999 块时输入明显粘滞。按 `st.ranges`/视口限定范围，或把 `getComputedStyle` 按主题缓存。
3. **`headingId` 快照还原后全量 `descendants`**：`:164-171` 400ms 后重算全文标题 id，其 doc 变化又触发 `collectOutlineNow` 再全量遍历 + 一轮回写。载入时直接复用 `withHeadingIds` 的结果。

## 4.2 构建与发布
4. **`.bat` 行尾不符合项目硬约束**：实测 `build.bat` `CR=0 LF=79`、`build-debug.bat` `CR=0 LF=47`，只有 `build-msvc.bat` 是 `CR=95 LF=95`；`git ls-files --eol` 显示三个文件在 index 里都是 LF，仓库**没有 `.gitattributes`**，行尾完全取决于各机器 `core.autocrlf`。两个脚本含 `goto :fail` / `:fail` 标签，LF 下标签定位可靠性需在目标机器实测（这正是 P0-6 的触发条件）。建议加 `.gitattributes` 写 `*.bat text eol=crlf`，或去掉 `goto` 改 `call ... || (echo ... & exit /b 1)`。
5. **版本 bump 是 2KB 内联 `node -e`**：`build.bat:37`，与「逻辑放 .cjs」的既有约定只做了一半；且以 `tauri.conf.json` 为唯一基准**无条件覆盖**其他三处（掩盖不同步而不报警），`Cargo.lock` 正则硬编码 `\n`（CRLF 时失配）。移到 `scripts/bump-version.cjs`，先比对四处版本再写、写前备份。
6. **`manualChunks` 的 `lowlight`/`highlight.js` 分支是死代码**：`vite.config.ts:22-36`，内层判断被外层 `id.includes('@milkdown') || id.includes('prosemirror')` 挡住 —— `node_modules/lowlight/…` 两者都不含。`src/config/lowlight.ts` 的 13 个语言包因此落在 Rollup 自动 chunk（662 KB 最大产物），与注释承诺不符。把路径正则提到外层之前。
7. **懒加载被启动链抵消（产物实证）**：`dist/index.html` 对 `highlight-*`(187 KB) 与 `milkdown-*`(268 KB) 做了 `modulepreload`，因为 `AppLayout.tsx:2-17` 静态 import 的 Toolbar / ContextMenu / LangPicker 等又静态 import 了 `@milkdown/kit` 与 prosemirror。`EditorArea.tsx:6-7` 的 `React.lazy` 意义被削弱。区分静态/动态可达 chunk 名，并把 `dist/index.html` 的 modulepreload 列表作为构建回归断言。
8. **包管理器三处口径矛盾**：仓库只有 `pnpm-lock.yaml`，`build.bat:45,50` 与 `tauri.conf.json:8` 用 `npm install` / `npm run build`，`README.md:170-177` 却写 `pnpm …`；`package.json` 绝大多数依赖是 `^`。`npm install` 会忽略 pnpm 锁重新解析，发布不可复现。统一为一种管理器（`npm ci` + `package-lock.json`，或 `pnpm install --frozen-lockfile`）并同步 README。
9. **`watch-memory.ps1` 永远采集不到数据**：`:5,14` 硬编码 `MyMdEdit-v1.0.94.exe`，而实际产物是 `MyMd-v2.0.x.exe`（`rename-exe.cjs:28`）→ filter 恒不匹配，CSV 只有表头。另文件是无 BOM UTF-8 中文注释，PS 5.1 会按 CP936 解码。
10. **TypeScript 覆盖有洞**：`tsconfig.json` 缺 `noUncheckedIndexedAccess`；`tsconfig.node.json` 无 `strict`/`noEmit`，`npm run build` 的普通 `tsc` 会忽略 `references`，`vite.config.ts` 与 `tests/app.tsx` 完全不参与类型检查。

## 4.3 测试可靠性
11. **UI 回归依赖已删除的 fixture**：`tests/app.tsx:265-277` 从 dev server 抓根目录 `functest.md`/`big.md`，404 被静默 `catch`，`seed({})` → 文档没内容 → 6 项假失败（Markdown 结构/粗体/H1/查找/替换/大纲）。本次审查已实测：临时补一份含 h1×2、表格、`SEARCHME`、多级标题的 fixture 后为 **32/32**，跑完已删回原状。建议把 fixture 放进 `tests/fixtures/` 纳入版本控制，并在 `boot()` 里 fail-fast。
12. **硬编码 Vite 预构建物理路径**：`tests/ui-test.mjs:150` `import('/node_modules/.vite/deps/@milkdown_kit_prose_state.js')`，文件名随依赖/Vite 版本/缓存变化；一旦失效，整轮测试被 `main` 的 catch 吞成一条「测试脚本自身异常」，后面 20+ 条断言全不执行。改用 `tests/app.tsx` 的 `H.m`（补一个 `TextSelection`）。
13. **其余**：`tests/tauri-shim.js:250-261` 的 `emit()` 里 `++n` 与 `n++` 让返回值翻倍；`tools/cdp-lib.mjs:17` 随机端口 9300–9699 且无归属校验，并行跑可能连到别人的 Chrome；`tests/mermaid-test.mjs` 用 `startsWith(' ')` 断言输入，依赖光标恰好在块首，建议改成「长度差 1 且仍含 `graph TD`」；`ui-test.mjs` 多处只断言 DOM 数量/文案存在（搜索 `items>0` 恒真），建议校验结果文本内容。

## 4.4 UI 一致性（合并项）
- **z-index 体系分裂**：模态层用 `z-[50..60]`，而右键菜单/语言选择器/Toast 是 1000–2000，全屏退出按钮 999 → 弹窗打开时其它浮层盖在遮罩上。建议抽 `--z-*` 变量统一。
- **亮色 accent 上硬编码白字**：`index.css:661-664,979-981` 的 `background: var(--color-accent); color:#fff`，在 `classic-green`(#33ff33)、`gruvbox`(#b8bb26) 等主题下对比度约 1.5–2.5:1。在 `themes.ts` 的 `makePalette` 按亮度派生 `--color-on-accent`。
- **`themes.ts:105-106,111,127` 的 `accent2` 参数 8 个主题全传但从未使用**（`accentHover` 只用了黑白 mix），删掉或实现。
- **全文无 `@media (max-width)` 断点**：`.search-panel` 固定 580px 无 `max-width`、`.mditor-findbar` 固定宽输入框不换行，窄屏下按钮被裁。88 KB CSS 里的 5 处 `@media` 全是 `prefers-reduced-motion`。
- **无 `@media print`**：Ctrl+P 已被命令面板 `preventDefault()` 占用，正式导出走 `exportPdf`，但将来开放系统打印会连标题栏一起输出。

---

# 五、已复核但判定为「设计如此 / 误报」（不列为缺陷）

| 项 | 结论 |
| --- | --- |
| `pdf_outline.rs` 递归栈溢出 | 前端 `extractOutline` 只取 h1–h6，`level` 恒为 1–6，树深最多 6 层，正常链路不会溢出；仅在恶意 IPC 直调时成立，属**防御性加固**而非现网 bug |
| `pdf.rs:414-418` 吞掉 `inject_outline` 错误 | 注释明确写「大纲属于增强项，静默降级」，是有意设计；最多建议加日志/返回 `outlineInjected` 供前端提示 |
| 「异步 readFile 把 A 内容写进 B 标签」 | `openFile` 每次新建独立 tab，`MilkdownEditor` 用 `onChangeByKeyRef` 按 docKey 隔离、切走时 flush oldKey，未发现串写路径 |
| 「打开文件不动就变未保存」 | 三道防护齐全：`loadingRef`、`isTouched`、`flushKey` 只在 dirty 时回写；残留边界见 P2-11 |
| `assetProtocol.scope: []` | 不是配置错误，`mod.rs:41` 有运行时按目录授权，是最小权限设计；真问题是 P1-8 的「先写键后授权」与 `directory.rs:24` 的「校验前授权」 |
| watcher 自身写盘回环 / 外部修改覆盖未保存 | `useAppStore.ts:673` 用 `content !== latest.content` 挡回环、`:664` 用 `isDirty` 跳过、`await readFile` 后重查 isDirty，处理是严谨的 |
| `.bat` 纯 ASCII + CRLF、`pause`、内联 node 搬到 `.cjs` | 前两项是项目硬性约定（脚本本身遵守了 ASCII；CRLF 见 P3-4），其余属已知历史包袱 |

---

# 六、建议修复顺序

1. **第一批（数据安全，建议立即）**：P0-1 → P0-2 → P0-3 → P0-4 → P0-5 → P0-6。全部有明确复现路径或代码级证据，且后果不可逆。
2. **第二批（功能可用性）**：P1-1、P1-2、P1-3、P1-4、P1-13、P1-14 —— 改动小、收益直接，可一次提交。
3. **第三批（架构与安全）**：P1-7 ~ P1-10（Rust PDF / 授权 / 权限收窄），改动面大，建议每项单独提交并配回归。
4. **第四批（边界与清理）**：P1-5、P1-6、P1-11、P1-12、P2 全组。P2-1、P2-11 先补回归用例再改。
5. **第五批（工程化）**：P3 的测试可靠性（11–13）优先于性能优化，因为它是后续所有改动的验证基础；再做分包、构建脚本、UI 一致性。

**验证基线**（本次审查后实测）：`tsc --noEmit` 通过、`vite build` 通过、`tests/mermaid-test.mjs` 12/12、`tests/ui-test.mjs` 32/32（需临时补齐 fixture）。任何修改后至少重跑后两项；Rust 侧建议为 P0-1 补一个含 `İẞX` 的单元测试，为 P0-2 补一个模拟取消的集成用例。

---

*本文档只做静态审查与证据复核，未修改任何源码。文中行号对应 2026-11-13 的工作区版本；如在此期间有提交，请以 `git diff` 重新定位。*
