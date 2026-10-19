import type { Editor } from '@milkdown/kit/core'
import type { Node } from '@milkdown/kit/transformer'
import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import type MarkdownIt from 'markdown-it'
import type { Root } from 'mdast'
import type { Plugin as RemarkPlugin } from 'unified'

declare module 'mdast' {
  interface RootContentMap {
    callout: Omit<Blockquote, 'type'> & { type: 'callout'; alertType: string }
  }
}

export const alertTypes = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const
export const alertPattern = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/
export const alertLabels: Record<string, string> = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
}
export const alertIcons: Record<string, string> = {
  NOTE: 'ⓘ',
  TIP: '◇',
  IMPORTANT: '❕',
  WARNING: '⚠',
  CAUTION: '⊘',
}
type Ast = Node & { children?: Ast[]; value?: string; alertType?: string }
export function transformCallouts(tree: Ast, file?: { value: unknown }) {
  if (tree.type === 'blockquote') {
    const paragraph = tree.children?.[0]
    const text = paragraph?.children?.[0]
    const match =
      paragraph?.type === 'paragraph' && text?.type === 'text'
        ? text.value?.match(alertPattern)
        : null
    const raw =
      file && paragraph?.position
        ? String(file.value).slice(paragraph.position.start.offset, paragraph.position.end.offset)
        : null
    if (match && text && paragraph && (raw === null || alertPattern.test(raw))) {
      tree.type = 'callout'
      tree.alertType = match[1]
      text.value = text.value!.slice(match[0].length)
      if (!text.value) paragraph.children!.shift()
      if (paragraph.children?.[0]?.type === 'break') paragraph.children.shift()
      if (!paragraph.children?.length) tree.children!.shift()
      if (!tree.children?.length) tree.children = [{ type: 'paragraph', children: [] }]
    }
  }
  tree.children?.forEach((child) => transformCallouts(child, file))
}
export const remarkCallouts: RemarkPlugin<[], Root> = function () {
  const data = this.data()
  const extensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = [])
  extensions.push({
    handlers: {
      callout: (node, parent, state, info) => {
        const body = state.handlers.blockquote({ ...node, type: 'blockquote' }, parent, state, info)
        return `> [!${node.alertType}]\n${body}`
      },
    },
  })
  return (tree, file) => transformCallouts(tree as Ast, file)
}
export const calloutRemark = $remark('lumeCallouts', () => remarkCallouts)
export const calloutSchema = $nodeSchema('callout', () => ({
  group: 'block',
  content: 'block+',
  defining: true,
  attrs: { kind: { default: 'NOTE', validate: 'string' } },
  parseDOM: [
    {
      tag: 'div[data-callout]',
      contentElement: '.lume-callout-body',
      getAttrs: (dom: HTMLElement) => ({
        kind: alertTypes.includes(dom.dataset.callout as (typeof alertTypes)[number])
          ? dom.dataset.callout
          : 'NOTE',
      }),
    },
  ],
  toDOM: (node) => [
    'div',
    { 'data-callout': node.attrs.kind, class: 'lume-callout' },
    [
      'div',
      {
        class: 'lume-callout-title',
        contenteditable: 'false',
        'data-marker': `[!${node.attrs.kind}]`,
      },
      ['span', `${alertIcons[node.attrs.kind]} ${alertLabels[node.attrs.kind]}`],
    ],
    ['div', { class: 'lume-callout-body' }, 0],
  ],
  parseMarkdown: {
    match: (node) => node.type === 'callout',
    runner: (state, node, type) => {
      state.openNode(type, { kind: node.alertType })
      state.next(node.children)
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'callout',
    runner: (state, node) => {
      state.openNode('callout', undefined, { alertType: node.attrs.kind })
      state.next(node.content)
      state.closeNode()
    },
  },
}))
export const useCalloutsWysiwygExtension = (editor: Editor) =>
  editor.use(calloutRemark).use(calloutSchema)
export function useCalloutsPreviewExtension(markdown: MarkdownIt) {
  markdown.core.ruler.after('inline', 'callouts', (state) => {
    state.tokens.forEach((token, index) => {
      if (token.type !== 'blockquote_open' || state.tokens[index + 1]?.type !== 'paragraph_open')
        return
      const inline = state.tokens[index + 2]
      const match = inline?.type === 'inline' ? inline.content.match(alertPattern) : null
      if (!match) return
      let depth = 1,
        close = index + 1
      for (; close < state.tokens.length; close++) {
        if (state.tokens[close].type === 'blockquote_open') depth++
        if (state.tokens[close].type === 'blockquote_close' && --depth === 0) break
      }
      token.type = 'callout_open'
      token.meta = { kind: match[1] }
      if (state.tokens[close]) state.tokens[close].type = 'callout_close'
      inline.content = inline.content.slice(match[0].length)
      inline.children = []
      state.md.inline.parse(inline.content, state.md, state.env, inline.children)
      if (!inline.content) {
        state.tokens[index + 1].hidden = true
        state.tokens[index + 3].hidden = true
      }
    })
  })
  markdown.renderer.rules.callout_open = (tokens, i) => {
    const kind = tokens[i].meta.kind as string
    return `<div class="lume-callout" data-callout="${kind}"><div class="lume-callout-title" data-marker="[!${kind}]"><span>${alertIcons[kind]} ${alertLabels[kind]}</span></div><div class="lume-callout-body">\n`
  }
  markdown.renderer.rules.callout_close = () => '</div></div>\n'
  return markdown
}
