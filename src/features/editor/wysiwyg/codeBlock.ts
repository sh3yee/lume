import type { EditorState } from '@milkdown/kit/prose/state'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { $prose } from '@milkdown/kit/utils'

function convertFencedParagraphsToCodeBlock(state: EditorState) {
  const { $from, empty } = state.selection
  if (!empty || $from.depth !== 1 || $from.parent.type.name !== 'paragraph') return null
  if ($from.parentOffset !== $from.parent.content.size || !/^```\s*$/.test($from.parent.textContent)) return null

  const closingIndex = $from.index(0)
  let openingIndex = -1
  let language = ''

  for (let index = closingIndex - 1; index >= 0; index -= 1) {
    const node = state.doc.child(index)
    if (node.type.name !== 'paragraph') return null
    const match = node.textContent.match(/^```([^\s`]*)\s*$/)
    if (!match) continue
    openingIndex = index
    language = match[1] ?? ''
    break
  }
  if (openingIndex < 0) return null

  const lines: string[] = []
  let from = 0
  for (let index = 0; index < closingIndex; index += 1) {
    const node = state.doc.child(index)
    if (index < openingIndex) from += node.nodeSize
    else if (index > openingIndex) lines.push(node.textBetween(0, node.content.size, '\n', '\n'))
  }

  const code = lines.join('\n')
  const codeBlockType = state.schema.nodes.code_block
  const codeBlock = codeBlockType.create(
    { language },
    code ? state.schema.text(code) : undefined,
  )
  const to = $from.before() + $from.parent.nodeSize
  const tr = state.tr.replaceWith(from, to, codeBlock)
  const selectionPosition = from + 1 + code.length
  return tr
    .setSelection(TextSelection.near(tr.doc.resolve(selectionPosition)))
    .scrollIntoView()
}

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

      const fencedCodeBlockTransaction = convertFencedParagraphsToCodeBlock(view.state)
      if (fencedCodeBlockTransaction) {
        event.preventDefault()
        view.dispatch(fencedCodeBlockTransaction)
        return true
      }

      const tr = createParagraphAfterCodeBlock(view.state)
      if (!tr) return false

      event.preventDefault()
      view.dispatch(tr)
      return true
    },
  },
}))