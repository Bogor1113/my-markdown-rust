import { $prose } from '@milkdown/kit/utils'
import { Plugin } from '@milkdown/kit/prose/state'
import { useAppStore } from '../../stores/useAppStore'
import { detectContext } from './contextDetect'

/**
 * 右键菜单插件：
 * 拦截编辑器 DOM 的 contextmenu 事件，判断点击上下文（文本/代码块/表格/链接/图片），
 * 然后把状态写入 zustand store，由 React 层渲染菜单。
 */
export const contextMenuPlugin = $prose(() => {
  return new Plugin({
    props: {
      handleDOMEvents: {
        contextmenu: (view, event) => {
          const mouseEvent = event as MouseEvent
          const target = mouseEvent.target as HTMLElement | null

          // 编辑器内右键才拦截
          if (!view.dom.contains(target)) return false

          mouseEvent.preventDefault()

          // 若点击的是 Milkdown 自身的控件（如代码块语言徽章），由徽章自己处理
          if (target?.closest('[data-no-contextmenu]')) return true

          // 计算文档坐标 → ProseMirror pos
          const coords = { left: mouseEvent.clientX, top: mouseEvent.clientY }
          const posResult = view.posAtCoords(coords)
          const pos = posResult ? posResult.pos : view.state.selection.from

          const detected = detectContext(view, pos)
          if (!detected) return true

          const { showContextMenu } = useAppStore.getState()

          // HTML 块/行内里直接渲染的 <img>（如 <div><img src=...></div>）没有对应的
          // ProseMirror 图片节点，detectContext 只能判成文本；这里按 DOM 目标识别为
          // 图片上下文（imageFromHtml 标记，节点级操作如「更新路径/删除」不可用）。
          const htmlImg = target?.closest('img') as HTMLImageElement | null
          if (htmlImg && detected.type !== 'image') {
            showContextMenu({
              visible: true,
              x: mouseEvent.clientX,
              y: mouseEvent.clientY,
              type: 'image',
              pos: detected.pos,
              // 优先用渲染时记录的原始 src（相对路径/URL），它才是文档里保存的、
              // 可按文档目录正确解析的地址；DOM 的 src 是改过的 asset:// 显示地址
              imageSrc: htmlImg.dataset.mdSrc ?? htmlImg.getAttribute('src') ?? '',
              imageAlt: htmlImg.getAttribute('alt') ?? '',
              imageFromHtml: true,
            })
            return true
          }

          showContextMenu({
            visible: true,
            x: mouseEvent.clientX,
            y: mouseEvent.clientY,
            type: detected.type,
            pos: detected.pos,
            href: detected.href,
            codeBlockPos: detected.codeBlockPos,
            codeLang: detected.codeLang,
            imageSrc: detected.imageSrc,
            imageAlt: detected.imageAlt,
          })
          return true
        },
      },
    },
  })
})