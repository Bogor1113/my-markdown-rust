/// Emoji 自动补全插件
///
/// 用户输入 `:` 后弹出 emoji 列表，继续输入字符进行过滤，
/// 选择后将 `:keyword:` 替换为对应 emoji。

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'

const key = new PluginKey('emoji-autocomplete')

/** 常用 emoji 列表 */
const EMOJI_MAP: Record<string, string> = {
  smile: '😊', laugh: '😄', wink: '😉', cool: '😎', heart: '❤️',
  thumbsup: '👍', thumbsdown: '👎', clap: '👏', fire: '🔥', star: '⭐',
  check: '✅', cross: '❌', warning: '⚠️', info: 'ℹ️', question: '❓',
  bulb: '💡', rocket: '🚀', sparkles: '✨', tada: '🎉',
  wave: '👋', eyes: '👀', thinking: '🤔', sun: '☀️', moon: '🌙',
  book: '📚', pencil: '✏️', link: '🔗', code: '💻',
  bug: '🐛', wrench: '🔧', key: '🔑', lock: '🔒',
  clock: '⏰', calendar: '📅', bell: '🔔', email: '📧',
  coffee: '☕', pizza: '🍕', apple: '🍎', cake: '🎂',
  dog: '🐕', cat: '🐱', panda: '🐼', trophy: '🏆', crown: '👑',
  music: '🎶', paint: '🎨', camera: '📷', game: '🎮',
  gift: '🎁', party: '🎉', ghost: '👻',
  plus: '➕', minus: '➖', save: '💾', trash: '🗑️',
  folder: '📁', file: '📄', search: '🔍', memo: '📝',
  flag: '🚩', tag: '🏷️', package: '📦', plane: '✈️',
}

function getEmojiList(query: string): { emoji: string; name: string }[] {
  const q = query.toLowerCase()
  return Object.entries(EMOJI_MAP)
    .filter(([name]) => name.includes(q))
    .slice(0, 12)
    .map(([name, emoji]) => ({ emoji, name }))
}

class EmojiPopup {
  private el: HTMLDivElement | null = null
  private _items: { emoji: string; name: string }[] = []
  private _selectedIndex = 0
  private _startPos = 0
  private _view: EditorView | null = null
  private _onSelect: ((emoji: string) => void) | null = null

  show(view: EditorView, startPos: number, query: string, onSelect: (emoji: string) => void) {
    this._view = view
    this._startPos = startPos
    this._onSelect = onSelect
    this._items = getEmojiList(query)
    this._selectedIndex = 0

    if (this._items.length === 0) { this.hide(); return }

    if (!this.el) {
      this.el = document.createElement('div')
      this.el.style.cssText = 'position:fixed;z-index:999;background:var(--color-bg-toolbar);border:1px solid var(--color-border);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:4px;max-height:240px;overflow-y:auto;min-width:200px;'
      document.body.appendChild(this.el)
    }
    this.render()
    this.updatePosition()
  }

  render() {
    if (!this.el) return
    this.el.innerHTML = ''
    this._items.forEach((item, i) => {
      const btn = document.createElement('button')
      btn.style.cssText = `display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:none;background:${i === this._selectedIndex ? 'var(--color-accent)' : 'transparent'};color:var(--color-text);cursor:pointer;border-radius:4px;font-size:14px;text-align:left;`
      btn.innerHTML = `<span style="font-size:18px">${item.emoji}</span><span style="font-size:12px;opacity:0.7">${item.name}</span>`
      btn.addEventListener('mouseenter', () => { this._selectedIndex = i; this.render() })
      btn.addEventListener('click', (e) => { e.preventDefault(); this.select(i) })
      this.el!.appendChild(btn)
    })
  }

  select(index: number) {
    const item = this._items[index]
    if (item && this._onSelect) this._onSelect(item.emoji)
    this.hide()
  }

  moveUp() { this._selectedIndex = Math.max(0, this._selectedIndex - 1); this.render() }
  moveDown() { this._selectedIndex = Math.min(this._items.length - 1, this._selectedIndex + 1); this.render() }

  updatePosition() {
    if (!this.el || !this._view) return
    const coords = this._view.coordsAtPos(this._view.state.selection.$from.pos)
    this.el.style.left = `${coords.left}px`
    this.el.style.top = `${coords.bottom + 4}px`
  }

  hide() {
    if (this.el) { this.el.remove(); this.el = null }
    this._items = []; this._view = null; this._onSelect = null
  }

  get isVisible() { return this.el !== null && this._items.length > 0 }
  get startPos() { return this._startPos }
  get selIndex() { return this._selectedIndex }
}

export const emojiAutocompletePlugin = $prose(() => {
  const popup = new EmojiPopup()
  let colonPos = -1

  /**
   * 把 `:query` 替换为选中的 emoji。
   * popup.startPos 是冒号的**文档绝对位置**（colonPos = 插入点 + 1），
   * 替换区间 = [冒号, 当前光标)；两端均用绝对坐标，
   * 不能再叠加 $from.start()（历史上重复累加导致非首段替换位置错乱甚至 RangeError）。
   */
  const replaceWithEmoji = (view: EditorView, emoji: string) => {
    const $cur = view.state.selection.$from
    const absStart = Math.min(popup.startPos, $cur.pos)
    const absEnd = $cur.pos
    view.dispatch(view.state.tr.insertText(emoji, absStart, absEnd))
  }

  return new Plugin({
    key,
    view(view: EditorView) {
      return {
        update() {
          if (popup.isVisible) {
            const cursor = view.state.selection.$from.pos
            if (cursor <= colonPos || cursor > colonPos + 20) { popup.hide(); colonPos = -1 }
          }
        },
        destroy() { popup.hide() },
      }
    },
    props: {
      handleTextInput(view, from, _to, text) {
        const $from = view.state.selection.$from

        if (text === ':') {
          colonPos = from + 1
          setTimeout(() => {
            popup.show(view, colonPos, '', (emoji) => replaceWithEmoji(view, emoji))
          }, 0)
          return false
        }

        if (colonPos >= 0 && popup.isVisible) {
          // query 取「冒号之后 → 当前光标」的文本。
          // textContent 的下标是块内相对位置，需减去块内容起点 $from.start()；
          // 且当前这次输入的字符尚未插入，parentOffset 不含它，天然只统计已输入部分。
          const queryStart = popup.startPos - $from.start() + 1
          const query =
            queryStart >= 0
              ? $from.parent.textContent.slice(queryStart, $from.parentOffset)
              : ''
          if (!query.includes(' ')) {
            popup.show(view, popup.startPos, query, (emoji) => replaceWithEmoji(view, emoji))
            return false
          }
          popup.hide(); colonPos = -1
        }
        return false
      },
      handleKeyDown(_view, event) {
        if (!popup.isVisible) return false
        if (event.key === 'ArrowDown') { event.preventDefault(); popup.moveDown(); return true }
        if (event.key === 'ArrowUp') { event.preventDefault(); popup.moveUp(); return true }
        if (event.key === 'Enter') { event.preventDefault(); popup.select(popup.selIndex); return true }
        if (event.key === 'Escape') { event.preventDefault(); popup.hide(); colonPos = -1; return true }
        return false
      },
    },
  })
})
