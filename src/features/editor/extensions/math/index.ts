import { type Editor } from '@milkdown/kit/core'
import { NodeSelection } from '@milkdown/kit/prose/state'
import { Plugin } from '@milkdown/kit/prose/state'
import { $nodeSchema, $prose, $remark } from '@milkdown/kit/utils'
import markdownItKatex from '@vscode/markdown-it-katex'
import katex from 'katex'
import type MarkdownIt from 'markdown-it'
import remarkMath from 'remark-math'

const mathRemarkPlugin = $remark('lumeMath', () => remarkMath)

function renderMath(value: string, displayMode: boolean) {
  const element = document.createElement(displayMode ? 'div' : 'span')
  element.className = displayMode ? 'lume-math lume-math--block' : 'lume-math lume-math--inline'
  element.dataset.math = value
  katex.render(value, element, {
    displayMode,
    output: 'htmlAndMathml',
    strict: 'ignore',
    throwOnError: false,
  })
  return element
}

const inlineMathSchema = $nodeSchema('math_inline', () => ({
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  attrs: { value: { default: '', validate: 'string' } },
  parseDOM: [{
    tag: 'span[data-math]',
    getAttrs: (dom) => ({ value: dom instanceof HTMLElement ? dom.dataset.math ?? '' : '' }),
  }],
  toDOM: (node) => renderMath(String(node.attrs.value ?? ''), false),
  parseMarkdown: {
    match: (node) => node.type === 'inlineMath',
    runner: (state, node, type) => state.addNode(type, { value: String(node.value ?? '') }),
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_inline',
    runner: (state, node) => state.addNode('inlineMath', undefined, String(node.attrs.value ?? '')),
  },
}))

const blockMathSchema = $nodeSchema('math_block', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  attrs: { value: { default: '', validate: 'string' } },
  parseDOM: [{
    tag: 'div[data-math]',
    getAttrs: (dom) => ({ value: dom instanceof HTMLElement ? dom.dataset.math ?? '' : '' }),
  }],
  toDOM: (node) => renderMath(String(node.attrs.value ?? ''), true),
  parseMarkdown: {
    match: (node) => node.type === 'math',
    runner: (state, node, type) => state.addNode(type, { value: String(node.value ?? '') }),
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => state.addNode('math', undefined, String(node.attrs.value ?? '')),
  },
}))

const mathInputPlugin = $prose((ctx) => new Plugin({
  props: {
    handlePaste(view, event) {
      const source = event.clipboardData?.getData('text/plain').trim() ?? ''
      const blockMatch = source.match(/^\$\$\s*([\s\S]*?\S)\s*\$\$$/)
      if (blockMatch?.[1]) {
        const { $from, empty } = view.state.selection
        if (!empty || !$from.parent.isTextblock || $from.parent.content.size > 0) return false

        event.preventDefault()
        const blockPosition = $from.before()
        const mathNode = blockMathSchema.type(ctx).create({ value: blockMatch[1] })
        const tr = view.state.tr.replaceWith(blockPosition, $from.after(), mathNode)
        view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, blockPosition)).scrollIntoView())
        return true
      }

      const inlineMatch = source.match(/^\$(?!\$|\s)([\s\S]*?\S)\$$/)
      if (!inlineMatch?.[1]) return false

      event.preventDefault()
      const mathNode = inlineMathSchema.type(ctx).create({ value: inlineMatch[1] })
      view.dispatch(view.state.tr.replaceSelectionWith(mathNode).scrollIntoView())
      return true
    },
    handleTextInput(view, from, to, text) {
      if (text !== '$') return false

      const { state } = view
      const { $from } = state.selection
      if (!$from.parent.isTextblock) return false

      const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc') + text
      const blockMatch = textBeforeCursor.match(/^\$\$(?!\s)([\s\S]*?\S)\$\$$/)
      if (blockMatch?.[1] && $from.parentOffset === $from.parent.content.size) {
        const blockPosition = $from.before()
        const mathNode = blockMathSchema.type(ctx).create({ value: blockMatch[1] })
        const tr = state.tr.replaceWith(blockPosition, $from.after(), mathNode)
        view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, blockPosition)).scrollIntoView())
        return true
      }

      const inlineMatch = textBeforeCursor.match(/(^|[^\\$])\$(?!\s)([^$\n]*?\S)\$$/)
      if (!inlineMatch?.[2]) return false

      const delimiterLength = inlineMatch[0].length - inlineMatch[1].length
      const mathNode = inlineMathSchema.type(ctx).create({ value: inlineMatch[2] })
      view.dispatch(state.tr.replaceWith(from - delimiterLength + 1, to, mathNode).scrollIntoView())
      return true
    },
  },
}))

/** 注册数学 Markdown 解析、节点 Schema 和 KaTeX 渲染。 */
export function useMathWysiwygExtension(editor: Editor) {
  return editor
    .use(mathRemarkPlugin)
    .use(inlineMathSchema)
    .use(blockMathSchema)
    .use(mathInputPlugin)
}

/** 注册与 WYSIWYG 相同分隔符规则的 KaTeX Preview 渲染。 */
export function useMathPreviewExtension(markdown: MarkdownIt) {
  return markdown.use(markdownItKatex, {
    katex,
    throwOnError: false,
  })
}
