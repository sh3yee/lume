import { parserCtx, serializerCtx } from '@milkdown/kit/core'
import { isHistoryTransaction } from '@milkdown/kit/prose/history'
import { Fragment, type Node } from '@milkdown/kit/prose/model'
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $nodeSchema, $prose } from '@milkdown/kit/utils'
import { replaceLinkPresentation } from './linkEditing'

const editingKey = new PluginKey('lumeInlineSourceEditing')
const markNames = new Set([
  'emphasis',
  'strong',
  'strike_through',
  'inlineCode',
  'highlight',
  'subscript',
  'superscript',
])
const atomNames = new Set(['image', 'math_inline', 'footnote_reference'])

const definitionsFor = (doc: Node, serialize: (doc: Node) => string) => {
  const definitions: Node[] = []
  doc.forEach((node) => {
    if (['footnote_definition', 'link_definition'].includes(node.type.name)) definitions.push(node)
  })
  return definitions.length ? serialize(doc.type.create(null, definitions)) : ''
}

export const parseInlineSource = (
  source: string,
  parse: (text: string) => Node,
  definitions = '',
) => {
  // Prefix prevents inline delimiters being mistaken for a block (e.g. a list).
  const doc = parse(`lume ${source}${definitions ? `\n\n${definitions}` : ''}`)
  const paragraph = doc.firstChild
  if (paragraph?.type.name !== 'paragraph' || !paragraph.textContent.startsWith('lume '))
    return null
  for (let i = 1; i < doc.childCount; i++)
    if (!['footnote_definition', 'link_definition'].includes(doc.child(i).type.name)) return null
  return paragraph.content.cut(5)
}

const isComplete = (content: Fragment | null) =>
  !!content?.childCount &&
  (() => {
    let complete = true
    content.forEach((node) => {
      if (
        !atomNames.has(node.type.name) &&
        !node.marks.some((mark) => markNames.has(mark.type.name))
      )
        complete = false
    })
    return complete
  })()

export const insertInlineSource = (
  tr: Transaction,
  from: number,
  to: number,
  source: string,
  rendered?: Fragment,
  definitions = '',
) => {
  const node = tr.doc.type.schema.nodes.inline_source.create(
    {
      original: source,
      rendered: rendered?.toJSON() ?? null,
      definitions,
    },
    source ? tr.doc.type.schema.text(source) : undefined,
  )
  replaceLinkPresentation(tr, from, to, Fragment.from(node))
  return tr.setSelection(TextSelection.create(tr.doc, from + 1 + source.length)).setStoredMarks([])
}

export const openInlineSource = (
  tr: Transaction,
  from: number,
  to: number,
  serialize: (doc: Node) => string,
  cursor?: number,
) => {
  const content = tr.doc.slice(from, to).content
  const schema = tr.doc.type.schema
  const source = serialize(
    schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, content)),
  ).replace(/\n$/, '')
  const definitions = definitionsFor(tr.doc, serialize)
  insertInlineSource(tr, from, to, source, content, definitions)
  if (cursor !== undefined) {
    const prefix = source.match(/^[*_~^=`$]+/)?.[0].length ?? 0
    tr.setSelection(
      TextSelection.create(
        tr.doc,
        from + 1 + Math.min(source.length, prefix + Math.max(0, cursor - from)),
      ),
    )
  }
  return tr.setMeta(editingKey, 'opened').setMeta('addToHistory', false)
}

export const inlineSourceSchema = $nodeSchema('inline_source', (ctx) => ({
  inline: true,
  group: 'inline',
  content: 'text*',
  marks: '',
  code: true,
  selectable: false,
  attrs: { original: { default: '' }, rendered: { default: null }, definitions: { default: '' } },
  toDOM: () => [
    'span',
    { class: 'lume-inline-source', 'data-inline-source': '', spellcheck: 'false' },
    0,
  ],
  parseDOM: [{ tag: 'span[data-inline-source]', preserveWhitespace: 'full' }],
  parseMarkdown: { match: () => false, runner: () => {} },
  toMarkdown: {
    match: (node) => node.type.name === 'inline_source',
    runner: (state, node) => {
      const content =
        node.textContent === node.attrs.original && node.attrs.rendered
          ? Fragment.fromJSON(node.type.schema, node.attrs.rendered)
          : parseInlineSource(node.textContent, ctx.get(parserCtx), node.attrs.definitions)
      if (isComplete(content)) state.next(content!)
      else state.addNode('html', undefined, node.textContent)
    },
  },
}))

export const inlineSourceEditingPlugin = $prose((ctx) => {
  let editorView: EditorView | null = null
  let compositionOrigin: string | null = null
  let compositionTimer: ReturnType<typeof setTimeout> | undefined
  const read = (node: Node, doc: Node) =>
    node.textContent === node.attrs.original && node.attrs.rendered
      ? Fragment.fromJSON(doc.type.schema, node.attrs.rendered)
      : parseInlineSource(
          node.textContent,
          ctx.get(parserCtx),
          definitionsFor(doc, ctx.get(serializerCtx)),
        )
  return new Plugin({
    key: editingKey,
    view(view) {
      editorView = view
      return {
        destroy: () => {
          editorView = null
          clearTimeout(compositionTimer)
        },
      }
    },
    props: {
      handleTextInput(view, from, to, text) {
        const { $from, empty } = view.state.selection
        if (
          !view.editable ||
          view.composing ||
          !text ||
          !empty ||
          from !== to ||
          from !== $from.pos ||
          $from.parent.type.name !== 'inline_source' ||
          $from.parentOffset !== $from.parent.content.size ||
          !isComplete(read($from.parent, view.state.doc))
        )
          return false
        const pos = $from.after()
        const tr = view.state.tr.insertText(text, pos, pos)
        view.dispatch(
          tr.setSelection(TextSelection.create(tr.doc, pos + text.length)).setStoredMarks([]),
        )
        return true
      },
      handleClickOn(view, _pos, node, pos, event, direct) {
        if (
          !view.editable ||
          view.composing ||
          !direct ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          !atomNames.has(node.type.name)
        )
          return false
        view.dispatch(
          openInlineSource(view.state.tr, pos, pos + node.nodeSize, ctx.get(serializerCtx)),
        )
        return true
      },
      handleClick(view, pos, event) {
        if (
          !view.editable ||
          view.composing ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return false
        const $pos = view.state.doc.resolve(pos)
        if (!$pos.parent.isTextblock || $pos.parent.type.spec.code) return false
        const marks = [...($pos.nodeAfter?.marks ?? []), ...($pos.nodeBefore?.marks ?? [])]
        if (
          marks.some((mark) => mark.type.name === 'link') ||
          !marks.some((mark) => markNames.has(mark.type.name))
        )
          return false
        view.dispatch(
          view.state.tr
            .setSelection(TextSelection.create(view.state.doc, pos))
            .setMeta(editingKey, 'open'),
        )
        return true
      },
      handleDOMEvents: {
        compositionstart(view) {
          const { $from, empty } = view.state.selection
          compositionOrigin =
            empty &&
            $from.parent.type.name === 'inline_source' &&
            $from.parentOffset === $from.parent.content.size &&
            isComplete(read($from.parent, view.state.doc))
              ? $from.parent.textContent
              : null
          return false
        },
        compositionend(view) {
          const source = compositionOrigin
          compositionOrigin = null
          clearTimeout(compositionTimer)
          if (source !== null)
            compositionTimer = setTimeout(() => {
              if (!view.isDestroyed && view.editable && !view.composing)
                view.dispatch(view.state.tr.setMeta(editingKey, { boundary: source }))
            }, 0)
          return false
        },
        blur(view) {
          if (view.editable) view.dispatch(view.state.tr.setMeta(editingKey, 'blur'))
          return false
        },
        keydown(view, event) {
          if (
            !view.editable ||
            view.composing ||
            event.isComposing ||
            event.shiftKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          )
            return false
          const { $from, empty } = view.state.selection
          if (!empty) return false
          if ($from.parent.type.name !== 'inline_source') {
            if (
              !$from.parent.isTextblock ||
              $from.parent.type.spec.code ||
              !['ArrowLeft', 'ArrowRight'].includes(event.key)
            )
              return false
            const left = event.key === 'ArrowLeft'
            const next = left ? $from.nodeBefore : $from.nodeAfter
            if (next && atomNames.has(next.type.name)) {
              const from = left ? $from.pos - next.nodeSize : $from.pos
              view.dispatch(
                openInlineSource(
                  view.state.tr,
                  from,
                  from + next.nodeSize,
                  ctx.get(serializerCtx),
                  left ? undefined : from,
                ),
              )
            } else if (
              next?.isText &&
              !next.marks.some((mark) => mark.type.name === 'link') &&
              next.marks.some((mark) => markNames.has(mark.type.name))
            ) {
              view.dispatch(
                view.state.tr
                  .setSelection(TextSelection.create(view.state.doc, $from.pos + (left ? -1 : 1)))
                  .setMeta(editingKey, 'open'),
              )
            } else return false
            event.preventDefault()
            return true
          }
          const left = event.key === 'ArrowLeft' && $from.parentOffset === 0
          const right =
            event.key === 'ArrowRight' && $from.parentOffset === $from.parent.content.size
          if (!left && !right && !['Enter', 'Escape', 'Tab'].includes(event.key)) return false
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.create(view.state.doc, left ? $from.before() : $from.after()),
            ),
          )
          if (event.key === 'Enter' || event.key === 'Tab') return false
          event.preventDefault()
          return true
        },
      },
    },
    appendTransaction(transactions, old, state) {
      if (
        editorView?.composing ||
        transactions.some((tr) => tr.getMeta(editingKey) === 'updated' || isHistoryTransaction(tr))
      )
        return null
      const blur = transactions.some((tr) => tr.getMeta(editingKey) === 'blur')
      const composition = transactions
        .map((tr) => tr.getMeta(editingKey)?.boundary)
        .find((value) => typeof value === 'string')
      const before = old.selection.$from
      const origin =
        composition ??
        (old.selection.empty &&
        before.parent.type.name === 'inline_source' &&
        before.parentOffset === before.parent.content.size &&
        isComplete(read(before.parent, old.doc))
          ? before.parent.textContent
          : null)
      const current = state.selection.$from
      if (
        origin !== null &&
        state.selection.empty &&
        current.parent.type.name === 'inline_source' &&
        current.parentOffset === current.parent.content.size &&
        current.parent.textContent.startsWith(origin) &&
        current.parent.textContent.length > origin.length
      ) {
        const rendered = read(
          current.parent.type.create(current.parent.attrs, state.schema.text(origin)),
          state.doc,
        )
        if (isComplete(rendered)) {
          const suffix = current.parent.textContent.slice(origin.length)
          const content = rendered!.append(Fragment.from(state.schema.text(suffix)))
          const tr = state.tr
          replaceLinkPresentation(tr, current.before(), current.after(), content)
          return tr
            .setSelection(TextSelection.create(tr.doc, current.before() + content.size))
            .setStoredMarks([])
            .setMeta(editingKey, 'updated')
        }
      }
      if (!blur && !transactions.some((tr) => tr.selectionSet || tr.docChanged)) return null
      const sources: { node: Node; pos: number }[] = []
      state.doc.descendants((node, pos) => {
        if (node.type.name !== 'inline_source') return
        if (blur || !(state.selection.from > pos && state.selection.to < pos + node.nodeSize))
          sources.push({ node, pos })
        return false
      })
      const tr = state.tr
      let edited = false
      for (const { node, pos } of sources.reverse()) {
        const content = read(node, state.doc)
        // Incomplete syntax remains editable and is saved literally.
        if (!content || (node.textContent && !isComplete(content))) continue
        replaceLinkPresentation(tr, pos, pos + node.nodeSize, content)
        if (node.textContent !== node.attrs.original) edited = true
      }
      if (
        !tr.docChanged &&
        !blur &&
        editorView?.editable &&
        editorView.hasFocus() &&
        !transactions.some(
          (transaction) => transaction.docChanged || transaction.getMeta(editingKey) === 'opened',
        )
      ) {
        const { selection } = state
        if (
          selection instanceof NodeSelection &&
          atomNames.has(selection.node.type.name) &&
          selection.node.type.name !== 'image'
        ) {
          openInlineSource(tr, selection.from, selection.to, ctx.get(serializerCtx))
        } else if (
          selection.empty &&
          selection.$from.parent.isTextblock &&
          !selection.$from.parent.type.spec.code
        ) {
          const { $from } = selection
          const ranges: { from: number; to: number; mark: string }[] = []
          $from.parent.forEach((node, offset) => {
            if (node.marks.some((mark) => mark.type.name === 'link')) return
            const mark = node.marks.find((mark) => markNames.has(mark.type.name))
            if (!mark) return
            const previous = ranges.at(-1)
            if (previous?.to === offset && previous.mark === mark.type.name)
              previous.to += node.nodeSize
            else ranges.push({ from: offset, to: offset + node.nodeSize, mark: mark.type.name })
          })
          const clicked = transactions.some(
            (transaction) => transaction.getMeta(editingKey) === 'open',
          )
          const range = ranges.find((range) =>
            clicked
              ? $from.parentOffset >= range.from && $from.parentOffset <= range.to
              : $from.parentOffset > range.from && $from.parentOffset < range.to,
          )
          if (range)
            openInlineSource(
              tr,
              $from.start() + range.from,
              $from.start() + range.to,
              ctx.get(serializerCtx),
              $from.pos,
            )
        }
      }
      if (!tr.docChanged) return null
      tr.setMeta(editingKey, 'updated')
      return edited ? tr : tr.setMeta('addToHistory', false)
    },
  })
})
