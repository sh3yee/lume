import { language, t } from '@/app/i18n'
import { watch } from 'vue'
import type { Editor } from '@milkdown/kit/core'
import type { Node as AstNode } from '@milkdown/kit/transformer'
import type { Node } from '@milkdown/kit/prose/model'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { $nodeSchema, $prose, $remark } from '@milkdown/kit/utils'
import type MarkdownIt from 'markdown-it'
import type { Plugin as RemarkPlugin } from 'unified'
import type { Root } from 'mdast'

declare module 'mdast' {
  interface RootContentMap {
    toc: { type: 'toc' }
  }
}

type Ast = AstNode & { children?: Ast[]; value?: string }
export const remarkToc: RemarkPlugin<[], Root> = function () {
  const data = this.data()
  const extensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = [])
  extensions.push({ handlers: { toc: () => '[toc]' } })
  return (tree, file) => {
    // Only a standalone, unformatted marker is a directory, never inline code or an escaped marker.
    const walk = (node: Ast) => {
      node.children?.forEach((child) => {
        const raw = String(file.value).slice(
          child.position?.start.offset,
          child.position?.end.offset,
        )
        if (
          child.type === 'paragraph' &&
          child.children?.length === 1 &&
          child.children[0].type === 'text' &&
          /^\[toc\]$/i.test(raw)
        ) {
          child.type = 'toc'
          delete child.children
        } else walk(child)
      })
    }
    walk(tree as Ast)
  }
}
export const tocSchema = $nodeSchema('toc', () => ({
  group: 'block',
  atom: true,
  parseDOM: [{ tag: 'nav[data-toc]' }],
  toDOM: () => ['nav', { 'data-toc': '', class: 'lume-toc', 'aria-label': t('目录') }, t('目录')],
  parseMarkdown: {
    match: (node) => node.type === 'toc',
    runner: (state, _node, type) => state.addNode(type),
  },
  toMarkdown: {
    match: (node) => node.type.name === 'toc',
    runner: (state) => state.addNode('toc'),
  },
}))
export function collectHeadings(doc: Node) {
  const headings: { text: string; level: number; pos: number }[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading')
      headings.push({ text: node.textContent, level: node.attrs.level, pos })
  })
  return headings
}
export const tocView = $prose(
  () =>
    new Plugin({
      props: {
        nodeViews: {
          toc: (_node, view) => {
            const dom = document.createElement('nav')
            dom.className = 'lume-toc'
            dom.dataset.toc = ''
            dom.contentEditable = 'false'
            dom.setAttribute('aria-label', t('目录'))
            const render = () => {
              dom.setAttribute('aria-label', t('目录'))
              const headings = collectHeadings(view.state.doc)
              dom.replaceChildren()
              if (!headings.length) {
                dom.textContent = t('目录 · 添加标题后自动生成')
                return
              }
              headings.forEach((heading) => {
                const button = document.createElement('button')
                button.type = 'button'
                button.textContent = heading.text || t('无标题')
                button.className = `lume-toc-entry md-toc-h${heading.level}`
                button.style.paddingInlineStart = `${(heading.level - 1) * 1.25}em`
                button.addEventListener('click', () => {
                  view.dispatch(
                    view.state.tr
                      .setSelection(TextSelection.create(view.state.doc, heading.pos + 1))
                      .scrollIntoView(),
                  )
                  view.focus()
                })
                dom.append(button)
              })
            }
            // The plugin view below refreshes directories when headings elsewhere change.
            const refresh = () => render()
            dom.addEventListener('lume-toc-refresh', refresh)
            render()
            const stopLanguageWatch = watch(language, render)
            return {
              dom,
              ignoreMutation: () => true,
              stopEvent: (event) =>
                event.target instanceof Element && !!event.target.closest('button'),
              destroy: () => {
                stopLanguageWatch()
                dom.removeEventListener('lume-toc-refresh', refresh)
              },
            }
          },
        },
      },
      view: () => ({
        update(view, previous) {
          if (!view.state.doc.eq(previous.doc))
            view.dom
              .querySelectorAll('[data-toc]')
              .forEach((dom) => dom.dispatchEvent(new Event('lume-toc-refresh')))
        },
      }),
    }),
)
export const useTocWysiwygExtension = (editor: Editor) =>
  editor
    .use($remark('lumeToc', () => remarkToc))
    .use(tocSchema)
    .use(tocView)
export function useTocPreviewExtension(markdown: MarkdownIt) {
  markdown.core.ruler.after('inline', 'toc', (state) => {
    const headings: { text: string; level: number; id: string }[] = []
    state.tokens.forEach((token, i) => {
      if (token.type !== 'heading_open') return
      const inline = state.tokens[i + 1]
      const text =
        inline.children
          ?.map((child) =>
            ['text', 'code_inline', 'image'].includes(child.type)
              ? child.content
              : child.type === 'softbreak'
                ? ' '
                : '',
          )
          .join('') ?? inline.content
      const id = `lume-heading-${headings.length + 1}`
      token.attrSet('id', id)
      headings.push({ text, level: Number(token.tag.slice(1)), id })
    })
    state.tokens.forEach((token, i) => {
      if (token.type !== 'paragraph_open' || !/^\[toc\]$/i.test(state.tokens[i + 1]?.content ?? ''))
        return
      token.hidden = true
      state.tokens[i + 2].hidden = true
      const inline = state.tokens[i + 1]
      inline.type = 'toc'
      inline.meta = headings
    })
  })
  markdown.renderer.rules.toc = (tokens, i) => {
    const headings = tokens[i].meta as { text: string; level: number; id: string }[]
    return `<nav class="lume-toc" data-toc="" aria-label="${t('目录')}">${headings.map((h) => `<a class="lume-toc-entry md-toc-h${h.level}" style="padding-inline-start:${(h.level - 1) * 1.25}em" href="#${h.id}">${markdown.utils.escapeHtml(h.text || t('无标题'))}</a>`).join('') || t('目录 · 添加标题后自动生成')}</nav>\n`
  }
  return markdown
}
