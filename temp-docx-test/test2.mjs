// Comprehensive test to match the app's export settings exactly
import * as fs from 'fs'
import {
  Document, Packer, Paragraph, TextRun, ShadingType,
  HeadingLevel, AlignmentType, BorderStyle, ExternalHyperlink,
  LevelFormat, Table, TableCell, TableRow, WidthType,
  PageBreak,
} from '../node_modules/.pnpm/docx@9.7.1/node_modules/docx/dist/index.mjs'


const FONT_BODY = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: '微软雅黑' }
const FONT_HEADING = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: '微软雅黑' }
const FONT_CODE = { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: '微软雅黑' }
const HEADING_SIZES = [32, 28, 24, 22, 22, 20]
const HEADING_BEFORE = [480, 380, 300, 260, 220, 180]

// Simulate marksToRunOptions
function marksToRunOptions(text, marks, forceBold) {
  let o = { text }
  for (const m of marks) {
    switch (m.type.name) {
      case 'strong': o = { ...o, bold: true }; break
      case 'emphasis': o = { ...o, italics: true }; break
      case 'strikethrough': o = { ...o, strike: true }; break
      case 'code_inline': o = { ...o, font: FONT_CODE, size: 19, shading: { type: ShadingType.CLEAR, fill: 'F0F0F0' } }; break
      case 'highlight': o = { ...o, highlight: 'yellow' }; break
    }
  }
  if (forceBold) o = { ...o, bold: true }
  return o
}

async function main() {
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'md-bullet',
          levels: Array.from({ length: 4 }, (_, level) => ({
            level,
            format: LevelFormat.BULLET,
            text: ['•', '◦', '▪', '•'][level],
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 + level * 360, hanging: 240 } } },
          })),
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: FONT_BODY, size: 22 } },
        heading1: { run: { font: FONT_HEADING, size: HEADING_SIZES[0], bold: true, color: '1F6FEB' } },
        heading2: { run: { font: FONT_HEADING, size: HEADING_SIZES[1], bold: true, color: '1F2328' } },
        heading3: { run: { font: FONT_HEADING, size: HEADING_SIZES[2], bold: true, color: '1F2328' } },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children: [
        // Heading 1
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '测试标题' })],
          spacing: { before: HEADING_BEFORE[0], after: 120 },
          keepNext: true,
        }),
        // Normal paragraph with Chinese text
        new Paragraph({
          children: [new TextRun({ text: '这是一段中文测试文本，用于验证字符间距问题。如果每个字符之间都有很多空格，说明有问题。' })],
          spacing: { after: 120 },
        }),
        // Mixed Chinese and English
        new Paragraph({
          children: [new TextRun({ text: '混合 English 和中文 测试 spacing 问题，看看是否正常显示。' })],
          spacing: { after: 120 },
        }),
        // Heading 2
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: '代码块测试' })],
          spacing: { before: HEADING_BEFORE[1], after: 120 },
          keepNext: true,
        }),
        // Code block
        new Paragraph({
          children: [
            new TextRun({ text: 'const x = 1;', font: FONT_CODE, size: 19 }),
            new TextRun({ text: 'const y = 2;', break: 1, font: FONT_CODE, size: 19 }),
            new TextRun({ text: 'console.log(x + y);', break: 1, font: FONT_CODE, size: 19 }),
          ],
          shading: { type: ShadingType.CLEAR, fill: 'F5F5F5' },
          indent: { left: 120, right: 120 },
          spacing: { before: 120, after: 120 },
        }),
        // Inline code
        new Paragraph({
          children: [
            new TextRun({ text: '这是' }),
            new TextRun({ text: '内联代码', font: FONT_CODE, size: 19, shading: { type: ShadingType.CLEAR, fill: 'F0F0F0' } }),
            new TextRun({ text: '在段落中。' }),
          ],
          spacing: { after: 120 },
        }),
        // Bold + italic
        new Paragraph({
          children: [
            new TextRun({ text: '粗体文本', bold: true }),
            new TextRun({ text: ' 和 ' }),
            new TextRun({ text: '斜体文本', italics: true }),
          ],
          spacing: { after: 120 },
        }),
        // Highlight
        new Paragraph({
          children: [new TextRun({ text: '高亮文本测试', highlight: 'yellow' })],
          spacing: { after: 120 },
        }),
        // Strikethrough
        new Paragraph({
          children: [new TextRun({ text: '删除线文本', strike: true })],
          spacing: { after: 120 },
        }),
        // Link
        new Paragraph({
          children: [new ExternalHyperlink({
            link: 'https://example.com',
            children: [new TextRun({ text: '点击这里访问示例网站' })],
          })],
          spacing: { after: 120 },
        }),
        // Bullet list
        new Paragraph({
          children: [new TextRun({ text: '列表项一' })],
          numbering: { reference: 'md-bullet', level: 0 },
          spacing: { after: 60 },
        }),
        new Paragraph({
          children: [new TextRun({ text: '列表项二' })],
          numbering: { reference: 'md-bullet', level: 0 },
          spacing: { after: 60 },
        }),
        new Paragraph({
          children: [new TextRun({ text: '列表项三' })],
          numbering: { reference: 'md-bullet', level: 0 },
          spacing: { after: 60 },
        }),
        // Blockquote (simulated)
        new Paragraph({
          children: [new TextRun({ text: '这是一段引用文本，用于测试引用样式。' })],
          indent: { left: 720 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'A0A0A0', space: 8 } },
          spacing: { after: 120 },
        }),
        // Horizontal rule
        new Paragraph({
          children: [new TextRun({ text: '' })],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' } },
          spacing: { before: 120, after: 120 },
        }),
        // Table
        new Table({
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '表头1', bold: true })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '表头2', bold: true })], alignment: AlignmentType.CENTER })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '数据1' })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '数据2' })] })] }),
              ],
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
        }),
      ],
    }],
  })

  const blob = await Packer.toBlob(doc)
  const buf = Buffer.from(await blob.arrayBuffer())
  fs.writeFileSync('temp-docx-test/output2.docx', buf)
  console.log('Written output2.docx')
  console.log('Size:', buf.length, 'bytes')
}

main().catch(console.error)