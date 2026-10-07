import { EditorView } from '@milkdown/kit/prose/view'
import { NodeSelection } from '@milkdown/kit/prose/state'
import type { ContextMenuType } from '../../types'

/**
 * 检测点击位置所处的节点上下文。
 * @returns 上下文类型 + 相关位置/属性，null 表示无法确定
 */
export function detectContext(
  view: EditorView,
  pos: number,
): {
  type: ContextMenuType
  pos: number
  href?: string
  imageSrc?: string
  imageAlt?: string
  codeBlockPos?: number
  codeLang?: string
} | null {
  if (pos == null || pos < 0) return null

  const $pos = view.state.doc.resolve(pos)

  // 1. 代码块：光标在 code_block 内（含其文本）
  for (let d = $pos.depth; d >= 0; d--) {
    const node = d === 0 ? $pos.doc : $pos.node(d)
    if (node.type.name === 'code_block') {
      const blockPos = d === 0 ? 0 : $pos.before(d)
      return {
        type: 'codeBlock',
        pos: blockPos,
        codeBlockPos: blockPos,
        codeLang: (node.attrs.language as string) || '',
      }
    }
  }

  // 2. 表格：找到 table（返回点击处的原始位置，
  //    供「删除行/删除列/删除表格」精确定位到右键点击所在的行/列/表格）
  for (let d = $pos.depth; d >= 0; d--) {
    const node = d === 0 ? $pos.doc : $pos.node(d)
    if (node.type.name === 'table') {
      return { type: 'table', pos }
    }
  }

  // 3. 链接 mark（当前位置或其前一个位置）
  const marks = $pos.marks()
  const prevMarks = view.state.doc.resolve(Math.max(0, pos - 1)).marks()
  const linkMark = marks.find((m) => m.type.name === 'link') ?? prevMarks.find((m) => m.type.name === 'link')
  if (linkMark) {
    return { type: 'link', pos, href: linkMark.attrs.href as string }
  }

  // 4. 图片节点（含 ImageSelection）
  let selType: ContextMenuType | null = null
  let imageSrc: string | undefined
  let imageAlt: string | undefined
  const sel = view.state.selection
  if (sel instanceof NodeSelection && sel.node.type.name === 'image') {
    selType = 'image'
    imageSrc = sel.node.attrs.src as string
    imageAlt = sel.node.attrs.alt as string
  }

  // 5. 光标紧邻的图片
  const nodeAt = $pos.nodeAfter ?? $pos.nodeBefore
  if (!selType && nodeAt && nodeAt.type.name === 'image') {
    selType = 'image'
    imageSrc = nodeAt.attrs.src as string
    imageAlt = nodeAt.attrs.alt as string
  }

  if (selType) {
    return { type: selType, pos, imageSrc, imageAlt }
  }

  // 6. 兜底：普通文本
  return { type: 'text', pos }
}