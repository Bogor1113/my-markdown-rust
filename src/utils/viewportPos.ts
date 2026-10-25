/// 视口顶部对应的文档位置（带缓存的 posAtCoords）。
///
/// 为什么需要它：大纲 scroll-spy 与代码块行号同步都要知道「屏幕顶端在文档的哪个
/// 位置」。两者的旧实现各用各的办法——大纲对每个标题调 getBoundingClientRect
/// （616KB / 1125 个标题的文档，滚到底时一帧要读 1125 次几何，实测 ~147ms/帧，
/// 滚动直接卡死）；行号每键调两次 posAtCoords（大文档 ~9ms/次）。
///
/// 这里统一成「一次 posAtCoords + 缓存」：同一帧内两个调用方共享结果，
/// 滚动位置没变时直接复用，避免重复的命中测试。

import type { EditorView } from '@milkdown/kit/prose/view'

interface CacheEntry {
  /** 上次计算时间 */
  t: number
  /** 上次计算时的滚动位置（scrollTop 不变 → 结果必然不变） */
  scrollTop: number
  /** 上次计算的视口高度（容器尺寸变化时缓存作废） */
  height: number
  pos: number | null
}

const cache = new WeakMap<EditorView, CacheEntry>()

/** 缓存有效期：滚动中每 60ms 最多算一次，肉眼无感，CPU 省一个数量级 */
const MAX_AGE_MS = 60

/**
 * 取滚动容器视口顶部（略向下 8px，避开容器内边距）对应的文档位置。
 *
 * @param view  编辑器视图
 * @param root  滚动容器（.milkdown）
 * @returns 文档位置；取不到（视口落在内边距/空白里）时返回 null
 */
export function viewportTopPos(view: EditorView, root: HTMLElement): number | null {
  if (view.isDestroyed) return null
  const scrollTop = root.scrollTop
  const height = root.clientHeight
  const now = performance.now()
  const hit = cache.get(view)
  if (hit && hit.scrollTop === scrollTop && hit.height === height && now - hit.t < MAX_AGE_MS) {
    return hit.pos
  }
  const rect = root.getBoundingClientRect()
  if (rect.height <= 0) return null
  let pos: number | null = null
  try {
    const found = view.posAtCoords({ left: rect.left + 24, top: rect.top + 8 })
    pos = found ? found.pos : null
  } catch {
    pos = null
  }
  cache.set(view, { t: now, scrollTop, height, pos })
  return pos
}

/** 视图销毁/文档重载后清掉缓存，避免拿到上一篇文档的位置 */
export function clearViewportPos(view: EditorView) {
  cache.delete(view)
}
