import { remarkCtx } from '@milkdown/kit/core'
import type { Node as MarkdownNode } from '@milkdown/kit/transformer'
import { $nodeSchema, $remark } from '@milkdown/kit/utils'

export type ReferenceNode = MarkdownNode & {
  children?: ReferenceNode[]
  identifier?: string
  label?: string
  url?: string
  title?: string | null
  alt?: string
  referenceType?: string
  data?: { reference?: { identifier: string; label: string; referenceType: string } }
}

export const normalizeIdentifier = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase()

// 解析为链接时保留引用标识，保存和编辑时仍能关联到原定义。
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
        if (node.type === 'linkReference')
          node.data = {
            ...node.data,
            reference: {
              identifier: node.identifier ?? '',
              label: node.label ?? node.identifier ?? '',
              referenceType: node.referenceType ?? 'full',
            },
          }
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

export const linkDefinitionSchema = $nodeSchema('link_definition', (ctx) => ({
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  selectable: false,
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
    },
    0,
  ],
  parseDOM: [
    {
      tag: 'div[data-link-definition]',
      preserveWhitespace: 'full',
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
      state.openNode(type, {
        identifier: definition.identifier,
        label: definition.label ?? '',
        url: definition.url,
        title: definition.title ?? '',
      })
      const source = ctx
        .get(remarkCtx)
        .stringify({
          type: 'root',
          children: [
            {
              type: 'definition',
              identifier: definition.identifier ?? '',
              label: definition.label ?? '',
              url: definition.url ?? '',
              title: definition.title ?? null,
            },
          ],
        })
        .trimEnd()
      state.addText(source)
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'link_definition',
    runner: (state, node) => {
      const tree = ctx.get(remarkCtx).parse(node.textContent)
      const definition = tree.children[0]
      if (tree.children.length === 1 && definition?.type === 'definition')
        state.addNode('definition', undefined, undefined, {
          identifier: definition.identifier,
          label: definition.label ?? definition.identifier,
          url: definition.url,
          title: definition.title ?? null,
        })
      // 编辑到一半或清空时保留原文，不能退回旧地址。
      else state.addNode('html', undefined, node.textContent)
    },
  },
}))
