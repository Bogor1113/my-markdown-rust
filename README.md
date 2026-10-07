# MyMdEdit

> 一款为中文写作场景打造的 Markdown 桌面编辑器 —— 所见即所得、公式图表开箱即用、导出即交付。

**MyMdEdit** 基于 **Tauri 2 + React 19** 构建，编辑器内核采用 **Milkdown（ProseMirror）**，
在保持 Markdown 纯文本特性的同时，提供接近专业排版软件的编辑体验：
数学公式、流程图、代码高亮、表格、脚注、Frontmatter 一应俱全，
写完可直接导出 **PDF / HTML / DOCX**。

---

## 功能特性

### 编辑体验

| 能力 | 说明 |
| --- | --- |
| 所见即所得 | 基于 Milkdown / ProseMirror，边写边看最终效果 |
| 多标签编辑 | 同时打开多个文档，标签页切换 |
| 文件树侧栏 | 打开文件夹作为工作区，目录树直接操作 |
| 最近文件 | 快速回到之前编辑的文档 |
| 自动配对 | 括号、引号、Markdown 标记自动成对 |
| 打字机模式 | 光标始终保持在视线中心，长文写作不累眼 |
| 排版优化 | 标点、空格、中英文混排的自动排版处理 |
| Emoji 补全 | 输入 `:` 触发表情补全 |
| 查找替换 | 支持全文搜索与批量替换 |
| 命令面板 | 键盘唤起，所有命令一键直达 |
| 大纲面板 | 按标题层级快速跳转 |

### 富内容支持

| 能力 | 说明 |
| --- | --- |
| 数学公式 | KaTeX 渲染，行内与块级公式 |
| 流程图 / 图表 | Mermaid 语法直接渲染 |
| 代码块 | highlight.js 语法高亮 + 行号 + 一键复制 |
| 表格 | 支持**从 Excel 粘贴自动转表格**、拖拽调整行序 |
| 任务列表 | 复选框点击勾选 |
| 提示块 | Callout 语法渲染为醒目区块 |
| 脚注 | 标准脚注引用与汇总 |
| Frontmatter | YAML 元数据可视化编辑，不必手写 |
| 内联 HTML / SVG | 可直接编辑 HTML 与 SVG 源码 |
| 图片 | 拖拽插入、外链与本地资源自动识别显示 |

### 文件与检索

- 工作区目录树、新建文件 / 目录、重命名、删除
- **全文搜索与批量替换**
- 文件名模糊搜索
- 目录变更**实时监听**，外部改动自动同步
- 代码片段库与文档模板，重复内容一键插入

### 导出

| 格式 | 说明 |
| --- | --- |
| **PDF** | 走系统打印引擎，并**自动注入大纲书签**，长文档可导航 |
| **HTML** | 导出为独立网页，保留样式与公式 |
| **DOCX** | 导出为 Word 文档，便于交付与二次编辑 |

### 桌面集成

- **`.md` / `.markdown` 文件关联** —— 双击 Markdown 文件直接用本软件打开
- **单实例运行** —— 重复启动不会开出第二个窗口，而是复用已有窗口并载入传入的文件
- 自绘无边框标题栏
- 系统托盘
- **窗口自适应** —— 启动时按当前显示器的可用工作区自动缩放定位，
  低分辨率或高 DPI 缩放的机器上不会出现窗口超出屏幕、按钮点不到的情况

### 性能细节

- 图片与二进制数据经 IPC 传输时使用 **base64 载荷**，避免被序列化成数字数组造成内存与耗时放大
- 目录监听只针对工作区，不做全盘扫描

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 后端语言 | Rust 2021 |
| 编辑器内核 | Milkdown 7（ProseMirror） |
| 前端 | React 19 + TypeScript |
| 样式方案 | Tailwind CSS v4 |
| 状态管理 | Zustand |
| 构建工具 | Vite 8 + pnpm |
| 数学公式 | KaTeX |
| 图表渲染 | Mermaid |
| 代码高亮 | highlight.js / lowlight |
| PDF 导出 | WebView2 打印接口 + `lopdf`（后处理注入大纲） |
| DOCX 导出 | `docx` / `docx-rs` |
| 文件监听 | `notify` |
| 打包 | Tauri Bundler（NSIS） |

---

## 目录结构

```
my-markdown-rust/
├── src/                              # 前端（React 19 + TS）
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── Editor/                   # Milkdown 编辑器挂载与区域
│   │   ├── Sidebar/                  # 文件树与目录右键菜单
│   │   ├── Tabs/                     # 多标签栏
│   │   ├── Toolbar/ · StatusBar/ · TitleBar/
│   │   ├── Outline/                  # 大纲面板
│   │   ├── SearchPanel/              # 全文搜索
│   │   ├── RecentFiles/
│   │   ├── FrontmatterEditor/        # 元数据可视化编辑
│   │   ├── ContextMenu/              # 右键菜单与语言选择
│   │   ├── Modal/                    # 设置、输入对话框
│   │   ├── CommandPalette.tsx
│   │   ├── FindReplace.tsx
│   │   └── SnippetModal.tsx · Toast.tsx · ValidationModal.tsx
│   ├── plugins/                      # Milkdown 扩展插件（核心能力所在）
│   │   ├── math.ts · mermaid.ts · table.ts · footnote.ts
│   │   ├── callout.ts · taskToggle.ts · mark.ts · list.ts
│   │   ├── codeBlockLineNumbers.ts · copyButton.ts
│   │   ├── excelPaste.ts · tableDragReorder.ts
│   │   ├── frontmatter.ts · html.ts · htmlSvgEdit.ts · svgSourceEditor.ts
│   │   ├── image.ts · autoPair.ts · typewriter.ts
│   │   ├── typography.ts · emojiAutocomplete.ts
│   ├── services/                     # 文件系统、导出、图片、发布、监听
│   │   ├── export.ts                 # PDF / HTML 导出
│   │   ├── exportDocx.ts             # DOCX 导出
│   │   ├── fs.ts · watcher.ts · images.ts · association.ts
│   ├── stores/                       # Zustand 状态（应用、设置、快捷键、片段）
│   ├── utils/                        # 文件、Markdown、模糊搜索等工具
│   ├── config/ · lib/ · types/
│   └── index.css
├── src-tauri/                        # 后端（Rust）
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   └── src/
│       ├── lib.rs                    # 应用装配、单实例、窗口适配
│       ├── main.rs
│       └── commands/
│           ├── file.rs               # 读写、图片、建删改名
│           ├── directory.rs          # 目录列举
│           ├── search.rs             # 全文搜索 / 替换
│           ├── pdf.rs                # PDF 导出（打印接口）
│           ├── pdf_outline.rs        # PDF 大纲书签注入
│           ├── watcher.rs            # 目录监听
│           └── association.rs        # .md 文件关联注册
├── docs/                             # 项目文档
├── build.bat · build-debug.bat       # 一键构建脚本
├── vite.config.ts · tsconfig.json
└── index.html
```

---

## 快速开始

### 环境要求

- Node.js ≥ 18
- **pnpm**（本项目使用 pnpm 管理依赖）
- Rust ≥ 1.78（`cargo`）
- Windows 10/11（需 WebView2 运行时，Win11 已内置）

### 开发调试

```bash
pnpm install
pnpm tauri dev
```

### 构建发布

```bash
pnpm tauri build
```

Windows 上一键构建（含 NSIS 安装包）：

```bat
build.bat
```

调试版构建：

```bat
build-debug.bat
```

产物输出至 `src-tauri/target/release/bundle/`。

---

## 使用说明

1. 启动后可从侧栏**打开文件夹**作为工作区，或直接打开单个 `.md` 文件
2. 在编辑区直接书写，格式实时呈现；输入 `/` 或使用工具栏插入公式、表格、图表
3. 顶部标签栏切换多个文档，右侧大纲面板按标题跳转
4. `Ctrl + P` 唤起命令面板，`Ctrl + F` 查找替换
5. 通过菜单或命令面板导出为 **PDF / HTML / DOCX**

> 首次启动时会自动注册 `.md` / `.markdown` 文件关联，
> 之后双击 Markdown 文件即可用本软件打开。

---

## 说明

- 本编辑器**全程离线工作**，文档内容始终保存在你自己的磁盘上，不上传任何服务器。
- 导出 DOCX 依赖 Word 文档格式规范，复杂排版在 Word 中可能有细微差异，建议导出后预览确认。

---

## 关于

作者：**冬月十三**
