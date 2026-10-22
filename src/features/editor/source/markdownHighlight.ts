import { markdownLanguage } from '@codemirror/lang-markdown'

export interface SourceToken {
  text: string
  syntax: boolean
}

const syntaxNodes = new Set([
  'HorizontalRule',
  'HardBreak',
  'Escape',
  'Entity',
  'CodeInfo',
  'LinkLabel',
  'LinkTitle',
  'URL',
  'Autolink',
  'HTMLTag',
  'HTMLBlock',
  'Comment',
  'CommentBlock',
  'ProcessingInstruction',
  'ProcessingInstructionBlock',
  'TaskMarker',
  'Emoji',
])

export const highlightMarkdownSource = (source: string): SourceToken[][] => {
  const lines: SourceToken[][] = [[]]
  let position = 0

  const append = (text: string, syntax: boolean) => {
    text.split('\n').forEach((part, index) => {
      if (index) lines.push([])
      if (part) lines[lines.length - 1].push({ text: part, syntax })
    })
  }

  markdownLanguage.parser.parse(source).iterate({
    enter: ({ name, from, to }) => {
      if (!name.endsWith('Mark') && !name.endsWith('Delimiter') && !syntaxNodes.has(name)) return
      append(source.slice(position, from), false)
      append(source.slice(from, to), true)
      position = to
      return false
    },
  })
  append(source.slice(position), false)
  return lines
}
