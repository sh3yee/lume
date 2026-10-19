import { editorViewCtx, type Editor } from '@milkdown/kit/core'
import { toggleMark } from '@milkdown/kit/prose/commands'
import { undo, redo } from '@milkdown/kit/prose/history'
import {
  AllSelection,
  NodeSelection,
  type Command,
  type EditorState,
} from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { ImageAlign } from '@/utils/imageHtml'
import {
  convertBlockquote,
  convertHeading,
  convertList,
  convertParagraph,
  indentList,
  insertBlock,
  outdentList,
  toggleTask,
} from './blockCommands'
import { pasteClipboard } from './clipboard'
import { tableCommands } from './tableCommands'
import { resolveSelectionContext } from './selectionContext'
import { insertHorizontalRule } from '../extensions/base/horizontalRule'
import { insertDocumentBlock } from '../extensions/blockInput'

const toggleSelectedMark =
  (name: string): Command =>
  (state, dispatch) => {
    const context = resolveSelectionContext(state)
    const type = state.schema.marks[name]
    if (!type) return false
    if (state.selection.empty) {
      if (
        context.target !== 'block' ||
        state.selection.$from.parent.type.spec.code ||
        context.marks?.inlineCode === 'on'
      )
        return false
      return name !== 'inlineCode' && toggleMark(type)(state, dispatch)
    }
    if (name === 'inlineCode') {
      if (!['text', 'inlineCode'].includes(context.target)) return false
      if (dispatch) {
        const { from, to } = state.selection
        const tr = state.tr
        if (context.marks?.inlineCode === 'on') tr.removeMark(from, to, type)
        else tr.removeMark(from, to).addMark(from, to, type.create())
        dispatch(tr.scrollIntoView())
      }
      return true
    }
    if (context.target !== 'text') return false
    return toggleMark(type, null, { removeWhenPresent: false, includeWhitespace: true })(
      state,
      dispatch,
    )
  }

export const getEditorCommand = (_state: EditorState, name: string): Command | undefined => {
  const commands: Record<string, Command> = {
    paragraph: convertParagraph,
    blockquote: convertBlockquote,
    bulletList: convertList(false),
    orderedList: convertList(true),
    indentList,
    outdentList,
    toggleTask,
    bold: toggleSelectedMark('strong'),
    italic: toggleSelectedMark('emphasis'),
    strike: toggleSelectedMark('strike_through'),
    inlineCode: toggleSelectedMark('inlineCode'),
    clearFormatting: (current, dispatch) => {
      if (
        current.selection.empty ||
        !['text', 'inlineCode'].includes(resolveSelectionContext(current).target)
      )
        return false
      const { from, to } = current.selection
      dispatch?.(current.tr.removeMark(from, to).scrollIntoView())
      return true
    },
    insertFrontMatter: insertDocumentBlock('front_matter'),
    insertToc: insertDocumentBlock('toc'),
    insertNote: insertDocumentBlock('callout', 'NOTE'),
    insertTip: insertDocumentBlock('callout', 'TIP'),
    insertImportant: insertDocumentBlock('callout', 'IMPORTANT'),
    insertWarning: insertDocumentBlock('callout', 'WARNING'),
    insertCaution: insertDocumentBlock('callout', 'CAUTION'),
    undo,
    redo,
    ...tableCommands,
  }
  const heading = name.match(/^heading([1-6])$/)
  const command = heading ? convertHeading(Number(heading[1])) : commands[name]
  if (!command) return undefined
  return (current, dispatch, view) => {
    const context = resolveSelectionContext(current)
    if (name in tableCommands && !context.containers.includes('table')) return false
    if (
      (heading ||
        [
          'paragraph',
          'blockquote',
          'bulletList',
          'orderedList',
          'indentList',
          'outdentList',
          'toggleTask',
        ].includes(name)) &&
      !['text', 'block'].includes(context.target)
    )
      return false
    return command(current, dispatch, view)
  }
}

export function createEditorCommands(options: {
  getEditor: () => Editor | null
  onBeforeCommand: () => boolean | void
  onCopy: () => void
  onError: (message: string) => void
  isActive: () => boolean
  onImageAlign: (view: EditorView, align: ImageAlign) => void
}) {
  const runWithView = (action: (view: EditorView) => void) => {
    if (options.onBeforeCommand() === false) return
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      view.focus()
      action(view)
    })
  }

  const execute = (name: string) =>
    runWithView((view) => {
      getEditorCommand(view.state, name)?.(view.state, view.dispatch, view)
    })

  const runNativeEditCommand = (command: 'copy' | 'cut') =>
    runWithView((view) => {
      if (view.state.selection.empty) return
      document.execCommand(command)
      if (command === 'copy') options.onCopy()
    })

  const insertNode = (type: string) =>
    runWithView((view) => {
      const node = view.state.schema.nodes[type]?.createAndFill()
      if (node) view.dispatch(insertBlock(view.state, node))
    })

  return {
    execute,
    clearInlineFormatting: () => execute('clearFormatting'),
    convertCurrentBlockToParagraph: () => execute('paragraph'),
    copy: () => runNativeEditCommand('copy'),
    cut: () => runNativeEditCommand('cut'),
    insertBlockquote: () => execute('blockquote'),
    insertHeading: (level: number) => execute(`heading${level}`),
    insertList: (ordered: boolean) => execute(ordered ? 'orderedList' : 'bulletList'),
    insertCodeBlock: () => insertNode('code_block'),
    insertHorizontalRule: () =>
      runWithView((view) => {
        insertHorizontalRule(view.state, view.dispatch)
      }),
    insertTable: () =>
      runWithView((view) => {
        const { schema } = view.state
        const makeCells = (type: string) =>
          Array.from({ length: 3 }, () => schema.nodes[type].createAndFill()!)
        const rows = [
          schema.nodes.table_header_row.create(null, makeCells('table_header')),
          ...Array.from({ length: 2 }, () =>
            schema.nodes.table_row.create(null, makeCells('table_cell')),
          ),
        ]
        view.dispatch(insertBlock(view.state, schema.nodes.table.create(null, rows)))
      }),
    paste: () =>
      runWithView((view) => void pasteClipboard(view, options.isActive, options.onError)),
    redo: () => execute('redo'),
    undo: () => execute('undo'),
    selectAll: () =>
      runWithView((view) => {
        view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
      }),
    setImageAlign: (align: ImageAlign) =>
      runWithView((view) => {
        const selection = view.state.selection
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return
        view.dispatch(
          view.state.tr.setNodeAttribute(selection.from, 'align', align).scrollIntoView(),
        )
        options.onImageAlign(view, align)
      }),
    toggleBold: () => execute('bold'),
    toggleInlineCode: () => execute('inlineCode'),
    toggleItalic: () => execute('italic'),
  }
}
