import type { Node } from '@milkdown/kit/prose/model'
import { closeHistory } from '@milkdown/kit/prose/history'
import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { $view } from '@milkdown/kit/utils'
import { getFootnoteDefinitions, normalizeFootnoteLabel } from './references'
import {
  editableFootnoteReferenceSchema,
  getFootnoteReferenceSource,
  parseFootnoteReferenceSource,
} from './schema'

export const createFootnoteReferenceView = (
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView => {
  const dom = document.createElement('sup')
  dom.dataset.type = 'footnote_reference'
  dom.contentEditable = 'false'
  let currentNode = node
  let source: HTMLInputElement | null = null
  let editing = false
  let selected = false
  let edited = false
  let destroyed = false
  let focusFrame = 0

  const render = () => {
    dom.dataset.label = String(currentNode.attrs.label)
    dom.classList.remove('lume-footnote--editing')
    dom.classList.toggle('lume-footnote--raw', typeof currentNode.attrs.source === 'string')
    dom.textContent = currentNode.attrs.source ?? currentNode.attrs.label
  }

  const sync = () => {
    const pos = getPos()
    if (!source || pos == null || view.isDestroyed) return
    if (!view.editable) {
      source.value = getFootnoteReferenceSource(currentNode)
      return
    }
    source.size = Math.max(4, source.value.length + 1)
    const label = parseFootnoteReferenceSource(source.value)
    const attrs = {
      ...currentNode.attrs,
      label: label ?? currentNode.attrs.label,
      source: label ? null : source.value,
    }
    if (attrs.label !== currentNode.attrs.label || attrs.source !== currentNode.attrs.source) {
      const tr = edited ? view.state.tr : closeHistory(view.state.tr)
      edited = true
      // 仅更新属性，避免替换叶节点导致 NodeSelection 丢失并提前收起源码。
      if (attrs.label !== currentNode.attrs.label) tr.setNodeAttribute(pos, 'label', attrs.label)
      if (attrs.source !== currentNode.attrs.source)
        tr.setNodeAttribute(pos, 'source', attrs.source)
      view.dispatch(tr)
    }
  }

  const finish = (direction?: -1 | 1) => {
    if (!editing || !source) return
    sync()
    const value = source.value
    editing = false
    source = null
    cancelAnimationFrame(focusFrame)
    const pos = getPos()
    if (pos == null || view.isDestroyed) return
    const label = parseFootnoteReferenceSource(value)
    const resolved =
      label && getFootnoteDefinitions(view.state.doc).has(normalizeFootnoteLabel(label))
    const tr = closeHistory(view.state.tr)
    if (!resolved && view.editable) {
      const text = value ? view.state.schema.text(value, currentNode.marks) : []
      tr.replaceWith(pos, pos + currentNode.nodeSize, text)
      if (direction)
        tr.setSelection(TextSelection.create(tr.doc, direction < 0 ? pos : pos + value.length))
    } else if (direction) {
      tr.setSelection(
        TextSelection.create(tr.doc, direction < 0 ? pos : pos + currentNode.nodeSize),
      )
    }
    render()
    view.dispatch(tr.scrollIntoView())
    if (direction) view.focus()
  }

  const start = () => {
    selected = true
    dom.classList.add('ProseMirror-selectednode')
    if (editing || destroyed || !view.editable) return
    editing = true
    edited = false
    source = document.createElement('input')
    source.type = 'text'
    source.className = 'lume-footnote-source'
    source.value = getFootnoteReferenceSource(currentNode)
    source.size = Math.max(4, source.value.length + 1)
    source.spellcheck = false
    source.setAttribute('aria-label', '编辑脚注引用源码')
    source.addEventListener('input', sync)
    source.addEventListener('blur', () => finish())
    source.addEventListener('keydown', (event) => {
      if (event.isComposing || !source) return
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault()
        finish(1)
      } else if (
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        source.selectionStart === source.selectionEnd &&
        ((event.key === 'ArrowLeft' && source.selectionStart === 0) ||
          (event.key === 'ArrowRight' && source.selectionEnd === source.value.length))
      ) {
        event.preventDefault()
        finish(event.key === 'ArrowLeft' ? -1 : 1)
      }
    })
    dom.classList.add('lume-footnote--editing')
    dom.replaceChildren(source)
    focusFrame = requestAnimationFrame(() => {
      if (!source || view.isDestroyed) return
      source.focus()
      const end = Math.max(0, source.value.length - 1)
      source.setSelectionRange(Math.min(2, end), end)
    })
  }

  render()
  return {
    dom,
    selectNode: start,
    deselectNode() {
      selected = false
      dom.classList.remove('ProseMirror-selectednode')
      // ProseMirror 正在同步选区，待本轮更新结束后再收起源码。
      queueMicrotask(() => {
        if (!selected && !destroyed) finish()
      })
    },
    update(updated) {
      if (updated.type !== node.type) return false
      currentNode = updated
      dom.dataset.label = String(updated.attrs.label)
      if (!editing) render()
      else if (source && source.value !== getFootnoteReferenceSource(updated)) {
        source.value = getFootnoteReferenceSource(updated)
        source.size = Math.max(4, source.value.length + 1)
      }
      return true
    },
    stopEvent: (event) => Boolean(source && event.target === source),
    ignoreMutation: () => true,
    destroy() {
      destroyed = true
      editing = false
      source = null
      cancelAnimationFrame(focusFrame)
    },
  }
}

export const footnoteReferenceView = $view(
  editableFootnoteReferenceSchema.node,
  () => createFootnoteReferenceView,
)
