import { parserCtx, serializerCtx } from '@milkdown/kit/core'
import type { Node } from '@milkdown/kit/prose/model'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { isHistoryTransaction } from '@milkdown/kit/prose/history'
import { parseHtmlTag } from './remark'
import { prepareHtmlParagraphBreak } from './paragraphBreak'
import { collapseHtmlSource, expandHtmlSource, htmlEditingKey } from './sourceEditing'

export const openHtmlSource = (
  view: EditorView,
  pos: number,
  node: Node,
  serialize: (doc: Node) => string,
  cursor?: number,
) => {
  if (!view.editable) return
  view.dispatch(expandHtmlSource(view.state.tr, pos, node, serialize, cursor).scrollIntoView())
  view.focus()
}

export const htmlInteraction = $prose((ctx) => {
  let editorView: EditorView | null = null
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
  const closeSource = (view: EditorView, pos: number, node: Node, preserveCursor = false) => {
    if (!parseSource(node.textContent)) return false
    // 收起由追加事务完成，并入最近一次输入；不能让一次撤销只切换显示状态。
    const tr = view.state.tr.setSelection(
      preserveCursor
        ? view.state.selection
        : TextSelection.near(view.state.doc.resolve(pos + node.nodeSize)),
    )
    view.dispatch(
      tr.setMeta(htmlEditingKey, { close: pos }).scrollIntoView(),
    )
    return true
  }
  return new Plugin({
    key: htmlEditingKey,
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
          if (node.type.name !== 'html_source') return
          for (const match of node.textContent.matchAll(/<!--[^]*?-->|<\/?[a-z][^<>]*>/gi)) {
            const from = pos + 1 + match.index
            decorations.push(
              Decoration.inline(from, from + match[0].length, { class: 'lume-html-syntax' }),
            )
          }
          return false
        })
        return DecorationSet.create(state.doc, decorations)
      },
      handleDOMEvents: {
        keydown(view, event) {
          if (
            view.editable &&
            !view.composing &&
            !event.isComposing &&
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            const { $from } = view.state.selection
            if ($from.parent.type.name === 'html_source') {
              if (!closeSource(view, $from.before(), $from.parent, true)) {
                event.preventDefault()
                return true
              }
            }
            prepareHtmlParagraphBreak(view.state, view.dispatch)
          }
          // 继续执行已有换段规则，保留列表续项、表格退出等容器行为。
          return false
        },
        mousedown(view, event) {
          if (!view.editable || event.button !== 0 || (!event.ctrlKey && !event.metaKey))
            return false
          const target =
            event.target instanceof Element ? event.target.closest('[data-html-inline]') : null
          if (!target || !view.dom.contains(target)) return false
          if (event.target instanceof Element && event.target.closest('a[href]')) return false
          event.preventDefault()
          const position = view.posAtDOM(target, 0)
          const $pos = view.state.doc.resolve(position)
          const atPosition = view.state.doc.nodeAt(position)
          if (atPosition?.type.name === 'html_inline') {
            openHtmlSource(view, position, atPosition, ctx.get(serializerCtx))
            return true
          }
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
      handleClickOn(view, pos, node, nodePos, event) {
        if (
          !view.editable ||
          view.composing ||
          event.button !== 0 ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          node.type.name !== 'html_inline'
        )
          return false
        openHtmlSource(view, nodePos, node, ctx.get(serializerCtx), pos)
        return true
      },
      handleKeyDown(view, event) {
        if (!view.editable || view.composing || event.isComposing) return false
        const { $from } = view.state.selection
        if ($from.parent.type.name !== 'html_source') return false
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
          closeSource(view, $from.before(), $from.parent)
          return true
        }
        if (
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          ((event.key === 'ArrowLeft' && $from.parentOffset === 0) ||
            (event.key === 'ArrowRight' && $from.parentOffset === $from.parent.content.size))
        ) {
          const pos = event.key === 'ArrowLeft' ? $from.before() : $from.after()
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
          return true
        }
        return false
      },
    },
    appendTransaction(transactions, _old, state) {
      if (editorView?.composing || !transactions.some((tr) => tr.selectionSet)) return null
      const tr = state.tr
      const sources: { pos: number; node: Node }[] = []
      state.doc.descendants((node, pos) => {
        if (
          node.type.name === 'html_source' &&
          (!(state.selection.from > pos && state.selection.to < pos + node.nodeSize) ||
            transactions.some((transaction) => transaction.getMeta(htmlEditingKey)?.close === pos))
        )
          sources.push({ node, pos })
      })
      let edited = false
      for (const { node, pos } of sources.reverse()) {
        const content = parseSource(node.textContent)
        if (content) {
          collapseHtmlSource(tr, pos, node, content)
          if (node.textContent !== node.attrs.original) edited = true
        }
      }
      if (
        editorView?.editable !== false &&
        editorView?.hasFocus() &&
        tr.selection.empty &&
        !transactions.some(
          (transaction) =>
            transaction.docChanged ||
            transaction.getMeta(htmlEditingKey) ||
            isHistoryTransaction(transaction),
        )
      ) {
        const { $from } = tr.selection
        for (let depth = 1; depth <= $from.depth; depth++) {
          const node = $from.node(depth)
          if (node.type.name !== 'html_inline') continue
          expandHtmlSource(tr, $from.before(depth), node, ctx.get(serializerCtx), $from.pos)
          break
        }
      }
      if (!tr.docChanged) return null
      tr.setMeta(htmlEditingKey, true).setMeta('addToHistory', edited)
      return tr
    },
  })
})
