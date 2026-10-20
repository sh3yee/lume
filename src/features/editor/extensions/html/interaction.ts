import { parserCtx, serializerCtx } from '@milkdown/kit/core'
import type { Node } from '@milkdown/kit/prose/model'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { parseHtmlTag } from './remark'

export const openHtmlSource = (
  view: EditorView,
  pos: number,
  node: Node,
  serialize: (doc: Node) => string,
) => {
  if (!view.editable) return
  const paragraph = view.state.schema.nodes.paragraph.create(null, node)
  const source = serialize(view.state.schema.nodes.doc.create(null, paragraph)).replace(/\n$/, '')
  const sourceNode = view.state.schema.nodes.html_source.create(
    null,
    view.state.schema.text(source),
  )
  const tr = view.state.tr.replaceWith(pos, pos + node.nodeSize, sourceNode)
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView())
  view.focus()
}

export const htmlInteraction = $prose((ctx) => {
  const parseSource = (source: string) => {
    try {
      const parsed = ctx.get(parserCtx)(source)
      const paragraph = parsed.firstChild
      if (parsed.childCount !== 1 || paragraph?.type.name !== 'paragraph') return null
      let complete = !source.trimStart().startsWith('<')
      let unfinished = false
      paragraph.descendants((node) => {
        if (node.type.name === 'html_inline') complete = true
        if (node.type.name !== 'html') return
        const raw = String(node.attrs.value)
        const tag = parseHtmlTag(raw)
        if (tag && (tag.closing || !tag.void)) unfinished = true
        else complete = true
      })
      return complete && !unfinished ? paragraph.content : null
    } catch {
      // 未补全的 HTML 继续保留源码，不能在收起时丢失或转义用户输入。
      return null
    }
  }
  const closeSource = (view: EditorView, pos: number, node: Node) => {
    const content = parseSource(node.textContent)
    if (!content || content.eq(node.content)) return false
    const tr = view.state.tr.replaceWith(pos, pos + node.nodeSize, content)
    view.dispatch(
      tr.setSelection(TextSelection.near(tr.doc.resolve(pos + content.size))).scrollIntoView(),
    )
    return true
  }
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          if (!view.editable || event.button !== 0 || (!event.ctrlKey && !event.metaKey))
            return false
          const target =
            event.target instanceof Element ? event.target.closest('[data-html-inline]') : null
          if (!target || !view.dom.contains(target)) return false
          event.preventDefault()
          const $pos = view.state.doc.resolve(view.posAtDOM(target, 0))
          for (let depth = $pos.depth; depth > 0; depth--) {
            const node = $pos.node(depth)
            if (node.type.name !== 'html_inline') continue
            openHtmlSource(view, $pos.before(depth), node, ctx.get(serializerCtx))
            break
          }
          return true
        },
        blur(view) {
          if (!view.editable) return false
          const sources: { pos: number; node: Node }[] = []
          view.state.doc.descendants((node, pos) => {
            if (node.type.name === 'html_source') sources.push({ node, pos })
          })
          for (const source of sources.reverse()) closeSource(view, source.pos, source.node)
          return false
        },
      },
      handleKeyDown(view, event) {
        if (!view.editable || event.isComposing) return false
        const { $from } = view.state.selection
        if ($from.parent.type.name !== 'html_source') return false
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
          closeSource(view, $from.before(), $from.parent)
          return true
        }
        return false
      },
    },
    appendTransaction(transactions, _old, state) {
      if (!transactions.some((tr) => tr.selectionSet)) return null
      const tr = state.tr
      const sources: { pos: number; node: Node }[] = []
      state.doc.descendants((node, pos) => {
        if (
          node.type.name === 'html_source' &&
          !(state.selection.from > pos && state.selection.to < pos + node.nodeSize)
        )
          sources.push({ node, pos })
      })
      for (const { node, pos } of sources.reverse()) {
        const content = parseSource(node.textContent)
        if (content) tr.replaceWith(pos, pos + node.nodeSize, content)
      }
      return tr.docChanged ? tr : null
    },
  })
})
