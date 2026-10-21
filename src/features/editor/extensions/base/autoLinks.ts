import { DOMSerializer, type Mark, type Node } from '@milkdown/kit/prose/model'
import { isHistoryTransaction } from '@milkdown/kit/prose/history'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose, $remark } from '@milkdown/kit/utils'
import type { Link, Parent, PhrasingContent, Root } from 'mdast'
import { defaultHandlers } from 'mdast-util-to-markdown'
import type { Plugin as RemarkPlugin } from 'unified'
import MarkdownIt from 'markdown-it'
import { watch } from 'vue'
import { markdownPreferences } from '@/app/preferences/useMarkdownPreference'
import type { ReferenceNode } from './linkDefinitions'
import './styles.css'

interface AutoLink extends Parent {
  type: 'lumeAutoLink'
  children: PhrasingContent[]
}

declare module 'mdast' {
  interface PhrasingContentMap {
    lumeAutoLink: AutoLink
  }

  interface RootContentMap {
    lumeAutoLink: AutoLink
  }

  interface Data {
    autoLink?: boolean
  }
}

const autoLinksKey = new PluginKey('lumeAutoLinks')
const linkify = new MarkdownIt().linkify

export const isLinkEnabled = (mark: Mark) =>
  !mark.attrs.autoLink || markdownPreferences.enabled.autoLink

export const remarkAutoLinks: RemarkPlugin<[], Root> = function () {
  const data = this.data()
  const extensions = data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  extensions.push({
    handlers: {
      text: (node, parent, state, info) => {
        const index = parent?.children.indexOf(node) ?? -1
        const previous = index > 0 ? parent?.children[index - 1] : undefined
        const trailing = previous?.type === 'lumeAutoLink' ? node.value.match(/^[*_~]+/)?.[0] : ''
        if (!trailing) return defaultHandlers.text(node, parent, state, info)
        // GFM 裁到裸网址外的尾符保持原文，避免新增反斜杠被重新吞进网址。
        const tracker = state.createTracker(info)
        tracker.move(trailing)
        return (
          trailing +
          defaultHandlers.text(
            { ...node, value: node.value.slice(trailing.length) },
            parent,
            state,
            {
              ...tracker.current(),
              before: info.before + trailing,
              after: info.after,
            },
          )
        )
      },
      lumeAutoLink: (node, _parent, state, info) => {
        // 裸网址不能被序列化成永久的 <url> 或 [url](url)。
        const stack = state.stack
        state.stack = []
        const exit = state.enter('autolink')
        const value = state.containerPhrasing(node, info)
        exit()
        state.stack = stack
        return value
      },
    },
  })
  return (tree, file) => {
    const source = String(file.value)
    const visit = (node: Root | PhrasingContent | Parent) => {
      if (node.type === 'link') {
        const link = node as Link
        const start = link.position?.start.offset
        const raw = start === undefined ? '' : source.slice(start, link.position?.end.offset)
        link.data = {
          ...link.data,
          autoLink:
            !(link as ReferenceNode).data?.reference &&
            !raw.startsWith('[') &&
            !raw.startsWith('<'),
        }
      }
      if ('children' in node) node.children.forEach((child) => visit(child as Parent))
    }
    visit(tree)
  }
}

export const autoLinksRemark = $remark('lumeAutoLinks', () => remarkAutoLinks)

interface LinkRange {
  from: number
  to: number
  href: string
}

interface TextRun {
  from: number
  text: string
  links: LinkRange[]
}

const collectTextRuns = (node: Node, position: number) => {
  const runs: TextRun[] = []
  let current: TextRun | undefined
  node.forEach((child, offset) => {
    const link = child.marks.find((mark) => mark.type.name === 'link')
    if (
      !child.isText ||
      child.marks.some((mark) => mark.type.spec.code) ||
      (link && !link.attrs.autoLink)
    ) {
      current = undefined
      return
    }
    const from = position + 1 + offset
    if (!current) {
      current = { from, text: '', links: [] }
      runs.push(current)
    }
    current.text += child.text ?? ''
    if (!link) return
    const previous = current.links.at(-1)
    if (previous?.to === from && previous.href === link.attrs.href) previous.to += child.nodeSize
    else current.links.push({ from, to: from + child.nodeSize, href: link.attrs.href })
  })
  return runs
}

const findAutoLinks = (run: TextRun): LinkRange[] =>
  (linkify.match(run.text) ?? []).flatMap((match) => {
    if (!/^(?:https?:\/\/|mailto:|www\.)/i.test(match.raw) && !/^[^\s@]+@[^\s@]+$/.test(match.raw))
      return []
    const before = run.text.slice(0, match.index)
    // 正在输入的显式链接和转义网址不参与裸网址补全。
    if (/(?:!?\[[^\]\n]*\]\([^)\n]*|<[^>\n]*)$/.test(before)) return []
    if ((before.match(/\\+$/)?.[0].length ?? 0) % 2) return []
    return [{ from: run.from + match.index, to: run.from + match.lastIndex, href: match.url }]
  })

export const autoLinksPlugin = $prose(() => {
  let editorView: EditorView | null = null
  return new Plugin({
    key: autoLinksKey,
    view(view) {
      editorView = view
      return {
        destroy: () => {
          editorView = null
        },
      }
    },
    props: {
      handleDOMEvents: {
        compositionend(view) {
          queueMicrotask(() => {
            if (!view.isDestroyed)
              view.dispatch(view.state.tr.setMeta(autoLinksKey, 'compositionend'))
          })
          return false
        },
      },
      markViews: {
        link(mark, view) {
          const rendered = DOMSerializer.renderSpec(
            view.dom.ownerDocument,
            mark.type.spec.toDOM!(mark, true),
          )
          const dom = rendered.dom as HTMLElement
          if (!mark.attrs.autoLink) return { dom }
          const href = dom.dataset.autoHref ?? dom.getAttribute('href') ?? ''
          const stop = watch(
            () => markdownPreferences.enabled.autoLink,
            (enabled) => {
              if (enabled) dom.setAttribute('href', href)
              else dom.removeAttribute('href')
              dom.classList.toggle('lume-auto-link--disabled', !enabled)
            },
            { immediate: true, flush: 'sync' },
          )
          return {
            dom,
            ignoreMutation: (mutation) => mutation.type === 'attributes' && mutation.target === dom,
            destroy: stop,
          }
        },
      },
    },
    appendTransaction(transactions, _oldState, state) {
      if (
        editorView?.composing ||
        transactions.some((tr) => tr.getMeta(autoLinksKey) === true || isHistoryTransaction(tr)) ||
        !transactions.some((tr) => tr.docChanged || tr.getMeta(autoLinksKey) === 'compositionend')
      )
        return null
      const changed = new Map<number, Node>()
      if (transactions.some((tr) => tr.getMeta(autoLinksKey) === 'compositionend')) {
        const { $from } = state.selection
        if ($from.parent.isTextblock && !$from.parent.type.spec.code)
          changed.set($from.before(), $from.parent)
      }
      transactions.forEach((transaction, transactionIndex) => {
        transaction.mapping.maps.forEach((map, mapIndex) => {
          map.forEach((_from, _to, start, end) => {
            let from = transaction.mapping.slice(mapIndex + 1).map(start, -1)
            let to = transaction.mapping.slice(mapIndex + 1).map(end, 1)
            for (const later of transactions.slice(transactionIndex + 1)) {
              from = later.mapping.map(from, -1)
              to = later.mapping.map(to, 1)
            }
            state.doc.nodesBetween(
              Math.max(0, from - 1),
              Math.min(state.doc.content.size, to + 1),
              (node, position) => {
                if (!node.isTextblock) return
                if (!node.type.spec.code) changed.set(position, node)
                return false
              },
            )
          })
        })
      })
      const tr = state.tr
      const pasted = transactions.some((transaction) => transaction.getMeta('uiEvent') === 'paste')
      for (const [position, node] of changed) {
        for (const run of collectTextRuns(node, position)) {
          const links = findAutoLinks(run).filter(
            (link) =>
              pasted ||
              !state.selection.empty ||
              state.selection.from < link.from ||
              state.selection.from > link.to ||
              run.links.some((previous) => previous.from < link.to && link.from < previous.to),
          )
          if (
            links.length === run.links.length &&
            links.every((link, index) => {
              const previous = run.links[index]
              return (
                previous?.from === link.from &&
                previous.to === link.to &&
                previous.href === link.href
              )
            })
          )
            continue
          for (const previous of run.links)
            tr.removeMark(previous.from, previous.to, state.schema.marks.link)
          for (const link of links)
            tr.addMark(
              link.from,
              link.to,
              state.schema.marks.link.create({ href: link.href, autoLink: true }),
            )
        }
      }
      return tr.docChanged ? tr.setMeta(autoLinksKey, true) : null
    },
  })
})
