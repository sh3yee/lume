import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { html } from '@codemirror/lang-html'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import { redo, undo } from '@milkdown/kit/prose/history'
import type { EditorView as ProseView } from '@milkdown/kit/prose/view'

export const createHtmlSourceEditor = (
  parent: HTMLElement,
  value: string,
  view: ProseView,
  onChange: (value: string) => void,
  onExit: (direction: number) => void,
) => {
  let synchronizing = false
  let destroyed = false
  let emptyTimer: ReturnType<typeof setTimeout> | undefined
  const notifyChange = (cm: EditorView) => {
    clearTimeout(emptyTimer)
    const value = cm.state.doc.toString()
    // 输入法替换选区时的临时空值，留到组合结束后再确认。
    if (!value.trim() && cm.compositionStarted) return
    onChange(value)
  }
  const highlighting = new Compartment()
  const highlight = () =>
    syntaxHighlighting(
      parent.ownerDocument.documentElement.dataset.theme === 'dark'
        ? oneDarkHighlightStyle
        : defaultHighlightStyle,
    )
  const editor = new EditorView({
    parent,
    state: EditorState.create({
      doc: value,
      extensions: [
        html(),
        highlighting.of(highlight()),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'HTML 源码', spellcheck: 'false' }),
        EditorState.transactionFilter.of((tr) =>
          tr.docChanged && !synchronizing && !view.editable ? [] : tr,
        ),
        EditorView.domEventHandlers({
          compositionend: (_event, cm) => {
            clearTimeout(emptyTimer)
            emptyTimer = setTimeout(() => {
              if (destroyed || cm.compositionStarted) return
              const value = cm.state.doc.toString()
              if (!value.trim()) onChange(value)
            }, 0)
            return false
          },
        }),
        keymap.of([
          {
            key: 'Escape',
            run: () => {
              onExit(1)
              return true
            },
          },
          {
            key: 'Mod-Enter',
            run: () => {
              onExit(1)
              return true
            },
          },
          { key: 'Mod-z', run: () => undo(view.state, view.dispatch) },
          { key: 'Mod-Shift-z', run: () => redo(view.state, view.dispatch) },
          { key: 'Mod-y', run: () => redo(view.state, view.dispatch) },
          {
            key: 'ArrowUp',
            run: (cm) => {
              if (!cm.state.selection.main.empty || cm.state.selection.main.head !== 0) return false
              onExit(-1)
              return true
            },
          },
          {
            key: 'ArrowDown',
            run: (cm) => {
              if (
                !cm.state.selection.main.empty ||
                cm.state.selection.main.head !== cm.state.doc.length
              )
                return false
              onExit(1)
              return true
            },
          },
          indentWithTab,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !synchronizing) notifyChange(update.view)
        }),
      ],
    }),
  })
  const themeObserver = new MutationObserver(() => {
    editor.dispatch({ effects: highlighting.reconfigure(highlight()) })
  })
  themeObserver.observe(parent.ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  return {
    editor,
    update(next: string) {
      const previous = editor.state.doc.toString()
      if (previous === next) return
      let from = 0
      while (from < previous.length && from < next.length && previous[from] === next[from]) from++
      let oldEnd = previous.length,
        newEnd = next.length
      while (oldEnd > from && newEnd > from && previous[oldEnd - 1] === next[newEnd - 1]) {
        oldEnd--
        newEnd--
      }
      synchronizing = true
      try {
        editor.dispatch({ changes: { from, to: oldEnd, insert: next.slice(from, newEnd) } })
      } finally {
        synchronizing = false
      }
    },
    destroy() {
      destroyed = true
      clearTimeout(emptyTimer)
      themeObserver.disconnect()
      editor.destroy()
    },
  }
}
