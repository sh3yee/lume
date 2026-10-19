import { Plugin } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { goToFootnoteDefinition, goToFootnoteReference } from './commands'
import { getFootnoteDefinitions, normalizeFootnoteLabel } from './references'

export const footnoteInteractionPlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          const definitions = getFootnoteDefinitions(state.doc)
          const referenced = new Set<string>()
          const decorations: Decoration[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'footnote_reference') return
            if (typeof node.attrs.source === 'string') return
            const label = normalizeFootnoteLabel(String(node.attrs.label))
            referenced.add(label)
            const definition = definitions.get(label)?.node
            const description = definition?.textBetween(0, definition.content.size, '\n', ' ')
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                title: description || '脚注尚未填写内容',
                'aria-label': `脚注 ${node.attrs.label}，Ctrl/Cmd + 单击跳转到定义`,
              }),
            )
          })
          for (const [label, { node, pos }] of definitions) {
            const empty =
              node.childCount === 1 &&
              node.firstChild?.type.name === 'paragraph' &&
              node.firstChild.content.size === 0
            if (empty) {
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, { class: 'lume-footnote-empty' }),
              )
            }
            if (empty || !referenced.has(label)) continue
            let end = pos + node.nodeSize - 1
            if (node.lastChild?.type.name === 'paragraph') end -= 1
            decorations.push(
              Decoration.widget(
                end,
                (view) => {
                  const button = document.createElement('button')
                  button.type = 'button'
                  button.className = 'lume-footnote-backref'
                  button.contentEditable = 'false'
                  button.textContent = '↩'
                  button.title = '返回脚注引用'
                  button.setAttribute('aria-label', `返回脚注 ${node.attrs.label} 的引用`)
                  button.addEventListener('mousedown', (event) => event.preventDefault())
                  button.addEventListener('click', (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (goToFootnoteReference(label)(view.state, view.dispatch)) view.focus()
                  })
                  return button
                },
                { key: `footnote-backref-${label}`, side: 1, stopEvent: () => true },
              ),
            )
          }
          return DecorationSet.create(state.doc, decorations)
        },
        handleClickOn(view, _pos, node, _nodePos, event, direct) {
          if (
            !direct ||
            event.button !== 0 ||
            (!event.ctrlKey && !event.metaKey) ||
            node.type.name !== 'footnote_reference'
          )
            return false
          if (!goToFootnoteDefinition(String(node.attrs.label))(view.state, view.dispatch))
            return false
          event.preventDefault()
          view.focus()
          return true
        },
      },
    }),
)
