/// KaTeX 字体内联：PDF 导出时把数学公式样式与其全部 woff2 字体以 base64 内联进 HTML。
/// 这样导出的 PDF 即使在离线环境下，公式也能以正确字体渲染（与 Typora 导出时内嵌字体一致）。
///
/// 本模块被 export.ts 动态 import，Vite 会把它（含全部字体 data URI，约 1MB）拆成独立 chunk，
/// 只在用户真正导出 PDF 时才加载，不影响主包体积。

// 注意：必须用 ?raw 而非 ?inline —— ?inline 的 CSS 会被 Vite 重写内部 url() 为 /assets/... 哈希路径，
// 破坏后续把 `url(fonts/xxx.woff2)` 替换为 data URI 的逻辑；?raw 则原样返回文件文本。
import katexCssText from 'katex/dist/katex.min.css?raw'

// katex 0.18 的全部 20 个 woff2 字体（构建时经 Vite ?inline 打成 base64 data URI）
import kaTeXAMSR from 'katex/dist/fonts/KaTeX_AMS-Regular.woff2?inline'
import kaTeXCalBold from 'katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?inline'
import kaTeXCalReg from 'katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?inline'
import kaTeXFraBold from 'katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?inline'
import kaTeXFraReg from 'katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?inline'
import kaTeXMainBold from 'katex/dist/fonts/KaTeX_Main-Bold.woff2?inline'
import kaTeXMainBoldItalic from 'katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?inline'
import kaTeXMainItalic from 'katex/dist/fonts/KaTeX_Main-Italic.woff2?inline'
import kaTeXMainReg from 'katex/dist/fonts/KaTeX_Main-Regular.woff2?inline'
import kaTeXMathBoldItalic from 'katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?inline'
import kaTeXMathItalic from 'katex/dist/fonts/KaTeX_Math-Italic.woff2?inline'
import kaTeXSansBold from 'katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?inline'
import kaTeXSansItalic from 'katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?inline'
import kaTeXSansReg from 'katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?inline'
import kaTeXScriptReg from 'katex/dist/fonts/KaTeX_Script-Regular.woff2?inline'
import kaTeXSize1Reg from 'katex/dist/fonts/KaTeX_Size1-Regular.woff2?inline'
import kaTeXSize2Reg from 'katex/dist/fonts/KaTeX_Size2-Regular.woff2?inline'
import kaTeXSize3Reg from 'katex/dist/fonts/KaTeX_Size3-Regular.woff2?inline'
import kaTeXSize4Reg from 'katex/dist/fonts/KaTeX_Size4-Regular.woff2?inline'
import kaTeXTypewriterReg from 'katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?inline'

/** 字体文件名（不含扩展名）→ data URI */
const FONT_URIS: Record<string, string> = {
  'KaTeX_AMS-Regular': kaTeXAMSR,
  'KaTeX_Caligraphic-Bold': kaTeXCalBold,
  'KaTeX_Caligraphic-Regular': kaTeXCalReg,
  'KaTeX_Fraktur-Bold': kaTeXFraBold,
  'KaTeX_Fraktur-Regular': kaTeXFraReg,
  'KaTeX_Main-Bold': kaTeXMainBold,
  'KaTeX_Main-BoldItalic': kaTeXMainBoldItalic,
  'KaTeX_Main-Italic': kaTeXMainItalic,
  'KaTeX_Main-Regular': kaTeXMainReg,
  'KaTeX_Math-BoldItalic': kaTeXMathBoldItalic,
  'KaTeX_Math-Italic': kaTeXMathItalic,
  'KaTeX_SansSerif-Bold': kaTeXSansBold,
  'KaTeX_SansSerif-Italic': kaTeXSansItalic,
  'KaTeX_SansSerif-Regular': kaTeXSansReg,
  'KaTeX_Script-Regular': kaTeXScriptReg,
  'KaTeX_Size1-Regular': kaTeXSize1Reg,
  'KaTeX_Size2-Regular': kaTeXSize2Reg,
  'KaTeX_Size3-Regular': kaTeXSize3Reg,
  'KaTeX_Size4-Regular': kaTeXSize4Reg,
  'KaTeX_Typewriter-Regular': kaTeXTypewriterReg,
}

/** 生成内联了 woff2 字体的 KaTeX 样式文本（自包含，可离线渲染公式） */
export function buildKatexCssWithFonts(): string {
  let css = katexCssText
  // 1. 把 woff2 引用替换为 data URI（浏览器按顺序优先使用 woff2，成功后不再请求 woff/ttf）
  for (const [name, uri] of Object.entries(FONT_URIS)) {
    css = css.replace(new RegExp(`url\\(fonts/${name}\\.woff2\\)`, 'g'), `url(${uri})`)
  }
  // 2. 移除剩余的 woff / ttf 引用（已无意义，且相对路径在导出页内会 404）。
  //    katex 样式里 format 用双引号（format("woff")），两种引号都处理。
  css = css.replace(/,\s*url\(fonts\/[^)]+\)\s*format\(['"][^'"]+['"]\)/g, '')
  return css
}
