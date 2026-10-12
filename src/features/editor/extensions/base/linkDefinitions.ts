import type { Node as MarkdownNode } from '@milkdown/kit/transformer'
import { $nodeSchema, $remark } from '@milkdown/kit/utils'

type ReferenceNode = MarkdownNode & {
  children?: ReferenceNode[]
  identifier?: string
  label?: string
  url?: string
  title?: string | null
  alt?: string
}

const normalizeIdentifier = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

// 引用式链接仍规范化为行内链接，但定义本身保留为可序列化的节点。
export const resolveReferences = (tree: ReferenceNode) => {
  const definitions = new Map<string, ReferenceNode>()
  const collect = (node: ReferenceNode) => {
    if (node.type === 'definition') {
      const id = normalizeIdentifier(node.identifier ?? '')
      if (!definitions.has(id)) definitions.set(id, node)
    }
    node.children?.forEach(collect)
  }
  collect(tree)
  const transform = (node: ReferenceNode) => {
    if (node.type === 'linkReference' || node.type === 'imageReference') {
      const definition = definitions.get(normalizeIdentifier(node.identifier ?? ''))
      if (definition) {
        node.type = node.type === 'linkReference' ? 'link' : 'image'
        node.url = definition.url
        node.title = definition.title
      }
    }
    node.children?.forEach(transform)
  }
  transform(tree)
}

export const preservedReferences = $remark(
  'lumeReferences',
  () => () => (tree) => resolveReferences(tree as ReferenceNode),
)

export const linkDefinitionSchema = $nodeSchema('link_definition', () => ({
  group: 'block',
  atom: true,
  attrs: {
    identifier: { default: '' },
    label: { default: '' },
    url: { default: '' },
    title: { default: '' },
  },
  toDOM: (node) => [
    'div',
    {
      class: 'lume-link-definition',
      'data-link-definition': JSON.stringify(node.attrs),
      contenteditable: 'false',
    },
    `[${node.attrs.label || node.attrs.identifier}]: ${node.attrs.url}${node.attrs.title ? ` "${node.attrs.title}"` : ''}`,
  ],
  parseDOM: [
    {
      tag: 'div[data-link-definition]',
      getAttrs: (element: HTMLElement) => {
        try {
          const attrs = JSON.parse(element.dataset.linkDefinition ?? '{}')
          return Object.fromEntries(
            ['identifier', 'label', 'url', 'title'].map((key) => [
              key,
              typeof attrs[key] === 'string' ? attrs[key] : '',
            ]),
          )
        } catch {
          return false
        }
      },
    },
  ],
  parseMarkdown: {
    match: (node) => node.type === 'definition',
    runner: (state, node, type) => {
      const definition = node as ReferenceNode
      state.addNode(type, {
        identifier: definition.identifier,
        label: definition.label ?? '',
        url: definition.url,
        title: definition.title ?? '',
      })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'link_definition',
    runner: (state, node) =>
      state.addNode('definition', undefined, undefined, {
        ...node.attrs,
        title: node.attrs.title || null,
      }),
  },
}))
