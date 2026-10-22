import { Fragment, type Node } from '@milkdown/kit/prose/model'
import { closeHistory } from '@milkdown/kit/prose/history'
import { Plugin, TextSelection, type Command } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'

const getHeadingSource = (node: Node) => {
  if (node.type.name !== 'paragraph') return null
  const first = node.firstChild
  if (!first?.isText || first.marks.length) return null
  const match = /^( {0,3})(#{1,6})[ \t]+/.exec(first.text!)
  return match
    ? { level: match[2].length, indent: match[1].length, prefixLength: match[0].length }
    : null
}

export const confirmHeading: Command = (state, dispatch) => {
  const { selection, schema } = state
  if (!(selection instanceof TextSelection) || !selection.empty) return false
  const { $from } = selection
  if ($from.parentOffset !== $from.parent.content.size) return false
  const source = getHeadingSource($from.parent)
  if (!source) return false
  for (let depth = 1; depth < $from.depth; depth++) {
    if (['table', 'table_cell', 'table_header'].includes($from.node(depth).type.name)) return false
  }
  const heading = schema.nodes.heading.create(
    { level: source.level },
    $from.parent.content.cut(source.prefixLength),
  )
  const replacement = Fragment.fromArray([heading, schema.nodes.paragraph.create()])
  const index = $from.index(-1)
  if (!$from.node(-1).canReplace(index, index + 1, replacement)) return false
  if (dispatch) {
    const pos = $from.before()
    // 回车转换单独进入历史，撤销时恢复包含 # 标记的整行源码。
    const tr = closeHistory(state.tr).replaceWith(pos, $from.after(), replacement)
    dispatch(
      tr.setSelection(TextSelection.create(tr.doc, pos + heading.nodeSize + 1)).scrollIntoView(),
    )
  }
  return true
}

export const headingInputPlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          const decorations: Decoration[] = []
          state.doc.descendants((node, pos, parent, index) => {
            if (['table', 'code_block'].includes(node.type.name)) return false
            const source = getHeadingSource(node)
            if (!source || !parent?.canReplaceWith(index, index + 1, state.schema.nodes.heading))
              return
            const from = pos + 1 + source.indent
            decorations.push(
              Decoration.inline(from, from + source.level, { class: 'lume-heading-source-marker' }),
            )
          })
          return DecorationSet.create(state.doc, decorations)
        },
        handleDOMEvents: {
          keydown(view, event) {
            if (
              event.key !== 'Enter' ||
              !view.editable ||
              view.composing ||
              event.isComposing ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              event.shiftKey ||
              !confirmHeading(view.state, view.dispatch)
            )
              return false
            event.preventDefault()
            return true
          },
        },
      },
    }),
)
