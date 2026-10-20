import { remarkCtx } from '@milkdown/kit/core'
import type { Node } from '@milkdown/kit/prose/model'
import {
  NodeSelection,
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from '@milkdown/kit/prose/state'
import { $prose } from '@milkdown/kit/utils'
import type { EditorView } from '@milkdown/kit/prose/view'
import { inlineHtmlTags } from './policy'
import { parseHtmlTag, transformHtml, type HtmlAst } from './remark'

interface HtmlInputState {
  transform: Transaction
  from: number
  to: number
  text: string
}
const htmlInputKey = new PluginKey<HtmlInputState | null>('lumeHtmlInput')

// 已解析但未闭合的标签仍参与配对；其他行内节点只占一个占位字符。
const getSyntaxText = (node: Node) =>
  node.isText
    ? node.text!
    : node.type.name === 'html' && parseHtmlTag(String(node.attrs.value))
      ? String(node.attrs.value)
      : '\ufffc'

const getText = (parent: Node) => {
  let text = ''
  parent.forEach((node) => {
    text += getSyntaxText(node)
  })
  return text
}

const textOffsetToPosition = (parent: Node, offset: number) => {
  let textOffset = 0
  let position = parent.content.size
  parent.forEach((node, pos) => {
    const length = getSyntaxText(node).length
    if (offset >= textOffset && offset <= textOffset + length)
      position =
        pos + (node.isText ? offset - textOffset : offset === textOffset ? 0 : node.nodeSize)
    textOffset += length
  })
  return position
}

export const htmlInputPlugin = $prose((ctx) => {
  let compositionTimer: ReturnType<typeof setTimeout> | undefined
  const convertInput = (state: EditorState, from: number, to: number, text: string) => {
    if (state.doc.resolve(from).parent.type.spec.code) return null
    // 先在同一事务中补入本次输入，再解析真实文档位置，兼容单字、批量和输入法提交。
    const tr = state.tr
    if (text) tr.insertText(text, from, to)
    const end = from + text.length
    const $end = tr.doc.resolve(end)
    const prefix = 'text '
    const source = prefix + getText($end.parent)
    if (!source.includes('<') || !source.includes('>')) return null
    const tree = ctx.get(remarkCtx).parse(source) as HtmlAst
    transformHtml(tree, source)
    const positionAt = (offset: number) =>
      $end.start() + textOffsetToPosition($end.parent, offset - prefix.length)
    const candidates: {
      html: HtmlAst
      start: number
      end: number
      contentStart: number
      contentEnd: number
    }[] = []
    const collect = (html: HtmlAst, nested = false) => {
      const offset = html.position?.start.offset
      const limit = html.position?.end.offset
      if (['htmlInline', 'html'].includes(html.type) && offset != null && limit != null) {
        if (offset < prefix.length) return
        const start = positionAt(offset)
        const finish = positionAt(limit)
        if (!nested && !(text ? finish > from && start < end : start < end && finish >= end)) return
        html.children?.forEach((child) => collect(child, true))
        candidates.push({
          html,
          start,
          end: finish,
          contentStart: positionAt(offset + (html.open?.length ?? 0)),
          contentEnd: positionAt(limit - (html.close?.length ?? 0)),
        })
        return
      }
      html.children?.forEach((child) => collect(child, nested))
    }
    collect(tree)
    const inputStepCount = tr.steps.length
    let converted = false
    for (const candidate of candidates) {
      const mapping = tr.mapping.slice(inputStepCount)
      const start = mapping.map(candidate.start, 1)
      const finish = mapping.map(candidate.end, -1)
      const html = candidate.html
      let protectedSyntax = false
      tr.doc.nodesBetween(start, finish, (node) => {
        if (node.marks.some((mark) => mark.type.spec.code)) protectedSyntax = true
      })
      if (protectedSyntax) continue
      if (html.type === 'htmlInline') {
        const open = html.open ?? ''
        const close = html.close ?? ''
        const content = tr.doc.slice(
          mapping.map(candidate.contentStart, 1),
          mapping.map(candidate.contentEnd, -1),
        ).content
        const node = state.schema.nodes.html_inline.create({ open, close }, content)
        tr.replaceWith(start, finish, node)
        converted = true
        continue
      }
      const raw = html.value ?? ''
      const tag = parseHtmlTag(raw)
      if (tag && (tag.closing || !tag.void)) continue
      const name = raw.match(/^<([a-z][\w:-]*)/i)?.[1].toLowerCase()
      const block = Boolean(name && !inlineHtmlTags.has(name)) || raw.startsWith('<!--')
      if (block && start === $end.start() && finish === $end.end() && $end.depth === 1) {
        const pos = $end.start() - 1
        tr.replaceWith(pos, $end.end() + 1, state.schema.nodes.html_block.create({ value: raw }))
        return tr.setSelection(NodeSelection.create(tr.doc, pos))
      }
      tr.replaceWith(start, finish, state.schema.nodes.html.create({ value: raw }))
      converted = true
    }
    return converted ? tr.setStoredMarks(state.storedMarks ?? []) : null
  }
  const convertDomInput = (view: EditorView) => {
    clearTimeout(compositionTimer)
    // WebView / 输入法可能先更新 DOM，等 ProseMirror 同步文档后再检查闭合标签。
    compositionTimer = setTimeout(() => {
      if (view.isDestroyed || !view.editable || view.composing || !view.state.selection.empty)
        return
      const pos = view.state.selection.from
      const tr = convertInput(view.state, pos, pos, '')
      if (tr)
        view.dispatch(tr.setMeta(htmlInputKey, { transform: tr, from: pos, to: pos, text: '' }))
    }, 0)
    return false
  }
  return new Plugin<HtmlInputState | null>({
    key: htmlInputKey,
    isInputRules: true,
    state: {
      init: () => null,
      apply: (tr, previous) =>
        tr.getMeta(htmlInputKey) ?? (tr.docChanged || tr.selectionSet ? null : previous),
    },
    view() {
      return { destroy: () => clearTimeout(compositionTimer) }
    },
    props: {
      handleTextInput(view, from, to, text) {
        if (!view.editable || view.composing) return false
        const tr = convertInput(view.state, from, to, text)
        if (!tr) return false
        view.dispatch(tr.setMeta(htmlInputKey, { transform: tr, from, to, text }))
        return true
      },
      handleDOMEvents: {
        input: convertDomInput,
        compositionend: convertDomInput,
      },
    },
  })
})
