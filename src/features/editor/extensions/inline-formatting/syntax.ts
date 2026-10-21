import { $remark } from '@milkdown/kit/utils'
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown'
import type { Handle, Unsafe } from 'mdast-util-to-markdown'
import type { Parent, PhrasingContent, Root } from 'mdast'
import { resolveAll } from 'micromark-util-resolve-all'
import type {
  Construct,
  Event,
  Extension,
  Resolver,
  State,
  Token,
  Tokenizer,
} from 'micromark-util-types'
import type { Plugin as RemarkPlugin } from 'unified'
import {
  acceptsInlineContent,
  inlineFormats,
  isEscaped,
  type InlineFormat,
  type InlineFormatName,
} from './formats'

interface InlineFormatting extends Parent {
  type: InlineFormatName
  children: PhrasingContent[]
}

declare module 'mdast' {
  interface PhrasingContentMap {
    highlight: InlineFormatting & { type: 'highlight' }
    subscript: InlineFormatting & { type: 'subscript' }
    superscript: InlineFormatting & { type: 'superscript' }
  }
  interface RootContentMap {
    highlight: PhrasingContentMap['highlight']
    subscript: PhrasingContentMap['subscript']
    superscript: PhrasingContentMap['superscript']
  }
}

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    lumeInlineDelimiter: 'lumeInlineDelimiter'
    lumeInlineSequence: 'lumeInlineSequence'
    lumeInlineText: 'lumeInlineText'
    highlight: 'highlight'
    subscript: 'subscript'
    superscript: 'superscript'
  }
}

declare module 'mdast-util-to-markdown' {
  interface ConstructNameMap {
    lumeInlineFormatting: 'lumeInlineFormatting'
    lumeScriptFormatting: 'lumeScriptFormatting'
  }
}

const createConstruct = (format: InlineFormat): Construct => {
  const resolve: Resolver = (events, context) => {
    for (let index = 0; index < events.length; index += 1) {
      const closing = events[index]
      if (
        closing[0] !== 'enter' ||
        closing[1].type !== 'lumeInlineDelimiter' ||
        !closing[1]._close ||
        context.sliceSerialize(closing[1]) !== format.marker
      )
        continue
      for (let open = index - 1; open >= 0; open -= 1) {
        const opening = events[open]
        if (
          opening[0] !== 'exit' ||
          opening[1].type !== 'lumeInlineDelimiter' ||
          !opening[1]._open ||
          context.sliceSerialize(opening[1]) !== format.marker
        )
          continue
        const content: Token = {
          type: 'lumeInlineText',
          start: { ...opening[1].end },
          end: { ...closing[1].start },
        }
        if (!acceptsInlineContent(format, context.sliceSerialize(content))) continue
        opening[1].type = closing[1].type = 'lumeInlineSequence'
        const wrapper: Token = {
          type: format.name,
          start: { ...opening[1].start },
          end: { ...closing[1].end },
        }
        const inside = context.parser.constructs.insideSpan.null ?? []
        const replacement: Event[] = [
          ['enter', wrapper, context],
          ['enter', opening[1], context],
          ['exit', opening[1], context],
          ['enter', content, context],
          ...resolveAll(inside, events.slice(open + 1, index), context),
          ['exit', content, context],
          ['enter', closing[1], context],
          ['exit', closing[1], context],
          ['exit', wrapper, context],
        ]
        events.splice(open - 1, index - open + 3, ...replacement)
        index = open + replacement.length - 2
        break
      }
    }
    for (const event of events) {
      if (
        event[1].type === 'lumeInlineDelimiter' &&
        context.sliceSerialize(event[1]) === format.marker
      )
        event[1].type = 'data'
    }
    return events
  }

  const tokenize: Tokenizer = function (effects, ok, nok) {
    const previous = this.previous
    let size = 0
    const start: State = (code) => {
      if (previous === format.code && this.events.at(-1)?.[1].type !== 'characterEscape')
        return nok(code)
      effects.enter('lumeInlineDelimiter')
      return sequence(code)
    }
    const sequence: State = (code) => {
      if (code === format.code) {
        if (size === format.marker.length) return nok(code)
        effects.consume(code)
        size += 1
        return sequence
      }
      if (size !== format.marker.length) return nok(code)
      const token = effects.exit('lumeInlineDelimiter')
      token._open = code !== null && code > 0 && !/\s/.test(String.fromCharCode(code))
      token._close = previous !== null && previous > 0 && !/\s/.test(String.fromCharCode(previous))
      return ok(code)
    }
    return start
  }
  return { name: `lume${format.name}`, tokenize, resolveAll: resolve }
}

const formattingSyntax: Extension = { text: {}, insideSpan: { null: [] } }
const formattingFromMarkdown: FromMarkdownExtension = { enter: {}, exit: {} }
const handlers: Record<string, Handle> = {}
const unescapeScriptSpaces = (node: PhrasingContent) => {
  if (node.type === 'text') node.value = node.value.replace(/\\([ \t])/g, '$1')
  else if (node.type !== 'subscript' && node.type !== 'superscript' && 'children' in node)
    node.children.forEach(unescapeScriptSpaces)
}

for (const format of inlineFormats) {
  const construct = createConstruct(format)
  formattingSyntax.text![format.code] = construct
  ;(formattingSyntax.insideSpan!.null as Construct[]).push(construct)
  formattingFromMarkdown.enter![format.name] = function (token) {
    this.enter({ type: format.name, children: [] }, token)
  }
  formattingFromMarkdown.exit![format.name] = function (token) {
    const node = this.stack.at(-1)
    if (node && this.stack.slice(0, -1).some((parent) => parent.type === 'image')) {
      const literal = node as { type: string; value?: string; children?: unknown[] }
      literal.type = 'text'
      literal.value = this.sliceSerialize(token)
      delete literal.children
      this.exit(token)
      return
    }
    // CommonMark 不把反斜杠加空格识别为转义，补足 Typora 上下标的空格语法。
    if (format.name !== 'highlight' && node && 'children' in node) {
      node.children.forEach((child) => unescapeScriptSpaces(child as PhrasingContent))
    }
    this.exit(token)
  }
  const handler: Handle & { peek?: () => string } = (node, _parent, state, info) => {
    const tracker = state.createTracker(info)
    const exit = state.enter(
      format.name === 'highlight' ? 'lumeInlineFormatting' : 'lumeScriptFormatting',
    )
    tracker.move(format.marker)
    let content = state.containerPhrasing(node, {
      ...tracker.current(),
      before: format.marker,
      after: format.marker,
    })
    if (format.name !== 'highlight') {
      content = content.replace(/[ \t]/g, (space, offset: number) =>
        isEscaped(content, offset) ? space : `\\${space}`,
      )
    }
    exit()
    return `${format.marker}${content}${format.marker}`
  }
  handler.peek = () => format.marker[0]
  handlers[format.name] = handler
}

export const remarkInlineFormatting: RemarkPlugin<[], Root> = function () {
  const data = this.data()
  ;(data.micromarkExtensions ??= []).push(formattingSyntax)
  ;(data.fromMarkdownExtensions ??= []).push(formattingFromMarkdown)
  ;(data.toMarkdownExtensions ??= []).push({
    unsafe: [
      ...inlineFormats.map<Unsafe>(({ marker }) => ({
        character: marker[0],
        inConstruct: 'phrasing' as const,
        notInConstruct: [
          'autolink',
          'destinationLiteral',
          'destinationRaw',
          'reference',
          'titleQuote',
          'titleApostrophe',
        ],
      })),
      { character: '\\', after: '[ \\t]', inConstruct: 'lumeScriptFormatting' },
    ],
    handlers,
  })
}

export const inlineFormattingRemark = $remark('lumeInlineFormatting', () => remarkInlineFormatting)
