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
        // data-checked 挂在整个 <li> 上（Milkdown GFM 的 toDOM 决定），
        // 若不限定区域，点击任务项正文文字也会翻转复选框。
        // 只有点击落在 li 自身（padding / ::before 伪元素画的 checkbox 区域），
        // 且横坐标在行首 checkbox 带内（36px）才视为勾选动作；点到 <p> 正文一律放行。
        if (targetEl !== cb) return false
        const rect = cb.getBoundingClientRect()
        if (event.clientX - rect.left > 36) return false
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
