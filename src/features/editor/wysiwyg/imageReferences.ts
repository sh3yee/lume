import type { EditorView } from '@milkdown/kit/prose/view'
import { replaceMarkdownImageSources } from '@/features/images/services/markdownImageReferences'

export const replaceEditorImageSources = (
  view: EditorView,
  replacements: ReadonlyMap<string, string>,
) => {
  if (view.isDestroyed || !view.editable) return
  const changes: Array<{ pos: number; size: number; attribute: string; value: string }> = []
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') {
      const value = replacements.get(String(node.attrs.src))
      if (value !== undefined) changes.push({ pos, size: node.nodeSize, attribute: 'src', value })
    } else if (node.type.name === 'html' && typeof node.attrs.value === 'string') {
      const value = replaceMarkdownImageSources(node.attrs.value, replacements)
      if (value !== node.attrs.value)
        changes.push({ pos, size: node.nodeSize, attribute: 'value', value })
    }
  })
  const tr = view.state.tr
  for (const { pos, size, attribute, value } of changes.reverse()) {
    if (!value) tr.delete(pos, pos + size)
    else tr.setNodeAttribute(pos, attribute, value)
  }
  if (tr.docChanged) view.dispatch(tr)
}
