import { NodeSelection, TextSelection, type Command } from '@milkdown/kit/prose/state'
import { findFootnoteReference, getFootnoteDefinitions, normalizeFootnoteLabel } from './references'

export const goToFootnoteDefinition =
  (label: string): Command =>
  (state, dispatch) => {
    const definition = getFootnoteDefinitions(state.doc).get(normalizeFootnoteLabel(label))
    if (!definition) return false
    dispatch?.(
      state.tr
        .setSelection(TextSelection.near(state.doc.resolve(definition.pos + 1)))
        .scrollIntoView(),
    )
    return true
  }

export const goToFootnoteReference =
  (label: string): Command =>
  (state, dispatch) => {
    const reference = findFootnoteReference(state.doc, label)
    if (!reference) return false
    dispatch?.(
      state.tr.setSelection(NodeSelection.create(state.doc, reference.pos)).scrollIntoView(),
    )
    return true
  }
