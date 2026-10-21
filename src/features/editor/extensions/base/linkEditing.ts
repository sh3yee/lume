import { parserCtx, serializerCtx } from '@milkdown/kit/core'
import { isHistoryTransaction } from '@milkdown/kit/prose/history'
import { Fragment, Slice, type Node } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@milkdown/kit/prose/state'
import { ReplaceAroundStep } from '@milkdown/kit/prose/transform'
import type { EditorView } from '@milkdown/kit/prose/view'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { $nodeSchema, $prose } from '@milkdown/kit/utils'
import { findLinkAt } from '../../wysiwyg/selectionContext'
import { getLinkDefinitionSource } from './referenceLinks'

const linkEditingKey = new PluginKey('lumeLinkEditing')

// 展开和收起保留标签文字的位置映射，避免清掉这些文字已有的撤销记录。
const replaceLinkPresentation = (tr: Transaction, from: number, to: number, content: Fragment) => {
  const previous = tr.doc.nodeAt(from)
  const sourceNode = content.firstChild?.type.name === 'link_source' ? content.firstChild : null
  const oldContent =
    previous?.type.name === 'link_source' ? previous.content : tr.doc.slice(from, to).content
  const nextContent = sourceNode?.content ?? content
  let textOnly = true
  oldContent.forEach((node) => {
    if (!node.isText) textOnly = false
  })
  nextContent.forEach((node) => {
    if (!node.isText) textOnly = false
  })
  if (!textOnly) return tr.replaceWith(from, to, content)

  const before = oldContent.textBetween(0, oldContent.size)
  const after = nextContent.textBetween(0, nextContent.size)
  const shorter = sourceNode ? before : after
  const longer = sourceNode ? after : before
  const gaps: { from: number; to: number; text: string }[] = []
  let offset = 0
  for (let index = 0; index < shorter.length; index += 1) {
    const next = longer.indexOf(shorter[index], offset)
    if (next === -1) return tr.replaceWith(from, to, content)
    if (next > offset)
      gaps.push({ from: sourceNode ? index : offset, to: next, text: longer.slice(offset, next) })
    offset = next + 1
  }
  if (offset < longer.length)
    gaps.push({
      from: sourceNode ? shorter.length : offset,
      to: longer.length,
      text: longer.slice(offset),
    })

  if (previous?.type.name === 'link_source')
    tr.step(new ReplaceAroundStep(from, to, from + 1, to - 1, Slice.empty, 0))
  tr.removeMark(from, from + before.length)
  for (const gap of gaps.reverse()) {
    if (sourceNode) tr.insertText(gap.text, from + gap.from)
    else tr.delete(from + gap.from, from + gap.to)
  }
  if (sourceNode) {
    const wrapper = sourceNode.type.create(sourceNode.attrs)
    tr.step(
      new ReplaceAroundStep(
        from,
        from + after.length,
        from,
        from + after.length,
        new Slice(Fragment.from(wrapper), 0, 0),
        1,
      ),
    )
  } else {
    nextContent.forEach((node, offset) => {
      node.marks.forEach((mark) => tr.addMark(from + offset, from + offset + node.nodeSize, mark))
    })
  }
  return tr
}

export const parseLinkSource = (
  source: string,
  parse: (source: string) => Node,
  definitions = '',
) => {
  let doc = parse(source)
  if (doc.childCount !== 1 || doc.firstChild?.type.name !== 'paragraph') return null
  if (definitions && !doc.firstChild.firstChild?.marks.some((mark) => mark.type.name === 'link'))
    doc = parse(`${source}\n\n${definitions}`)
  const paragraph = doc.firstChild
  if (paragraph?.type.name !== 'paragraph' || !paragraph.childCount) return null
  for (let index = 1; index < doc.childCount; index += 1)
    if (doc.child(index).type.name !== 'link_definition') return null
  const mark = paragraph.firstChild?.marks.find((item) => item.type.name === 'link')
  if (!mark) return null
  let valid = true
  paragraph.forEach((node) => {
    if (!mark.isInSet(node.marks)) valid = false
  })
  return valid ? paragraph : null
}

export const openLinkSource = (
  tr: Transaction,
  from: number,
  to: number,
  serialize: (doc: Node) => string,
) => {
  const { schema } = tr.doc.type
  const paragraph = schema.nodes.paragraph.create(null, tr.doc.slice(from, to).content)
  const source = serialize(schema.nodes.doc.create(null, paragraph)).replace(/\n$/, '')
  const definitions = getLinkDefinitionSource(tr.doc)
  replaceLinkPresentation(
    tr,
    from,
    to,
    Fragment.from(
      schema.nodes.link_source.create({ original: source, definitions }, schema.text(source)),
    ),
  )
  return source
}

// 编辑态仍属于文档，保存或切换模式时不能丢失尚未移出光标的修改。
export const linkSourceSchema = $nodeSchema('link_source', (ctx) => ({
  inline: true,
  group: 'inline',
  content: 'text*',
  attrs: { original: { default: '' }, definitions: { default: '' } },
  marks: '',
  code: true,
  selectable: false,
  toDOM: () => ['span', { class: 'lume-link-source', 'data-link-source': '' }, 0],
  parseDOM: [{ tag: 'span[data-link-source]' }],
  parseMarkdown: { match: () => false, runner: () => {} },
  toMarkdown: {
    match: (node) => node.type.name === 'link_source',
    runner: (state, node) => {
      const paragraph = parseLinkSource(
        node.textContent,
        ctx.get(parserCtx),
        node.attrs.definitions,
      )
      if (paragraph) state.next(paragraph.content)
      // 未补全的语法按原文输出，避免被普通文字序列化器转义。
      else state.addNode('html', undefined, node.textContent)
    },
  },
}))

export const linkEditingPlugin = $prose((ctx) => {
  let modifierClick = false
  let editorView: EditorView | null = null
  const handleSourceKeyDown = (view: EditorView, event: KeyboardEvent) => {
    const { selection } = view.state
    const { $from } = selection
    if (
      !view.editable ||
      event.isComposing ||
      !selection.empty ||
      $from.parent.type.name !== 'link_source' ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    )
      return false
    const left = event.key === 'ArrowLeft' && $from.parentOffset === 0
    const right = event.key === 'ArrowRight' && $from.parentOffset === $from.parent.content.size
    const finish = ['Enter', 'Escape', 'Tab'].includes(event.key)
    if (!left && !right && !finish) return false
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, left ? $from.before() : $from.after()),
      ),
    )
    // Enter 交给正文的换段规则，其他按键只移出当前链接。
    return event.key !== 'Enter'
  }
  return new Plugin({
    key: linkEditingKey,
    view(view) {
      editorView = view
      return {
        destroy: () => {
          editorView = null
        },
      }
    },
    props: {
      decorations(state) {
        const decorations: Decoration[] = []
        state.doc.descendants((node, pos) => {
          if (node.type.name !== 'link_source') return
          if (parseLinkSource(node.textContent, ctx.get(parserCtx), node.attrs.definitions))
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, { class: 'lume-link-source--valid' }),
            )
          return false
        })
        return DecorationSet.create(state.doc, decorations)
      },
      handleTextInput(view, _from, _to, text) {
        const { selection } = view.state
        const { $from } = selection
        if (
          !view.editable ||
          view.composing ||
          !text ||
          !selection.empty ||
          $from.parent.type.name !== 'link_source' ||
          $from.parentOffset !== $from.parent.content.size
        )
          return false
        const paragraph = parseLinkSource(
          $from.parent.textContent,
          ctx.get(parserCtx),
          $from.parent.attrs.definitions,
        )
        if (!paragraph) return false
        const position = $from.after()
        const tr = view.state.tr.insertText(text, position, position)
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, position + text.length)))
        return true
      },
      handleDOMEvents: {
        keydown(view, event) {
          modifierClick = false
          const handled = handleSourceKeyDown(view, event)
          if (handled) event.preventDefault()
          return handled
        },
        mousedown(_view, event) {
          modifierClick = event.ctrlKey || event.metaKey || event.button !== 0
          return false
        },
        click() {
          modifierClick = false
          return false
        },
      },
      handleClick(view, pos, event) {
        if (
          !view.editable ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return false
        const link = findLinkAt(view.state, pos)
        if (!link || link.mark.attrs.autoLink) return false
        view.dispatch(
          view.state.tr
            .setSelection(TextSelection.create(view.state.doc, pos))
            .setMeta(linkEditingKey, 'open'),
        )
        return true
      },
      handleKeyDown: handleSourceKeyDown,
    },
    appendTransaction(transactions, _oldState, state) {
      if (
        modifierClick ||
        editorView?.composing ||
        transactions.some((tr) => tr.getMeta(linkEditingKey) === 'updated')
      )
        return null
      const tr = state.tr
      let edited = false
      const sources: { from: number; to: number; source: string; original: string }[] = []
      state.doc.descendants((node, pos) => {
        if (node.type.name !== 'link_source') return
        const { from, to } = state.selection
        if (pos < from && to < pos + node.nodeSize) return false
        sources.push({
          from: pos,
          to: pos + node.nodeSize,
          source: node.textContent,
          original: node.attrs.original,
        })
        return false
      })
      for (const { from, to, source, original } of sources.reverse()) {
        if (!source) {
          tr.delete(from, to)
          edited = true
          continue
        }
        const paragraph =
          parseLinkSource(source, ctx.get(parserCtx), getLinkDefinitionSource(tr.doc)) ??
          (!/[[\]()<>]/.test(source)
            ? state.schema.nodes.paragraph.create(null, state.schema.text(source))
            : null)
        if (!paragraph) continue
        if (source !== original) edited = true
        replaceLinkPresentation(tr, from, to, paragraph.content)
      }

      const open = transactions.some(
        (transaction) => transaction.getMeta(linkEditingKey) === 'open',
      )
      const moved = transactions.some((transaction) => transaction.selectionSet)
      const changed = transactions.some((transaction) => transaction.docChanged)
      const history = transactions.some(isHistoryTransaction)
      const { selection } = tr
      if (
        editorView?.editable !== false &&
        !history &&
        selection.empty &&
        (open || (moved && !changed))
      ) {
        const link = findLinkAt(tr, selection.from)
        if (link && !link.mark.attrs.autoLink && (open || link.from < selection.from)) {
          const mapFrom = tr.steps.length
          const source = openLinkSource(tr, link.from, link.to, ctx.get(serializerCtx))
          const position = tr.mapping.slice(mapFrom).map(selection.from, 1)
          tr.setSelection(
            TextSelection.create(
              tr.doc,
              Math.max(link.from + 1, Math.min(link.from + 1 + source.length, position)),
            ),
          )
          tr.setStoredMarks([])
        }
      }
      if (!tr.docChanged) return null
      tr.setMeta(linkEditingKey, 'updated')
      // 修改后的收起操作并入最近一次输入，保证撤销能恢复地址和标题。
      return edited ? tr : tr.setMeta('addToHistory', false)
    },
  })
})
