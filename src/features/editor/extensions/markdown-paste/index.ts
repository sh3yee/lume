import { parserCtx, schemaCtx, type Editor } from '@milkdown/kit/core'
import { DOMParser, DOMSerializer } from '@milkdown/kit/prose/model'
import { Plugin } from '@milkdown/kit/prose/state'
import { $prose } from '@milkdown/kit/utils'

const BLOCK_MARKDOWN_PATTERNS = [
  /^ {0,3}#{1,6}\s+\S/m,
  /^ {0,3}(?:[-+*]\s+\S|\d+[.)]\s+\S)/m,
  /^ {0,3}>\s?\S/m,
  /^ {0,3}(?:`{3,}|~{3,})\S*/m,
  /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/m,
  /^ {0,3}\[[^\]]+\]:\s+\S+/m,
  /^ {0,3}\[\^[^\]]+\]:\s+\S+/m,
]

const INLINE_MARKDOWN_PATTERNS = [
  /!?\[[^\]\n]+\]\([^\s)]+(?:\s+["'][^"']*["'])?\)/,
  /(?:^|\s)\*\*\S(?:.*?\S)?\*\*(?:\s|$)/,
  /(?:^|\s)~~\S(?:.*?\S)?~~(?:\s|$)/,
  /(?:^|\s)`[^`\n]+`(?:\s|$)/,
]

function hasMarkdownTable(source: string) {
  const lines = source.split('\n')
  return lines.some((line, index) => {
    if (!line.includes('|')) return false
    const delimiter = lines[index + 1]?.trim() ?? ''
    return /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(delimiter)
  })
}

function isMarkdownSource(source: string) {
  const value = source.trim()
  if (!value) return false
  return BLOCK_MARKDOWN_PATTERNS.some((pattern) => pattern.test(value))
    || INLINE_MARKDOWN_PATTERNS.some((pattern) => pattern.test(value))
    || hasMarkdownTable(value)
}

const markdownPastePlugin = $prose((ctx) => {
  let pasteAsPlainText = false
  let resetPlainTextTimer: number | undefined

  return new Plugin({
    props: {
      handleKeyDown(_view, event) {
        if (event.key.toLowerCase() !== 'v' || !event.shiftKey || (!event.ctrlKey && !event.metaKey)) {
          return false
        }

        pasteAsPlainText = true
        window.clearTimeout(resetPlainTextTimer)
        resetPlainTextTimer = window.setTimeout(() => {
          pasteAsPlainText = false
        }, 1000)
        return false
      },
      handlePaste(view, event) {
        if (pasteAsPlainText) {
          pasteAsPlainText = false
          window.clearTimeout(resetPlainTextTimer)
          const source = event.clipboardData?.getData('text/plain') ?? ''
          if (!source) return false

          event.preventDefault()
          const { from, to } = view.state.selection
          view.dispatch(view.state.tr.insertText(source, from, to).scrollIntoView())
          return true
        }

        const clipboard = event.clipboardData
        if (!clipboard || clipboard.files.length > 0) return false

        const source = clipboard.getData('text/plain').replace(/\r\n?/g, '\n')
        if (!isMarkdownSource(source) || view.state.selection.$from.parent.type.spec.code) return false

        const doc = ctx.get(parserCtx)(source)
        const schema = ctx.get(schemaCtx)
        const fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content)
        const slice = DOMParser.fromSchema(schema).parseSlice(fragment)

        event.preventDefault()
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
        return true
      },
    },
  })
})

/** 将剪贴板中的明确 Markdown 结构解析为 WYSIWYG 节点。 */
export function useMarkdownPasteWysiwygExtension(editor: Editor) {
  return editor.use(markdownPastePlugin)
}