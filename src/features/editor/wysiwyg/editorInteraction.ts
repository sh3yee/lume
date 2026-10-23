import { parserCtx } from '@milkdown/kit/core'
import { Plugin, NodeSelection, Selection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { getEditorCommand } from './editorCommands'
import { captureSelectionContext, findLinkAt, type EditorContext } from './selectionContext'
import { parseLinkSource } from '../extensions/base/linkEditing'
import { handleHorizontalRuleKeyDown } from '../extensions/base/horizontalRule'
import { handleDocumentBlockKeyDown } from '../extensions/blockInput'
import { markdownPreferences } from '@/app/preferences/useMarkdownPreference'
import { bindEditorSurface } from './editorSurface'

const getLinkElement = (view: EditorView, target: EventTarget | null) => {
  const element = target instanceof Element ? target.closest('a, [data-link-source]') : null
  if (element?.getAttribute('data-auto-link') === 'true' && !markdownPreferences.enabled.autoLink)
    return null
  return element && view.dom.contains(element) ? element : null
}

const shouldUseNativeTextClick = (view: EditorView, event: MouseEvent) => {
  if (
    event.button !== 0 ||
    event.detail !== 1 ||
    event.ctrlKey ||
    event.metaKey ||
    !(view.state.selection instanceof TextSelection) ||
    view.state.selection.empty
  )
    return false
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!hit) return false
  const parent = view.state.doc.resolve(hit.pos).parent
  if (!parent.isTextblock || parent.type.spec.code) return false
  let plainText = true
  parent.forEach((node) => {
    if (!node.isText || node.marks.length) plainText = false
  })
  return plainText
}

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
  root?: HTMLElement
  onViewUpdate?: (view: EditorView) => void
  onAction?: (id: string, target: EditorContext) => void
}) =>
  $prose(
    (ctx) =>
      new Plugin({
        view(view) {
          const unbindSurface = options.root ? bindEditorSurface(view, options.root) : undefined
          const ownerDocument = view.dom.ownerDocument
          const ownerWindow = ownerDocument.defaultView
          const handleLinkModifier = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>) => {
            view.dom.classList.toggle('lume-link-navigation', event.ctrlKey || event.metaKey)
          }
          const clearLinkModifier = () => view.dom.classList.remove('lume-link-navigation')
          ownerDocument.addEventListener('keydown', handleLinkModifier, true)
          ownerDocument.addEventListener('keyup', handleLinkModifier, true)
          view.dom.addEventListener('pointermove', handleLinkModifier)
          ownerWindow?.addEventListener('blur', clearLinkModifier)
          options.onViewUpdate?.(view)
          return {
            update: (nextView) => options.onViewUpdate?.(nextView),
            destroy() {
              unbindSurface?.()
              ownerDocument.removeEventListener('keydown', handleLinkModifier, true)
              ownerDocument.removeEventListener('keyup', handleLinkModifier, true)
              view.dom.removeEventListener('pointermove', handleLinkModifier)
              ownerWindow?.removeEventListener('blur', clearLinkModifier)
              clearLinkModifier()
            },
          }
        },
        props: {
          handleDOMEvents: {
            keydown(view, event) {
              if (handleDocumentBlockKeyDown(view, event)) return true
              if (handleHorizontalRuleKeyDown(view, event)) return true
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
              const { selection } = view.state
              if (
                view.editable &&
                selection instanceof NodeSelection &&
                selection.node.type.name.startsWith('math_') &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                !event.shiftKey
              ) {
                const block = selection.node.type.name === 'math_block'
                const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1
                const arrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                  event.key,
                )
                if (arrow || (block && event.key === 'Enter')) {
                  const tr = view.state.tr
                  const position = direction < 0 ? selection.from : selection.to
                  const $position = tr.doc.resolve(position)
                  const next = Selection.findFrom($position, direction, true)
                  if (block && (event.key === 'Enter' || !next)) {
                    const paragraph = view.state.schema.nodes.paragraph.createAndFill()
                    const index = $position.index()
                    if (
                      !paragraph ||
                      !$position.parent.canReplaceWith(index, index, paragraph.type)
                    )
                      return false
                    tr.insert(position, paragraph)
                    tr.setSelection(TextSelection.create(tr.doc, position + 1))
                  } else if (next) {
                    tr.setSelection(next)
                  } else return false
                  event.preventDefault()
                  view.dispatch(tr.scrollIntoView())
                  return true
                }
              }
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
              return false
            },
            mousedown(view, event) {
              // 已选中文字后的新单击交给浏览器，避免邻近点击被误判成三击而重选整段。
              if (shouldUseNativeTextClick(view, event)) return true
              if (
                event.button !== 0 ||
                (!event.ctrlKey && !event.metaKey) ||
                !getLinkElement(view, event.target)
              )
                return false
              // 在鼠标按下时拦截，避免 ProseMirror 在抬起时将 Ctrl+点击解释为整段选择。
              event.preventDefault()
              return true
            },
            click(view, event) {
              const anchor = getLinkElement(view, event.target)
              if (!anchor) return false
              if (event.ctrlKey || event.metaKey) {
                event.preventDefault()
                const pos = view.posAtDOM(anchor, 0)
                const context = captureSelectionContext(view)
                const $pos = view.state.doc.resolve(pos)
                if ($pos.parent.type.name === 'link_source') {
                  const paragraph = parseLinkSource(
                    $pos.parent.textContent,
                    ctx.get(parserCtx),
                    $pos.parent.attrs.definitions,
                  )
                  const mark = paragraph?.firstChild?.marks.find(
                    (item) => item.type.name === 'link',
                  )
                  context.link = mark ? { from: $pos.before(), to: $pos.after(), mark } : null
                } else context.link = findLinkAt(view.state, pos)
                if (context.link) options.onAction?.('openLink', context)
                return true
              }
              if (anchor.matches('a')) event.preventDefault()
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
            if (!direct || event.button !== 0 || node.type.name !== 'math_inline') return false
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)))
            options.onAction?.('editMath', captureSelectionContext(view))
            return true
          },
        },
      }),
  )
