/** 代码编辑器支持的语言标识 */
export type CodeLanguage =
  | 'python'
  | 'sql'
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'css'
  | 'html'
  | 'xml'

/** 代码文件扩展名 → 语言 */
export const CODE_LANG_BY_EXT: Record<string, CodeLanguage> = {
  py: 'python',
  pyw: 'python',
  sql: 'sql',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'css',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
}

/** 语言在标签徽标上的短名 */
export const CODE_LANG_SHORT: Record<CodeLanguage, string> = {
  python: 'py',
  sql: 'sql',
  javascript: 'js',
  typescript: 'ts',
  json: 'json',
  css: 'css',
  html: 'html',
  xml: 'xml',
}

/** 取小写扩展名（不含点），无扩展名返回空串 */
export function extensionOf(path: string): string {
  const name = path.split('\\').pop()?.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** 判断路径是否为 Markdown 文档（所见即所得模式） */
export function isMarkdown(path: string): boolean {
  const ext = extensionOf(path).toLowerCase()
  return ext === 'md' || ext === 'markdown'
}

/**
 * 可用「文本方式」直接打开的文件扩展名（白名单）。
 * 覆盖 Markdown、常见代码、配置、数据、脚本、标记语言等——只要能用文本
 * 打开查看/编辑的文件都纳入，避免把 .txt/.sh/.yaml/.toml 等拒之门外。
 * 二进制（图片/音视频/压缩包/可执行文件）不在此列，避免误打开乱码。
 */
const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  // Markdown / 标记语言
  'md', 'markdown', 'mdx', 'rmd', 'rst', 'adoc', 'asciidoc', 'org', 'tex', 'latex',
  // 纯文本 / 笔记
  'txt', 'text', 'log', 'out',
  // 数据 / 配置
  'json', 'jsonc', 'jsonl', 'ndjson', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'config', 'prop', 'properties', 'env', 'editorconfig', 'gitignore', 'gitattributes',
  'dockerignore', 'npmignore', 'npmrc', 'prettierrc', 'eslintrc', 'babelrc', 'csv',
  'tsv', 'tab', 'plist', 'xml', 'xsl', 'xsd', 'svg', 'xhtml', 'shtml', 'rss', 'atom',
  // Web
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'styl', 'vue', 'svelte', 'astro',
  // 脚本 / 编程语言
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'py', 'pyw', 'rb', 'rake',
  'php', 'php3', 'php4', 'php5', 'phtml', 'pl', 'pm', 'cgi', 'lua', 'go', 'rs', 'java',
  'kt', 'kts', 'scala', 'sc', 'swift', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hxx', 'hh',
  'cs', 'vb', 'fs', 'fsx', 'clj', 'cljs', 'ex', 'exs', 'erl', 'ml', 'mli', 'nim', 'dart',
  'groovy', 'gradle', 'r', 'jl', 'm', 'mm', 'sql', 'db', 'sh', 'bash', 'zsh', 'ksh',
  'fish', 'awk', 'sed', 'ps1', 'psm1', 'bat', 'cmd', 'coffee', 'proto', 'graphql', 'gql',
  'thrift', 'idl', 'cmake', 'makefile', 'mk', 'bazel', 'bzl', 'tf', 'tfvars', 'hcl',
  'diff', 'patch', 'asm', 's', 'nasm', 'feature', 'lock',
])

/** 判断文件是否属于可打开的类型（白名单内的文本/代码文件） */
export function isOpenableFile(extension: string | null | undefined): boolean {
  const ext = extension?.toLowerCase() ?? ''
  return TEXT_EXTENSIONS.has(ext)
}

/** 代码文件的语言标识，非代码文件返回 null */
export function codeLanguageOf(path: string): CodeLanguage | null {
  return CODE_LANG_BY_EXT[extensionOf(path)] ?? null
}

/** 拼接路径，自动沿用目录的分隔符风格 */
export function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  return dir.replace(/[\\/]+$/, '') + sep + name
}

/** 取父目录路径 */
export function parentDirOf(path: string): string {
  const sep = path.includes('\\') ? '\\' : '/'
  const idx = path.lastIndexOf(sep)
  return idx <= 0 ? path : path.slice(0, idx)
}

/** 取文件名 */
export function basenameOf(path: string): string {
  return path.split('\\').pop()?.split('/').pop() || path
}
