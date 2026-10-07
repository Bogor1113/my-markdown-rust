// Test script to generate a minimal docx and inspect the XML
import * as fs from 'fs'
import {
  Document, Packer, Paragraph, TextRun, ShadingType,
} from '../node_modules/.pnpm/docx@9.7.1/node_modules/docx/dist/index.mjs'

const FONT_BODY = { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: '微软雅黑' }
const FONT_CODE = { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: '微软雅黑' }

async function main() {
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT_BODY, size: 22 } },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children: [
        // Simple paragraph
        new Paragraph({
          children: [new TextRun({ text: 'Hello World 你好世界测试' })],
          spacing: { after: 120 },
        }),
        // Code block style
        new Paragraph({
          children: [
            new TextRun({ text: 'const x = 1;', font: FONT_CODE, size: 19 }),
            new TextRun({ text: 'const y = 2;', break: 1, font: FONT_CODE, size: 19 }),
          ],
          shading: { type: ShadingType.CLEAR, fill: 'F5F5F5' },
          spacing: { before: 120, after: 120 },
        }),
        // Inline code
        new Paragraph({
          children: [
            new TextRun({ text: 'Normal text with ' }),
            new TextRun({ text: 'inline code', font: FONT_CODE, size: 19, shading: { type: ShadingType.CLEAR, fill: 'F0F0F0' } }),
            new TextRun({ text: ' in it.' }),
          ],
          spacing: { after: 120 },
        }),
        // Bold and italic
        new Paragraph({
          children: [
            new TextRun({ text: 'Bold text', bold: true }),
            new TextRun({ text: ' and italic text', italics: true }),
          ],
          spacing: { after: 120 },
        }),
        // Highlight
        new Paragraph({
          children: [
            new TextRun({ text: 'Highlighted text', highlight: 'yellow' }),
          ],
          spacing: { after: 120 },
        }),
        // Chinese text
        new Paragraph({
          children: [new TextRun({ text: '这是一段中文测试文本，用于验证字符间距问题。' })],
          spacing: { after: 120 },
        }),
        // Mixed CJK + ASCII
        new Paragraph({
          children: [new TextRun({ text: '混合 English 和中文 测试 spacing 问题。' })],
          spacing: { after: 120 },
        }),
      ],
    }],
  })

  const blob = await Packer.toBlob(doc)
  const buf = Buffer.from(await blob.arrayBuffer())
  fs.writeFileSync('temp-docx-test/output.docx', buf)
  console.log('Written output.docx')
}

main().catch(console.error)