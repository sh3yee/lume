import { codeBlockSchema } from '@milkdown/kit/preset/commonmark'

export const preservedCodeSchema = codeBlockSchema.extendSchema((previous) => (ctx) => {
  const schema = previous(ctx)
  return {
    ...schema,
    attrs: { ...schema.attrs, meta: { default: '', validate: 'string' } },
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full' as const,
        getAttrs: (dom: HTMLElement) => ({
          language: dom.dataset.language ?? '',
          meta: dom.dataset.meta ?? '',
        }),
      },
    ],
    toDOM: (node) => [
      'pre',
      { 'data-language': node.attrs.language, 'data-meta': node.attrs.meta },
      ['code', 0],
    ],
    parseMarkdown: {
      match: ({ type }) => type === 'code',
      runner: (state, node, type) => {
        state.openNode(type, { language: node.lang ?? '', meta: node.meta ?? '' })
        if (node.value) state.addText(String(node.value))
        state.closeNode()
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'code_block',
      runner: (state, node) =>
        state.addNode('code', undefined, node.textContent, {
          lang: node.attrs.language,
          meta: node.attrs.meta || null,
        }),
    },
  }
})
