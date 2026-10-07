import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'

/// GFM 任务列表 `- [ ]` 复选框点击切换：点击渲染出的 checkbox
/// （带 `data-checked` 属性）时，翻转所在 `list_item` 的 `checked` 属性。
export const taskTogglePlugin = $prose(() =>
  new Plugin({
    key: new PluginKey('taskToggle'),
    props: {
      handleClick(view, _pos, event) {
        const targetEl = event.target as HTMLElement | null
        if (!targetEl) return false
        const cb = targetEl.closest('[data-checked]') as HTMLElement | null
        if (!cb) return false
        const pos = view.posAtDOM(cb, 0)
        const $pos = view.state.doc.resolve(pos)
        for (let d = $pos.depth; d > 0; d--) {
          const node = $pos.node(d)
          if (node.type.name === 'list_item' && 'checked' in node.attrs) {
            const checked = node.attrs.checked as boolean | null
            const next = checked === true ? false : true
            const before = $pos.before(d)
            view.dispatch(view.state.tr.setNodeAttribute(before, 'checked', next))
            return true
          }
        }
        return false
      },
    },
  }),
)
