import { remarkCtx } from '@milkdown/kit/core'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { Plugin } from '@milkdown/kit/prose/state'
import type { Node } from '@milkdown/kit/prose/model'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { $inputRule, $markSchema, $prose } from '@milkdown/kit/utils'
import type { PhrasingContent } from 'mdast'
import { decodeString } from 'micromark-util-decode-string'
import { watch } from 'vue'
import { markdownPreferences } from '@/app/preferences/useMarkdownPreference'
import { inlineFormats, type InlineFormat } from './formats'
import {
  getDisabledFormats,
  getSourceEscapePositions,
  serializeInlineFormattingClipboard,
} from './clipboard'

const createFormattingSchema = (format: InlineFormat) =>
  $markSchema(format.name, () => ({
    inclusive: false,
    parseDOM: [{ tag: `${format.tag}[data-lume-inline="${format.name}"]`, priority: 60 }],
    toDOM: () => [format.tag, { 'data-lume-inline': format.name }, 0],
    parseMarkdown: {
      match: (node) => node.type === format.name,
      runner: (state, node, type) => {
        state.openMark(type)
        state.next(node.children)
        state.closeMark(type)
      },
    },
    toMarkdown: {
      match: (mark) => mark.type.name === format.name,
      runner: (state, mark) => {
        state.withMark(mark, format.name)
      },
    },
  }))

export const inlineFormattingSchemas = inlineFormats.map(createFormattingSchema)

const getSyntaxText = (parent: Node) => {
  let text = ''
  parent.forEach((node) => {
    text += node.isText ? node.text! : '\ufffc'
  })
  return text
}

const getPositionAt = (parent: Node, offset: number) => {
  let textOffset = 0
  let position = parent.content.size
  parent.forEach((node, pos) => {
    const length = node.isText ? node.nodeSize : 1
    if (offset >= textOffset && offset <= textOffset + length)
      position =
        pos + (node.isText ? offset - textOffset : offset === textOffset ? 0 : node.nodeSize)
    textOffset += length
  })
  return position
}

const findClosingFormat = (
  nodes: PhrasingContent[],
  offset: number,
): { node: PhrasingContent; format: InlineFormat } | undefined => {
  for (const node of nodes) {
    const format = inlineFormats.find(({ name }) => name === node.type)
    if (format && node.position?.end.offset === offset) return { node, format }
    if ('children' in node) {
      const found = findClosingFormat(node.children, offset)
      if (found) return found
    }
  }
}

export const inlineFormattingInputRule = $inputRule(
  (ctx) =>
    new InputRule(
      /[=~^][^\n]*[=~^]$/,
      (state, match, start, end) => {
        const $start = state.doc.resolve(start)
        const $end = state.doc.resolve(end)
        if (!$start.sameParent($end) || $start.parent.type.spec.code) return null
        if ((state.storedMarks ?? $end.marks()).some((mark) => mark.type.spec.code)) return null
        // 先补入本次输入，兼容多个字符一次提交，并保留正文原有的 marks。
        const tr = state.tr.insertText(match[0].slice(end - start), end)
        const $cursor = tr.doc.resolve(end + match[0].length - (end - start))
        const prefix = 'text '
        const source = prefix + getSyntaxText($cursor.parent)
        const cursorOffset =
          prefix.length + getSyntaxText($cursor.parent.cut(0, $cursor.parentOffset)).length
        const tree = ctx.get(remarkCtx).parse(source)
        const paragraph = tree.children[0]
        if (paragraph?.type !== 'paragraph') return null
        const found = findClosingFormat(paragraph.children, cursorOffset)
        const offset = found?.node.position?.start.offset
        if (!found || offset == null) return null
        const positionAt = (offset: number) =>
          $cursor.start() + getPositionAt($cursor.parent, offset - prefix.length)
        const from = positionAt(offset)
        const finish = positionAt(found.node.position!.end.offset!)
        const width = found.format.marker.length
        let allowed = true
        // 代码或链接目标中已有的字符不能重新成为格式定界符。
        for (const position of [from, finish - width]) {
          if (tr.doc.nodeAt(position)?.marks.some((mark) => mark.type.spec.code)) allowed = false
        }
        if (!allowed || from < $start.start()) return null
        const edits: { from: number; to: number; text: string }[] = []
        const collectEscapes = (node: PhrasingContent) => {
          if (node.type !== 'text') {
            if ('children' in node) node.children.forEach(collectEscapes)
            return
          }
          const offset = node.position?.start.offset
          const limit = node.position?.end.offset
          if (offset == null || limit == null) return
          const raw = source.slice(offset, limit)
          for (const match of raw.matchAll(/\\[^\r\n]|&(?:#(?:\d+|x[\da-f]+)|[\da-z]+);/gi)) {
            const value = match[0]
            const text =
              found.format.name !== 'highlight' && /^\\[ \t]$/.test(value)
                ? value.slice(1)
                : decodeString(value)
            const start = positionAt(offset + match.index!)
            if (text === value || tr.doc.nodeAt(start)?.marks.some((mark) => mark.type.spec.code))
              continue
            edits.push({ from: start, to: positionAt(offset + match.index! + value.length), text })
          }
        }
        collectEscapes(found.node)
        const stepCount = tr.steps.length
        tr.delete(finish - width, finish).delete(from, from + width)
        for (const edit of edits.sort((left, right) => right.from - left.from)) {
          const mapping = tr.mapping.slice(stepCount)
          const start = mapping.map(edit.from, 1)
          const to = mapping.map(edit.to, -1)
          tr.replaceWith(start, to, state.schema.text(edit.text, tr.doc.nodeAt(start)?.marks))
        }
        const mapping = tr.mapping.slice(stepCount)
        tr.addMark(
          mapping.map(from + width, 1),
          mapping.map(finish - width, -1),
          state.schema.marks[found.format.name].create(),
        )
        return tr.setStoredMarks(state.storedMarks ?? [])
      },
      { inCodeMark: false },
    ),
)

export const inlineFormattingPreferences = $prose(
  () =>
    new Plugin({
      props: {
        clipboardTextSerializer: serializeInlineFormattingClipboard,
        decorations: (state) => {
          const decorations: Decoration[] = []
          for (const format of inlineFormats) {
            if (markdownPreferences.enabled[format.name]) continue
            const ranges: { from: number; to: number }[] = []
            state.doc.descendants((node, position) => {
              if (!node.isInline || !node.marks.some((mark) => mark.type.name === format.name))
                return
              const previous = ranges.at(-1)
              if (previous?.to === position) previous.to += node.nodeSize
              else ranges.push({ from: position, to: position + node.nodeSize })
              return false
            })
            for (const range of ranges) {
              const rank = inlineFormats.indexOf(format)
              decorations.push(
                Decoration.widget(range.from, () => document.createTextNode(format.marker), {
                  side: rank + 1,
                }),
                Decoration.widget(range.to, () => document.createTextNode(format.marker), {
                  side: -rank - 1,
                }),
              )
            }
          }
          state.doc.descendants((node, position) => {
            if (!node.isText || node.marks.some((mark) => mark.type.spec.code)) return
            const formats = getDisabledFormats(node.marks)
            if (!formats.length) return
            for (const offset of getSourceEscapePositions(
              node.text!,
              formats.some(({ name }) => name !== 'highlight'),
            )) {
              decorations.push(
                Decoration.widget(position + offset, () => document.createTextNode('\\'), {
                  side: 100,
                }),
              )
            }
          })
          return DecorationSet.create(state.doc, decorations)
        },
      },
      view: (view) => {
        const updateAttributes = () => {
          for (const { name } of inlineFormats)
            view.dom.dataset[name] = String(markdownPreferences.enabled[name])
        }
        updateAttributes()
        const stop = watch(
          () => inlineFormats.map(({ name }) => markdownPreferences.enabled[name]),
          () => {
            updateAttributes()
            view.dispatch(view.state.tr.setMeta('addToHistory', false))
          },
          { flush: 'sync' },
        )
        return { destroy: stop }
      },
    }),
)
