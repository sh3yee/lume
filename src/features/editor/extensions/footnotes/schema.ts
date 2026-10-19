import { footnoteReferenceSchema } from '@milkdown/preset-gfm'
import type { Node } from '@milkdown/kit/prose/model'

export const parseFootnoteReferenceSource = (source: string) =>
  source.match(/^\[\^([^\]\s]+)\]$/)?.[1] ?? null

export const getFootnoteReferenceSource = (node: Node) =>
  typeof node.attrs.source === 'string' ? node.attrs.source : `[^${node.attrs.label}]`

export const editableFootnoteReferenceSchema = footnoteReferenceSchema.extendSchema(
  (previous) => (ctx) => {
    const schema = previous(ctx)
    return {
      ...schema,
      attrs: { ...schema.attrs, source: { default: null, validate: 'string|null' } },
      toDOM: (node) =>
        typeof node.attrs.source === 'string' ? ['span', node.attrs.source] : schema.toDOM!(node),
      toMarkdown: {
        ...schema.toMarkdown,
        runner: (state, node) => {
          // 未完成的源码也随输入同步到文档，保存或切换模式时不会丢失。
          if (typeof node.attrs.source === 'string') {
            state.addNode('text', undefined, node.attrs.source)
            return
          }
          schema.toMarkdown.runner(state, node)
        },
      },
    }
  },
)
