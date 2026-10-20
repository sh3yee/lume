import type { Node } from '@milkdown/kit/transformer'
import { $remark } from '@milkdown/kit/utils'
import type { Root } from 'mdast'
import type { Plugin as RemarkPlugin } from 'unified'
import { inlineHtmlTags, voidHtmlTags } from './policy'

declare module 'mdast' {
  interface PhrasingContentMap {
    htmlInline: Omit<Paragraph, 'type'> & { type: 'htmlInline'; open: string; close: string }
  }
  interface RootContentMap {
    htmlInline: PhrasingContentMap['htmlInline']
    htmlBlock: Omit<Html, 'type'> & { type: 'htmlBlock' }
  }
}

export type HtmlAst = Node & {
  children?: HtmlAst[]
  value?: string
  open?: string
  close?: string
  block?: boolean
}
export const parseHtmlTag = (source: string) => {
  const close = source.match(/^<\/([a-z][\w:-]*)\s*>$/i)
  if (close) return { name: close[1].toLowerCase(), closing: true, void: false }
  const open = source.match(/^<([a-z][\w:-]*)(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\s*\/?>$/i)
  if (!open) return null
  const name = open[1].toLowerCase()
  return { name, closing: false, void: voidHtmlTags.has(name) || /\/\s*>$/.test(source) }
}

const blockContainers = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition', 'callout'])

/** 在 Markdown AST 上配对标签，行内保留 Markdown 子节点，块级保留原始源码。 */
export const transformHtml = (tree: HtmlAst, source = '') => {
  if (!tree.children) return
  const block = blockContainers.has(tree.type)
  const children: HtmlAst[] = []
  const stack: { node: HtmlAst; name: string; children: HtmlAst[] }[] = []
  const append = (nodes: HtmlAst[]) => (stack.at(-1)?.children ?? children).push(...nodes)
  for (const child of tree.children) {
    if (child.type !== 'html') {
      transformHtml(child, source)
      append([child])
      continue
    }
    if (block) {
      append([{ ...child, type: 'htmlBlock' }])
      continue
    }
    const tag = parseHtmlTag(child.value ?? '')
    if (tag && !tag.closing && !tag.void) {
      stack.push({ node: child, name: tag.name, children: [] })
      continue
    }
    if (tag?.closing && stack.at(-1)?.name === tag.name) {
      const frame = stack.pop()!
      const position =
        frame.node.position && child.position
          ? { start: frame.node.position.start, end: child.position.end }
          : undefined
      if (inlineHtmlTags.has(tag.name)) {
        append([
          {
            type: 'htmlInline',
            open: frame.node.value,
            close: child.value,
            children: frame.children,
            position,
          },
        ])
      } else {
        const start = position?.start.offset
        const end = position?.end.offset
        append([
          {
            type: 'html',
            value:
              start != null && end != null
                ? source.slice(start, end)
                : `${frame.node.value}${frame.children.map((node) => node.value ?? '').join('')}${child.value}`,
            position,
            block: true,
          },
        ])
      }
      continue
    }
    append([{ ...child, block: Boolean(tag && !inlineHtmlTags.has(tag.name)) }])
  }
  while (stack.length) {
    const frame = stack.pop()!
    append([frame.node, ...frame.children])
  }
  tree.children = children
  if (
    tree.type === 'paragraph' &&
    children.length === 1 &&
    children[0].type === 'html' &&
    children[0].block
  ) {
    tree.type = 'htmlBlock'
    tree.value = children[0].value
    delete tree.children
  }
}

export const remarkHtml: RemarkPlugin<[], Root> = function () {
  const data = this.data()
  const extensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = [])
  extensions.push({
    handlers: {
      htmlInline: (node, _parent, state, info) => {
        const tracker = state.createTracker(info)
        tracker.move(node.open)
        return `${node.open}${state.containerPhrasing(node, { ...tracker.current(), before: '>', after: '<' })}${node.close}`
      },
      htmlBlock: (node) => node.value,
    },
  })
  return (tree, file) => transformHtml(tree as HtmlAst, String(file.value))
}

export const htmlRemark = $remark('lumeHtml', () => remarkHtml)
