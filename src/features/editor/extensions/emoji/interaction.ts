import { watch } from 'vue'
import { closeHistory } from '@milkdown/kit/prose/history'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { markdownPreferences } from '@/app/preferences/useMarkdownPreference'
import { createEmojiCompletionPopup, type EmojiCompletionPopup } from './completion'
import { searchEmoji, type EmojiEntry } from './data'
import { canInsertEmoji } from './schema'
import { getEmojiQuery } from './syntax'

const getCompletionQuery = (view: EditorView) => {
  const { selection, storedMarks } = view.state
  if (!view.editable || view.composing || !selection.empty) return null
  const { $from } = selection
  if (!$from.parent.isTextblock) return null
  for (let depth = 1; depth <= $from.depth; depth++) {
    const node = $from.node(depth)
    if (node.type.spec.code || /^(?:html|math|front_matter|link_source)/.test(node.type.name))
      return null
  }
  if ((storedMarks ?? $from.marks()).some((mark) => mark.type.spec.code)) return null
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const query = getEmojiQuery(before)
  if (!query) return null
  const from = $from.start() + query.from
  return canInsertEmoji(view.state, from, selection.from)
    ? { from, to: selection.from, query: query.query }
    : null
}

export const emojiCompletionPlugin = $prose(() => {
  let popup: EmojiCompletionPopup | null = null
  let active: ReturnType<typeof getCompletionQuery> = null
  let items: EmojiEntry[] = []
  let selected = 0

  const close = () => {
    active = null
    items = []
    selected = 0
    popup?.hide()
  }
  const render = (view: EditorView) => {
    if (!active) return
    const bounds = view.coordsAtPos(active.to)
    popup?.show({ items, selected, left: bounds.left, top: bounds.bottom + 4 })
  }
  const refresh = (view: EditorView, trigger = false) => {
    if (!markdownPreferences.enabled.emoji || !view.hasFocus()) return close()
    const query = getCompletionQuery(view)
    if (!query || (!trigger && (!active || query.from !== active.from))) return close()
    const matches = searchEmoji(query.query)
    if (!matches.length) return close()
    if (query.query !== active?.query) selected = 0
    active = query
    items = matches
    selected = Math.min(selected, items.length - 1)
    render(view)
  }
  const accept = (view: EditorView, entry: EmojiEntry) => {
    const query = getCompletionQuery(view)
    if (!active || !query || query.from !== active.from || !markdownPreferences.enabled.emoji)
      return close()
    const { state } = view
    const type = state.schema.nodes.emoji
    if (!type) return close()
    const node = type.create(
      { name: entry.name },
      null,
      state.storedMarks ?? state.selection.$from.marks(),
    )
    const tr = closeHistory(state.tr).replaceWith(query.from, query.to, node)
    close()
    view.dispatch(
      tr.setSelection(TextSelection.create(tr.doc, query.from + node.nodeSize)).scrollIntoView(),
    )
    view.focus()
  }

  return new Plugin({
    view(view) {
      const ownerDocument = view.dom.ownerDocument
      const ownerWindow = ownerDocument.defaultView
      popup = createEmojiCompletionPopup({
        ownerDocument,
        onSelect: (entry) => accept(view, entry),
      })
      const stop = watch(
        () => [markdownPreferences.enabled.emoji, markdownPreferences.emojiCompletion],
        close,
        { flush: 'sync' },
      )
      ownerDocument.addEventListener('scroll', close, true)
      ownerWindow?.addEventListener('resize', close)
      return {
        update(nextView, previous) {
          const changed = !previous.doc.eq(nextView.state.doc)
          if (!changed && !previous.selection.eq(nextView.state.selection)) return close()
          if (changed || active)
            refresh(nextView, changed && markdownPreferences.emojiCompletion === 'auto')
        },
        destroy() {
          stop()
          ownerDocument.removeEventListener('scroll', close, true)
          ownerWindow?.removeEventListener('resize', close)
          popup?.destroy()
          popup = null
        },
      }
    },
    props: {
      handleDOMEvents: {
        keydown(view, event) {
          if (event.isComposing || view.composing || event.keyCode === 229) return false
          if (event.ctrlKey || event.metaKey || event.altKey) return false
          if (event.key === 'Escape') {
            const wasOpen = active !== null
            if (active) close()
            else if (markdownPreferences.enabled.emoji) refresh(view, true)
            if (!wasOpen && !active) return false
          } else if (active && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
            selected =
              (selected + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
            render(view)
          } else if (active && !event.shiftKey && ['Enter', 'Tab'].includes(event.key)) {
            accept(view, items[selected])
          } else return false
          event.preventDefault()
          event.stopPropagation()
          return true
        },
        blur() {
          close()
          return false
        },
        compositionstart() {
          close()
          return false
        },
      },
    },
  })
})
