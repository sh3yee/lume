import { Plugin } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { $markSchema, $prose } from '@milkdown/kit/utils'
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
