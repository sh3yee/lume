import type { EditorState } from '@milkdown/kit/prose/state'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { $prose } from '@milkdown/kit/utils'

function createParagraphAfterCodeBlock(state: EditorState) {
  const { $from } = state.selection
  const codeBlock = $from.parent
  if (codeBlock.type.name !== 'code_block' || !$from.parentOffset) return null
  if ($from.parentOffset !== codeBlock.content.size || !codeBlock.textContent.endsWith('\n')) return null

  const paragraph = state.schema.nodes.paragraph.create()
  const insertPos = $from.after()
  const tr = state.tr.insert(insertPos, paragraph)
  return tr
    .setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)))
    .scrollIntoView()
}

function convertEmptyCodeBlockToParagraph(state: EditorState) {
  const { $from, empty } = state.selection
  const codeBlock = $from.parent
  if (!empty || codeBlock.type.name !== 'code_block' || codeBlock.content.size !== 0) return null

  const blockPos = $from.before()
  const tr = state.tr.setNodeMarkup(blockPos, state.schema.nodes.paragraph)
  return tr
    .setSelection(TextSelection.near(tr.doc.resolve(blockPos + 1)))
    .scrollIntoView()
}

export const codeBlockInteractionPlugin = $prose(() => new Plugin({
  appendTransaction(_transactions, _oldState, newState) {
    if (newState.doc.lastChild?.type.name !== 'code_block') return null

    return newState.tr.insert(newState.doc.content.size, newState.schema.nodes.paragraph.create())
  },
  props: {
    handleKeyDown(view, event) {
      if (
        event.key === 'Backspace'
        && !event.isComposing
        && !event.shiftKey
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
      ) {
        const tr = convertEmptyCodeBlockToParagraph(view.state)
        if (!tr) return false

        event.preventDefault()
        view.dispatch(tr)
        return true
      }

      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false

      const tr = createParagraphAfterCodeBlock(view.state)
      if (!tr) return false

      event.preventDefault()
      view.dispatch(tr)
      return true
    },
  },
}))