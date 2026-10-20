import { htmlSchema } from '@milkdown/kit/preset/commonmark'
import { $nodeSchema } from '@milkdown/kit/utils'
import { getHtmlAttributes, inlineHtmlTags, voidHtmlTags } from './policy'
import { parseHtmlTag } from './remark'

export const htmlInlineSchema = $nodeSchema('html_inline', () => ({
  inline: true,
  group: 'inline',
  content: 'inline*',
  defining: true,
  attrs: {
    open: { default: '<span>', validate: 'string' },
    close: { default: '</span>', validate: 'string' },
  },
  parseDOM: [
    {
      tag: 'span[data-html-inline]',
      contentElement: '[data-html-content]',
      getAttrs: (dom) => ({
        open: dom.getAttribute('data-html-open') ?? '<span>',
        close: dom.getAttribute('data-html-close') ?? '</span>',
      }),
    },
    ...Array.from(inlineHtmlTags)
      .filter(
        (tag) =>
          !voidHtmlTags.has(tag) &&
          !['a', 'b', 'strong', 'i', 'em', 'code', 's', 'del', 'strike'].includes(tag),
      )
      .map((tag) => ({
        tag,
        getAttrs: (dom: HTMLElement) => {
          const close = `</${tag}>`
          return {
            open: (dom.cloneNode(false) as Element).outerHTML.slice(0, -close.length),
            close,
          }
        },
      })),
  ],
  toDOM: (node) => {
    const tag = parseHtmlTag(String(node.attrs.open))?.name ?? 'span'
    const template = document.createElement('template')
    template.innerHTML = `${node.attrs.open}${node.attrs.close}`
    const element = template.content.firstElementChild
    const attributes = element ? getHtmlAttributes(element, { editing: true }) : {}
    return [
      'span',
      {
        'data-html-inline': '',
        'data-html-open': node.attrs.open,
        'data-html-close': node.attrs.close,
      },
      [inlineHtmlTags.has(tag) ? tag : 'span', { ...attributes, 'data-html-content': '' }, 0],
    ]
  },
  parseMarkdown: {
    match: (node) => node.type === 'htmlInline',
    runner: (state, node, type) => {
      state.openNode(type, { open: node.open, close: node.close })
      state.next(node.children)
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'html_inline',
    runner: (state, node) => {
      state.openNode('htmlInline', undefined, {
        open: String(node.attrs.open),
        close: String(node.attrs.close),
      })
      state.next(node.content)
      state.closeNode()
    },
  },
}))

export const htmlBlockSchema = $nodeSchema('html_block', () => ({
  group: 'block',
  atom: true,
  isolating: true,
  attrs: { value: { default: '', validate: 'string' } },
  parseDOM: [
    {
      tag: 'div[data-html-block]',
      getAttrs: (dom) => ({ value: dom.getAttribute('data-html-block') ?? '' }),
    },
    ...['details', 'video', 'audio', 'iframe', 'svg'].map((tag) => ({
      tag,
      getAttrs: (dom: HTMLElement) => ({ value: dom.outerHTML }),
    })),
  ],
  toDOM: (node) => ['div', { 'data-html-block': node.attrs.value }, node.attrs.value],
  parseMarkdown: {
    match: (node) => node.type === 'htmlBlock',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'html_block',
    runner: (state, node) => {
      state.addNode('htmlBlock', undefined, String(node.attrs.value))
    },
  },
}))

export const htmlSourceSchema = $nodeSchema('html_source', () => ({
  inline: true,
  group: 'inline',
  content: 'text*',
  marks: '',
  code: true,
  isolating: true,
  toDOM: () => [
    'span',
    { 'data-html-source': '', class: 'lume-html-source', spellcheck: 'false' },
    0,
  ],
  parseDOM: [{ tag: 'span[data-html-source]', preserveWhitespace: 'full' }],
  parseMarkdown: { match: () => false, runner: () => {} },
  toMarkdown: {
    match: (node) => node.type.name === 'html_source',
    runner: (state, node) => {
      state.addNode('html', undefined, node.textContent)
    },
  },
}))

export const preservedHtmlSchema = htmlSchema.extendSchema((previous) => (ctx) => ({
  ...previous(ctx),
  toDOM: (node) => [
    'span',
    { 'data-type': 'html', 'data-value': node.attrs.value },
    node.attrs.value,
  ],
}))
