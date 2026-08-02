import { nextTick, ref } from 'vue'
import { editorViewCtx, type Editor } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import {
  findTextMatches,
  updateSearchHighlight,
  type SearchMatch,
} from '../extensions/search'

export function useFindReplace(options: {
  closeOverlays: () => void
  focusWidget: (select: boolean) => void
  getEditor: () => Editor | null
}) {
  const findReplaceOpen = ref(false)
  const findMatches = ref<SearchMatch[]>([])
  const activeFindMatchIndex = ref(-1)
  let activeFindQuery = ''

  const updateHighlight = (
    view: EditorView,
    matches = findMatches.value,
    activeIndex = activeFindMatchIndex.value,
  ) => {
    updateSearchHighlight(view, matches, activeIndex)
  }

  const syncFindMatches = (
    view: EditorView,
    query = activeFindQuery,
    preferredIndex = activeFindMatchIndex.value,
  ) => {
    activeFindQuery = query
    const matches = findTextMatches(view.state.doc, query)
    const activeIndex = matches.length === 0 ? -1 : Math.max(0, Math.min(preferredIndex, matches.length - 1))
    findMatches.value = matches
    activeFindMatchIndex.value = activeIndex
    updateHighlight(view, matches, activeIndex)
    return { activeIndex, matches }
  }

  const selectFindMatch = (view: EditorView, index: number) => {
    const match = findMatches.value[index]
    if (!match) return
    activeFindMatchIndex.value = index
    updateHighlight(view, findMatches.value, index)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)).scrollIntoView())
  }

  const openFindReplace = (select = true) => {
    findReplaceOpen.value = true
    options.closeOverlays()
    options.getEditor()?.action((ctx) => syncFindMatches(ctx.get(editorViewCtx)))
    void nextTick(() => options.focusWidget(select))
  }

  const closeFindReplace = () => {
    findReplaceOpen.value = false
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      findMatches.value = []
      activeFindMatchIndex.value = -1
      updateHighlight(view, [], -1)
      view.focus()
    })
  }

  const moveFindMatch = (direction: 1 | -1, query = activeFindQuery) => {
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { matches } = syncFindMatches(view, query)
      if (matches.length === 0) return
      const nextIndex = (activeFindMatchIndex.value + direction + matches.length) % matches.length
      selectFindMatch(view, nextIndex)
      view.focus()
    })
  }

  const handleFindQueryInput = (query: string) => {
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { activeIndex } = syncFindMatches(view, query, 0)
      if (activeIndex >= 0) selectFindMatch(view, activeIndex)
    })
  }

  const replaceCurrentMatch = (query: string, replacement: string) => {
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { matches, activeIndex } = syncFindMatches(view, query)
      const match = matches[activeIndex]
      if (!match) return
      const tr = view.state.tr.insertText(replacement, match.from, match.to)
      view.dispatch(tr.scrollIntoView())
      const nextMatches = findTextMatches(view.state.doc, query)
      const nextIndex = nextMatches.length === 0 ? -1 : Math.min(activeIndex, nextMatches.length - 1)
      findMatches.value = nextMatches
      activeFindMatchIndex.value = nextIndex
      updateHighlight(view, nextMatches, nextIndex)
      if (nextIndex >= 0) selectFindMatch(view, nextIndex)
    })
  }

  const replaceAllMatches = (query: string, replacement: string) => {
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { matches } = syncFindMatches(view, query)
      if (matches.length === 0) return
      const tr = matches.reduceRight(
        (transaction, match) => transaction.insertText(replacement, match.from, match.to),
        view.state.tr,
      )
      view.dispatch(tr.scrollIntoView())
      findMatches.value = []
      activeFindMatchIndex.value = -1
      updateHighlight(view, [], -1)
    })
  }

  return {
    activeFindMatchIndex,
    closeFindReplace,
    findMatches,
    findReplaceOpen,
    handleFindQueryInput,
    moveFindMatch,
    openFindReplace,
    replaceAllMatches,
    replaceCurrentMatch,
    syncFindMatches,
  }
}