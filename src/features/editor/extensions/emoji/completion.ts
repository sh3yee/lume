import type { EmojiEntry } from './data'
import './styles.css'

export type EmojiCompletionPopup = ReturnType<typeof createEmojiCompletionPopup>

export const createEmojiCompletionPopup = (options: {
  ownerDocument: Document
  onSelect: (entry: EmojiEntry) => void
}) => {
  const { ownerDocument } = options
  const popup = ownerDocument.createElement('div')
  const list = ownerDocument.createElement('div')
  const hint = ownerDocument.createElement('div')
  popup.className = 'lume-emoji-completion'
  popup.hidden = true
  list.setAttribute('role', 'listbox')
  list.setAttribute('aria-label', '表情符号补全')
  hint.className = 'lume-emoji-completion__hint'
  hint.textContent = '↑ ↓ 选择 · Enter / Tab 确认 · Esc 关闭'
  popup.append(list, hint)
  ownerDocument.body.append(popup)

  const show = (state: { items: EmojiEntry[]; selected: number; left: number; top: number }) => {
    list.replaceChildren()
    state.items.forEach((entry, index) => {
      const item = ownerDocument.createElement('button')
      const symbol = ownerDocument.createElement('span')
      const name = ownerDocument.createElement('span')
      item.type = 'button'
      item.tabIndex = -1
      item.className = 'lume-emoji-completion__item'
      item.setAttribute('role', 'option')
      item.setAttribute('aria-selected', String(index === state.selected))
      symbol.className = 'lume-emoji-completion__symbol'
      symbol.textContent = entry.emoji
      name.textContent = `:${entry.name}:`
      item.append(symbol, name)
      item.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        options.onSelect(entry)
      })
      list.append(item)
    })
    popup.hidden = false
    const bounds = popup.getBoundingClientRect()
    const viewport = ownerDocument.defaultView
    const width = viewport?.innerWidth ?? ownerDocument.documentElement.clientWidth
    const height = viewport?.innerHeight ?? ownerDocument.documentElement.clientHeight
    const top = state.top + bounds.height + 8 <= height ? state.top : state.top - bounds.height - 28
    popup.style.left = `${Math.max(8, Math.min(state.left, width - bounds.width - 8))}px`
    popup.style.top = `${Math.max(8, Math.min(top, height - bounds.height - 8))}px`
  }

  return {
    show,
    hide: () => {
      popup.hidden = true
    },
    destroy: () => popup.remove(),
  }
}
