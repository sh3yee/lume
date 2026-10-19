import { Plugin, NodeSelection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { getEditorCommand } from './editorCommands'
import { captureSelectionContext, findLinkAt, type EditorContext } from './selectionContext'

export const getShortcutCommand = (
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'key'> & {
    getModifierState?: (key: string) => boolean
  },
) => {
  if (event.getModifierState?.('AltGraph')) return null
  if (!event.ctrlKey && !event.metaKey) return null
  const key = event.key.toLowerCase()
  if (event.altKey) {
    if (/^[1-6]$/.test(key)) return `heading${key}`
    return (
      (
        {
          '0': 'paragraph',
          '7': 'orderedList',
          '8': 'bulletList',
          x: 'strike',
          c: 'insertCode',
        } as Record<string, string>
      )[key] ?? null
    )
  }
  if (event.shiftKey) return key === 'b' ? 'blockquote' : null
  return ({ b: 'bold', i: 'italic', e: 'inlineCode' } as Record<string, string>)[key] ?? null
}

export const createEditorInteractionPlugin = (options: {
  onViewUpdate?: (view: EditorView) => void
  onAction?: (id: string, target: EditorContext) => void
}) =>
  $prose(
    () =>
      new Plugin({
        view(view) {
          options.onViewUpdate?.(view)
          return { update: (nextView) => options.onViewUpdate?.(nextView) }
        },
        props: {
          handleDOMEvents: {
            keydown(view, event) {
              if (event.isComposing) return false
              const shortcut = getShortcutCommand(event)
              if (shortcut) {
                event.preventDefault()
                if (view.editable) {
                  if (options.onAction) options.onAction(shortcut, captureSelectionContext(view))
                  else getEditorCommand(view.state, shortcut)?.(view.state, view.dispatch, view)
                }
                return true
              }
              const context = captureSelectionContext(view)
              if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                if (context.target === 'code' || context.containers.includes('table')) return false
                if (!view.editable) return false
                event.preventDefault()
                if (
                  context.containers.some((name) =>
                    ['list_item', 'bullet_list', 'ordered_list'].includes(name),
                  )
                ) {
                  const command = event.shiftKey ? 'outdentList' : 'indentList'
                  if (options.onAction) options.onAction(command, context)
                  else getEditorCommand(view.state, command)?.(view.state, view.dispatch, view)
                  return true
                }
                if (!event.shiftKey && view.state.selection.$from.parent.inlineContent) {
                  const indent = '    '
                  const { from, to } = view.state.selection
                  const tr = view.state.tr.replaceWith(from, to, view.state.schema.text(indent))
                  view.dispatch(
                    tr
                      .setSelection(TextSelection.create(tr.doc, from + indent.length))
                      .scrollIntoView(),
                  )
                }
                return true
              }
              if (event.key === 'Enter' && context.target === 'math' && context.kind === 'node') {
                event.preventDefault()
                options.onAction?.('editMath', context)
                return true
              }
              return false
            },
            click(view, event) {
              const anchor = event.target instanceof Element ? event.target.closest('a') : null
              if (!anchor || !view.dom.contains(anchor)) return false
              event.preventDefault()
              if (event.ctrlKey || event.metaKey) {
                const pos = view.posAtDOM(anchor, 0)
                const context = captureSelectionContext(view)
                context.link = findLinkAt(view.state, pos)
                if (context.link) options.onAction?.('openLink', context)
                return true
              }
              return false
            },
            focus(view) {
              options.onViewUpdate?.(view)
              return false
            },
          },
          handleClickOn(view, _pos, node, nodePos, event, direct) {
            if (
              !direct ||
              event.button !== 0 ||
              event.shiftKey ||
              !node.isAtom ||
              node.isText ||
              node.type.name === 'hardbreak'
            )
              return false
            if (!NodeSelection.isSelectable(node)) return false
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)))
            view.focus()
            return true
          },
          handleDoubleClickOn(view, _pos, node, nodePos, event, direct) {
            if (
              !direct ||
              event.button !== 0 ||
              !['math_inline', 'math_block', 'footnote_reference'].includes(node.type.name)
            )
              return false
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)))
            options.onAction?.(
              node.type.name === 'footnote_reference' ? 'gotoFootnote' : 'editMath',
              captureSelectionContext(view),
            )
            return true
          },
        },
      }),
  )
