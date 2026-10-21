import { remarkCtx } from '@milkdown/kit/core'
import { linkSchema } from '@milkdown/kit/preset/commonmark'
import type { Node } from '@milkdown/kit/prose/model'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { normalizeIdentifier, type ReferenceNode } from './linkDefinitions'
import { isLinkEnabled } from './autoLinks'

export const getLinkDefinitionSource = (doc: Node) => {
  const definitions: string[] = []
  doc.descendants((node) => {
    if (node.type.name !== 'link_definition' || !node.attrs.identifier) return
    definitions.push(node.textContent)
    return false
  })
  return definitions.join('\n\n')
}

export const referenceLinkSchema = linkSchema.extendSchema((previous) => (ctx) => {
  const schema = previous(ctx)
  return {
    ...schema,
    attrs: {
      ...schema.attrs,
      referenceId: { default: '' },
      referenceLabel: { default: '' },
      referenceType: { default: 'full' },
      autoLink: { default: false, validate: 'boolean' },
    },
    parseDOM: [
      {
        tag: 'a[href], a[data-auto-link]',
        getAttrs: (dom: HTMLElement) => ({
          href: dom.getAttribute('href') ?? dom.dataset.autoHref ?? '',
          title: dom.getAttribute('title'),
          referenceId: dom.dataset.referenceId ?? '',
          referenceLabel: dom.dataset.referenceLabel ?? '',
          referenceType: dom.dataset.referenceType ?? 'full',
          autoLink: dom.dataset.autoLink === 'true',
        }),
      },
    ],
    toDOM: (mark) => {
      const dom = schema.toDOM!(mark, false) as [string, Record<string, unknown>]
      const { referenceId, referenceLabel, referenceType, autoLink, ...attrs } = dom[1]
      return [
        dom[0],
        {
          ...attrs,
          ...(autoLink
            ? {
                'data-auto-link': 'true',
                'data-auto-href': attrs.href,
                href: isLinkEnabled(mark) ? attrs.href : null,
              }
            : {}),
          ...(referenceId
            ? {
                'data-reference-id': referenceId,
                'data-reference-label': referenceLabel,
                'data-reference-type': referenceType,
              }
            : {}),
        },
      ] as [string, Record<string, unknown>]
    },
    parseMarkdown: {
      match: (node) => node.type === 'link',
      runner: (state, node, type) => {
        const reference = (node as ReferenceNode).data?.reference
        state.openMark(type, {
          href: node.url,
          title: node.title ?? null,
          referenceId: reference ? normalizeIdentifier(reference.identifier) : '',
          referenceLabel: reference?.label ?? '',
          referenceType: reference?.referenceType ?? 'full',
          autoLink: (node as { data?: { autoLink?: boolean } }).data?.autoLink === true,
        })
        state.next(node.children)
        state.closeMark(type)
      },
    },
    toMarkdown: {
      match: (mark) => mark.type.name === 'link',
      runner: (state, mark, node) => {
        if (mark.attrs.autoLink) {
          state.withMark(mark, 'lumeAutoLink')
          return
        }
        if (!mark.attrs.referenceId) return schema.toMarkdown.runner(state, mark, node)
        state.withMark(mark, 'linkReference', undefined, {
          identifier: mark.attrs.referenceId,
          label: mark.attrs.referenceLabel,
          referenceType: mark.attrs.referenceType,
        })
      },
    },
  }
})

export const linkDefinitionPlugin = $prose((ctx) => {
  let editorView: EditorView | null = null
  const parseDefinition = (source: string) => {
    const tree = ctx.get(remarkCtx).parse(source)
    return tree.children.length === 1 && tree.children[0]?.type === 'definition'
      ? tree.children[0]
      : null
  }
  return new Plugin({
    view(view) {
      editorView = view
      return {
        destroy: () => {
          editorView = null
        },
      }
    },
    props: {
      handleKeyDown(view, event) {
        if (
          !view.editable ||
          event.isComposing ||
          event.key !== 'Enter' ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey ||
          view.state.selection.$from.parent.type.name !== 'link_definition'
        )
          return false
        const position = view.state.selection.$from.after()
        const tr = view.state.tr.insert(position, view.state.schema.nodes.paragraph.create())
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, position + 1)).scrollIntoView())
        return true
      },
    },
    appendTransaction(transactions, _oldState, state) {
      if (editorView?.composing || !transactions.some((tr) => tr.docChanged)) return null
      const tr = state.tr
      const definitions = new Map<string, { url: string; title: string | null }>()
      state.doc.descendants((node, pos) => {
        if (node.type.name !== 'link_definition') return
        const definition = parseDefinition(node.textContent)
        const identifier = definition ? normalizeIdentifier(definition.identifier) : ''
        if (definition && !definitions.has(identifier))
          definitions.set(identifier, { url: definition.url, title: definition.title ?? null })
        const attrs = {
          identifier,
          label: definition?.label ?? '',
          url: definition?.url ?? '',
          title: definition?.title ?? '',
        }
        if (Object.entries(attrs).some(([key, value]) => node.attrs[key] !== value))
          tr.setNodeMarkup(pos, state.schema.nodes.link_definition, attrs)
        return false
      })
      const definitionSource = getLinkDefinitionSource(tr.doc)
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'link_source' && node.attrs.definitions !== definitionSource)
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, definitions: definitionSource })
        const mark = node.marks.find((item) => item.type.name === 'link' && item.attrs.referenceId)
        if (!mark) return
        const definition = definitions.get(mark.attrs.referenceId)
        const href = definition?.url ?? ''
        const title = definition?.title ?? null
        if (mark.attrs.href !== href || mark.attrs.title !== title)
          tr.addMark(pos, pos + node.nodeSize, mark.type.create({ ...mark.attrs, href, title }))
      })
      return tr.docChanged ? tr : null
    },
  })
})
