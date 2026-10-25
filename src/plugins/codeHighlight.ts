/// 增量 + 视口化语法高亮插件。
///
/// 替换 `@milkdown/plugin-highlight`（内部是 prosemirror-highlight）：
/// 那个插件的 `state.apply` 每次文档变化都会
///   1. `doc.descendants` 全量收集所有代码块；
///   2. 对每个代码块做一次 `node.eq` 校验缓存；
///   3. 把**全部**代码块的高亮 decoration 重新 `DecorationSet.create` 一遍。
/// 实测 60 万字符 / 881 个代码块的文档里，单键就要 ~470ms，是输入卡顿的最大来源。
///
/// 这里复用同一套 lowlight 解析器（`highlightParser`），但：
///   - **只对发生变化的顶层块**重新解析，其余 decoration 按 StepMap 平移复用
///     （见 utils/incrementalDecorations.ts）；
///   - **打开文档时只解析首屏附近的块**，其余块在浏览器空闲时按片补齐。
///
/// 第二条是「大文件打开慢」的主因：616KB / 780 个代码块，全量高亮实测 ~1.0s
/// （其中 highlightParser 自身 527ms、lowlight exec 181ms），而这 780 个块里
/// 首屏只看得到 3~5 个。打开时只做前 120KB（≈150ms），剩余部分由 idle 分片
/// 补完；用户滚到哪一片，那一片也优先补（滚动触发的 ensure）。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node } from '@milkdown/kit/prose/model'
import type { ResolvedPos } from '@milkdown/kit/prose/model'
import { highlightParser } from '../config/lowlight'
import { updateDecorationsEx } from '../utils/incrementalDecorations'
import { viewportTopPos } from '../utils/viewportPos'

const key = new PluginKey('mditor-code-highlight')

/** 打开时先高亮的字符数。首屏大约只显示 3~6KB，给到 24KB 已经覆盖七八屏；
 *  多给的部分并非免费：每 24KB 约有 30 个代码块、上千个高亮 span，实测首帧
 *  每多 100KB 就多 400ms 的 DOM 构建成本。超出部分滚动到哪儿补哪儿。 */
const SEED_CHARS = 24_000
/** 后台每片处理的字符数。单片约 25~50ms，分到多个空闲帧里不打扰输入。 */
const CHUNK_CHARS = 30_000
/** 用户最近一次输入后多久内不抢主线程做后台高亮 */
const TYPING_QUIET_MS = 400

/** 只解析 [from, to) 区间内的代码块，生成高亮 decoration */
const build = (doc: Node, from: number, to: number): Decoration[] => {
  const decos: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'code_block') return
    if (node.content.size === 0) return false
    const parsed = highlightParser({
      content: node.textContent,
      language: (node.attrs.language as string | null) || undefined,
      pos,
      size: node.nodeSize,
    })
    if (Array.isArray(parsed) && parsed.length) decos.push(...parsed)
    // 代码块内部是纯文本，不必继续下钻
    return false
  })
  return decos
}

interface HLState {
  doc: Node
  set: DecorationSet
  /** 已处理过的代码块起始 pos（空块也算，避免反复重试） */
  done: Set<number>
  /** 顺序补齐扫描到的文档位置 */
  scanPos: number
  /** 打字期间被「跳过重算」的代码块范围，停手后要补算（见 apply 内注释） */
  dirty: { from: number; to: number } | null
}

/**
 * 光标所在代码块的范围；不在代码块里返回 null。
 *
 * 用来判断「这次文档变化是不是用户在代码块里打字」——那种情况下不能重算
 * 这块的高亮，原因见 apply 里的长注释。
 */
const codeBlockHost = ($from: ResolvedPos): { from: number; to: number } | null => {
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'code_block') {
      const from = $from.before(d)
      return { from, to: from + node.nodeSize }
    }
  }
  return null
}

/**
 * 同步补完全文高亮。
 *
 * 导出 HTML / PDF 时是把编辑器 DOM `cloneNode(true)` 后加工的（services/export.ts），
 * 而高亮是按视口懒生成的 —— 屏幕外还没补的高亮在克隆结果里就是纯文本，
 * 导出的文件会缺掉大半语法着色。所以导出前必须先调这个把全文补齐。
 *
 * 已经处理过的块由插件 state 里的 `done` 集合跳过，因此重复调用只花一次
 * 「遍历 + 查集合」的时间（780 个代码块约 1ms），不会重复解析。
 */
export function flushAllCodeHighlight(view: EditorView): void {
  if (view.isDestroyed || view.composing) return
  const st = key.getState(view.state)
  if (!st) return
  const size = view.state.doc.content.size
  if (size <= 0) return
  view.dispatch(view.state.tr.setMeta('addToHistory', false).setMeta(key, { from: 0, to: size }))
}

export const codeHighlightPlugin = $prose(
  () =>
    new Plugin<HLState>({
      key,
      state: {
        init: (_config, state) => {
          const seedTo = Math.min(state.doc.content.size, SEED_CHARS)
          const done = new Set<number>()
          state.doc.nodesBetween(0, seedTo, (node, pos) => {
            if (node.type.name !== 'code_block') return
            done.add(pos)
            return false
          })
          return {
            doc: state.doc,
            set: DecorationSet.create(state.doc, build(state.doc, 0, seedTo)),
            done,
            scanPos: seedTo,
            dirty: null,
          }
        },
        apply: (tr, value, _oldState, newState) => {
          if (tr.docChanged) {
            // ⚠️ 在代码块里打字时**不能**重算这一块的高亮。
            //
            // 高亮是行内 Decoration，一旦结果变了，ProseMirror 就会重建代码块
            // 内部那串 <span>；重建的瞬间 contenteditable 里的 DOM selection
            // 指向的是已经被换掉的文本节点，下一个字符进来时 PM 用 posAtDOM
            // 反推位置失败，退回到块首 —— 表现为「字倒着插」：
            // 输入 `const a = 1` 存盘变成 ` a = 1const`，整段语法全毁。
            //
            // 真机上必现（`const` 打完就从普通文本变成 keyword，那一下正好触发重算），
            // 这里改成：打字期间只按 StepMap 平移旧装饰（DOM 结构不变，
            // 光标安全），把块范围记进 dirty，停手 400ms 后再重算一次。
            const host = codeBlockHost(newState.selection.$from)
            if (host) {
              const done = new Set<number>()
              for (const p of value.done) {
                const m = tr.mapping.mapResult(p, 1)
                if (!m.deleted) done.add(m.pos)
              }
              return {
                doc: tr.doc,
                set: value.set.map(tr.mapping, tr.doc),
                done,
                scanPos: tr.mapping.map(value.scanPos, 1),
                dirty: {
                  from: tr.mapping.map(host.from, -1),
                  to: tr.mapping.map(host.to, 1),
                },
              }
            }

            const r = updateDecorationsEx(value.doc, tr.doc, value.set, build)
            // done 里记的是旧坐标，按本次事务的 mapping 平移；被删除的丢弃
            const done = new Set<number>()
            for (const p of value.done) {
              const m = tr.mapping.mapResult(p, 1)
              if (!m.deleted) done.add(m.pos)
            }
            // 变化区间内的块已经由 updateDecorationsEx 重建过高亮，标记为已处理，
            // 免得后台扫描到它们时重复解析、装饰叠加两遍
            for (const rg of r.ranges) {
              tr.doc.nodesBetween(rg.from, rg.to, (node, pos) => {
                if (node.type.name !== 'code_block') return
                done.add(pos)
                return false
              })
            }
            return {
              doc: tr.doc,
              set: r.set,
              done,
              scanPos: tr.mapping.map(value.scanPos, 1),
              dirty: null,
            }
          }

          // 后台 / 滚动 / 停手补算触发的「补一段高亮」请求
          const req = tr.getMeta(key) as { from: number; to: number; force?: boolean } | undefined
          if (req) {
            const size = tr.doc.content.size
            const from = Math.max(0, Math.min(req.from, req.to, size))
            const to = Math.max(0, Math.min(Math.max(req.from, req.to), size))
            if (to <= from) return value
            const done = new Set(value.done)
            const decos: Decoration[] = []
            // force：停手后补算「打字期间被跳过」的块。先摘掉这些块原有的旧装饰，
            // 否则新旧两套 span 会叠在一起（颜色错乱、DOM 也翻倍）。
            let set = value.set
            if (req.force) set = set.remove(set.find(from, to))
            tr.doc.nodesBetween(from, to, (node, pos) => {
              if (node.type.name !== 'code_block') return
              if (!req.force && done.has(pos)) return false
              done.add(pos)
              if (node.content.size === 0) return false
              const parsed = highlightParser({
                content: node.textContent,
                language: (node.attrs.language as string | null) || undefined,
                pos,
                size: node.nodeSize,
              })
              if (Array.isArray(parsed) && parsed.length) decos.push(...parsed)
              return false
            })
            const scanPos = Math.max(value.scanPos, to)
            if (!decos.length) {
              return { doc: tr.doc, set, done, scanPos, dirty: req.force ? null : value.dirty }
            }
            return {
              doc: tr.doc,
              set: set.add(tr.doc, decos),
              done,
              scanPos,
              dirty: req.force ? null : value.dirty,
            }
          }
          return value
        },
      },
      props: {
        decorations: (state) => key.getState(state)!.set,
      },
      view: (view: EditorView) => {
        /** 排队中的一次「补齐」任务。必须记录种类，否则 destroy 时无法取消 */
        let pending: { kind: 'idle' | 'timeout'; id: number } | null = null
        const hasIdle = typeof requestIdleCallback === 'function'
        let lastTyping = 0
        /** 后台补齐的启动时刻：首帧绘制前不抢主线程，否则会把「打开到看见内容」拖长 */
        let bootAt = performance.now() + 700
        /** 最近一次滚动时刻：滚动期间暂停后台补齐，否则插入的高亮 span 会让
         *  每帧多出 50~80ms 重排（实测滚动 p90 从 50ms 恶化到 63ms、掉帧率 45%）。 */
        let lastScroll = 0
        const scrollRoot: HTMLElement =
          (view.dom.closest('.milkdown') as HTMLElement | null) ??
          (view.dom.parentElement as HTMLElement | null) ??
          document.documentElement

        /** 请求补 [from, to)。docChanged=false，只改 decoration，不碰撤销栈。 */
        const request = (from: number, to: number) => {
          if (view.isDestroyed || view.composing) return
          view.dispatch(
            view.state.tr.setMeta('addToHistory', false).setMeta(key, { from, to }),
          )
        }

        /** 后台补齐：每次只处理一片，剩下的排到下一个空闲帧 */
        const pump = () => {
          if (view.isDestroyed) return
          const st = key.getState(view.state)
          if (!st) return
          const size = view.state.doc.content.size
          if (st.scanPos >= size) return
          if (performance.now() < bootAt) {
            schedule(400)
            return
          }
          if (view.composing || performance.now() - lastTyping < TYPING_QUIET_MS) {
            // 正在打字：别抢主线程，过一会儿再来
            schedule(500)
            return
          }
          if (performance.now() - lastScroll < 600) {
            // 正在滚动：等停稳再补
            schedule(400)
            return
          }
          request(st.scanPos, Math.min(size, st.scanPos + CHUNK_CHARS))
          schedule()
        }

        const schedule = (delayMs = 0) => {
          if (pending) return
          if (delayMs > 0 || !hasIdle) {
            const id = window.setTimeout(() => {
              pending = null
              pump()
            }, delayMs || 120)
            pending = { kind: 'timeout', id }
          } else {
            const id = requestIdleCallback(
              () => {
                pending = null
                pump()
              },
              { timeout: 800 },
            )
            pending = { kind: 'idle', id }
          }
        }

        const cancelPending = () => {
          if (!pending) return
          if (pending.kind === 'idle') cancelIdleCallback(pending.id)
          else clearTimeout(pending.id)
          pending = null
        }

        /** 滚动时：视口里如果有还没高亮的块，马上补这一片（优先于顺序补齐） */
        const syncViewport = () => {
          if (view.isDestroyed || view.composing) return
          const st = key.getState(view.state)
          if (!st) return
          if (st.scanPos >= view.state.doc.content.size) return
          const rect = scrollRoot.getBoundingClientRect()
          if (rect.height <= 0) return
          const top = viewportTopPos(view, scrollRoot)
          if (top === null) return
          const bottomHit = view.posAtCoords({ left: rect.left + 24, top: rect.bottom - 12 })
          const bottom = bottomHit ? bottomHit.pos : top + 4000
          const from = Math.max(0, Math.min(top, bottom) - 4000)
          const to = Math.max(top, bottom) + 4000
          // 只在这段里确实存在未处理代码块时才发事务，避免滚动中空派发
          let missing = false
          view.state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name !== 'code_block') return
            if (!st.done.has(pos)) {
              missing = true
              return false
            }
            return false
          })
          if (missing) request(from, to)
        }

        // 滚动停止 220ms 后才补视口高亮。
        //
        // 不能在滚动过程中补：一次补会往代码块里插入成千上万个高亮 span，
        // 触发整段重新布局，实测每帧 50~70ms 长任务——滚动直接从「跟手」变成
        // 「一卡一卡」。停稳后再补，用户感知不到，帧率也不受影响。
        let scrollTimer = 0
        const onScroll = () => {
          lastScroll = performance.now()
          if (scrollTimer) clearTimeout(scrollTimer)
          scrollTimer = window.setTimeout(() => {
            scrollTimer = 0
            syncViewport()
          }, 220)
        }

        const onKey = () => {
          lastTyping = performance.now()
        }

        /**
         * 停手后补算「打字期间被跳过」的那块高亮。
         *
         * 每次文档变化都重置定时器，所以只在真正停下来之后跑一次；
         * 用 TYPING_QUIET_MS + 80ms，确保不会和用户的下一次按键抢执行。
         */
        let dirtyTimer = 0
        const armDirtyFlush = () => {
          if (dirtyTimer) clearTimeout(dirtyTimer)
          dirtyTimer = window.setTimeout(() => {
            dirtyTimer = 0
            if (view.isDestroyed) return
            const st = key.getState(view.state)
            if (!st || !st.dirty) return
            view.dispatch(
              view.state.tr
                .setMeta('addToHistory', false)
                .setMeta(key, { from: st.dirty.from, to: st.dirty.to, force: true }),
            )
          }, TYPING_QUIET_MS + 80)
        }

        scrollRoot.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('keydown', onKey, { passive: true })
        window.addEventListener('beforeinput', onKey, { passive: true })
        // 初次挂载：文档可能已经被 updateState 换成新的（打开文件 / 切标签），
        // 首屏之外的部分交给后台补齐
        schedule()
        // 首帧绘制完成后立刻补一次「视口内」的高亮：种子只覆盖文档开头的一小段，
        // 若首屏已经滚到别处（或开头是大段文字、首屏代码块落在种子之外），
        // 这一步保证用户一眼看到的东西都是有颜色的，且只处理视口内那几块。
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!view.isDestroyed) syncViewport()
          })
        })

        return {
          // 换文档（打开文件、切标签、快照还原）后重新排队补齐
          update: (updatedView: EditorView, prevState) => {
            if (updatedView.state.doc === prevState.doc) return
            // 换成一篇很大的新文档时，重新给首帧留出喘息时间
            if (updatedView.state.doc.content.size > 400_000) {
              bootAt = performance.now() + 700
            }
            schedule()
            armDirtyFlush()
          },
          destroy: () => {
            cancelPending()
            if (scrollTimer) clearTimeout(scrollTimer)
            if (dirtyTimer) clearTimeout(dirtyTimer)
            scrollRoot.removeEventListener('scroll', onScroll)
            window.removeEventListener('keydown', onKey)
            window.removeEventListener('beforeinput', onKey)
          },
        }
      },
    }),
)
