import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'

export interface SearchMatch {
  from: number
  to: number
}

interface SearchPluginState {
  activeIndex: number
  matches: SearchMatch[]
}

const searchPluginKey = new PluginKey<SearchPluginState>('lume-current-document-search')

export function findTextMatches(doc: ProseNode, query: string): SearchMatch[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []

  const matches: SearchMatch[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text.toLocaleLowerCase()
    let index = text.indexOf(needle)
    while (index >= 0) {
      matches.push({ from: pos + index, to: pos + index + needle.length })
      index = text.indexOf(needle, index + Math.max(needle.length, 1))
    }
  })
  return matches
}

export function updateSearchHighlight(
  view: EditorView,
  matches: SearchMatch[],
  activeIndex: number,
) {
  view.dispatch(view.state.tr.setMeta(searchPluginKey, { matches, activeIndex }))
}

export const searchHighlightPlugin = $prose(() => new Plugin<SearchPluginState>({
  key: searchPluginKey,
  state: {
    init: () => ({ matches: [], activeIndex: -1 }),
    apply(tr, value) {
      const next = tr.getMeta(searchPluginKey) as SearchPluginState | undefined
      if (next) return next
      if (!tr.docChanged || value.matches.length === 0) return value
      const matches = value.matches
        .map((match) => ({ from: tr.mapping.map(match.from), to: tr.mapping.map(match.to) }))
        .filter((match) => match.from < match.to)
      return {
        matches,
        activeIndex: matches[value.activeIndex] ? value.activeIndex : matches.length > 0 ? 0 : -1,
      }
    },
  },
  props: {
    decorations(state) {
      const pluginState = searchPluginKey.getState(state)
      if (!pluginState?.matches.length) return DecorationSet.empty
      return DecorationSet.create(state.doc, pluginState.matches.map((match, index) => Decoration.inline(
        match.from,
        match.to,
        { class: index === pluginState.activeIndex ? 'lume-search-match lume-search-match--active' : 'lume-search-match' },
      )))
    },
  },
}))