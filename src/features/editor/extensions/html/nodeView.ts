import type { Node } from '@milkdown/kit/prose/model'
import { NodeSelection, Selection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { getHtmlResources, isInvisibleHtml, renderHtml } from './policy'

const interactiveSelector = 'a, summary, video, audio, iframe, button, input, select, textarea'

/** HTML 源码存于文档节点中，编辑时的每次输入都参与保存与撤销。 */
export const createHtmlNodeView = (
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
  resolveSource: (source: string) => string | Promise<string>,
  onOpenLink?: (view: EditorView, href: string) => void,
): NodeView => {
  const block = node.type.name === 'html_block'
  const dom = document.createElement(block ? 'div' : 'span')
  dom.className = block ? 'lume-html-block' : 'lume-html-atom'
  dom.contentEditable = 'false'
  let currentNode = node
  let source: HTMLTextAreaElement | null = null
  let preview: HTMLElement | null = null
  let editing = false
  let destroyed = false
  let revision = 0
  const urls = new Map<string, string>()

  const renderPreview = (target: HTMLElement) => {
    const raw = String(currentNode.attrs.value)
    target.hidden = false
    if (isInvisibleHtml(raw)) {
      if (editing) {
        target.replaceChildren()
        target.hidden = true
        return
      }
      const code = document.createElement('code')
      code.textContent = raw
      target.replaceChildren(code)
      target.classList.add('lume-html-invisible')
      return
    }
    target.classList.remove('lume-html-invisible')
    target.innerHTML = renderHtml(raw, {
      editing: true,
      resolveSource: (source) => urls.get(source),
    })
    if (
      !target.childNodes.length ||
      (!target.textContent?.trim() &&
        !target.querySelector('img, video, audio, iframe, svg, hr, br'))
    ) {
      const placeholder = document.createElement('span')
      placeholder.className = 'lume-html-placeholder'
      placeholder.textContent = raw
      target.append(placeholder)
    }
  }
  const loadResources = () => {
    const sequence = ++revision
    const raw = String(currentNode.attrs.value)
    void Promise.all(
      Array.from(getHtmlResources(raw), async (source) => {
        try {
          return [source, await resolveSource(source)] as const
        } catch {
          return null
        }
      }),
    ).then((entries) => {
      if (destroyed || sequence !== revision) return
      for (const entry of entries) if (entry) urls.set(...entry)
      if (preview) renderPreview(preview)
    })
  }
  const render = () => {
    preview = document.createElement(block ? 'div' : 'span')
    preview.className = 'lume-html-preview'
    renderPreview(preview)
    dom.replaceChildren(preview)
    dom.classList.remove('lume-html-editing')
    loadResources()
  }
  const leave = (direction: number) => {
    const pos = getPos()
    if (pos == null || view.isDestroyed) return
    const tr = view.state.tr
    const edge = direction < 0 ? pos : pos + currentNode.nodeSize
    const $edge = tr.doc.resolve(edge)
    const next = Selection.findFrom($edge, direction, true)
    if (next) tr.setSelection(next)
    else if (block) {
      const paragraph = view.state.schema.nodes.paragraph.createAndFill()
      if (paragraph && $edge.parent.canReplaceWith($edge.index(), $edge.index(), paragraph.type)) {
        tr.insert(edge, paragraph)
        tr.setSelection(TextSelection.create(tr.doc, edge + 1))
      }
    } else tr.setSelection(TextSelection.near($edge, direction))
    view.dispatch(tr.scrollIntoView())
    view.focus()
  }
  const finish = (direction?: number) => {
    if (!editing) return
    editing = false
    source = null
    render()
    if (direction) leave(direction)
  }
  const resize = () => {
    if (!source) return
    source.style.height = 'auto'
    source.style.height = `${Math.max(source.scrollHeight, 40)}px`
  }
  const start = () => {
    if (editing || !view.editable || destroyed) return
    editing = true
    source = document.createElement('textarea')
    source.className = 'lume-html-editor'
    source.setAttribute('aria-label', 'HTML 源码')
    source.spellcheck = false
    source.value = String(currentNode.attrs.value)
    source.rows = block ? 3 : 1
    source.addEventListener('input', () => {
      if (!source || !view.editable) return
      const pos = getPos()
      if (pos == null || view.isDestroyed) return
      view.dispatch(view.state.tr.setNodeAttribute(pos, 'value', source.value))
      resize()
    })
    source.addEventListener('keydown', (event) => {
      if (event.isComposing || !source) return
      if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
        event.preventDefault()
        finish(1)
      } else if (
        ((event.key === 'ArrowUp' && source.selectionStart === 0) ||
          (event.key === 'ArrowDown' && source.selectionEnd === source.value.length)) &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault()
        finish(event.key === 'ArrowUp' ? -1 : 1)
      } else if (event.key === 'Tab') {
        event.preventDefault()
        source.setRangeText('  ', source.selectionStart, source.selectionEnd, 'end')
        source.dispatchEvent(new Event('input'))
      }
    })
    source.addEventListener('blur', () => finish())
    const done = document.createElement('button')
    done.type = 'button'
    done.textContent = '完成'
    done.title = 'Ctrl/⌘ + Enter'
    done.addEventListener('mousedown', (event) => event.preventDefault())
    done.addEventListener('click', () => finish(1))
    preview = document.createElement(block ? 'div' : 'span')
    preview.className = 'lume-html-preview'
    renderPreview(preview)
    dom.replaceChildren(source, done, preview)
    dom.classList.add('lume-html-editing')
    requestAnimationFrame(() => {
      if (!destroyed) {
        resize()
        source?.focus()
      }
    })
  }
  dom.addEventListener('lume-edit-html', start)
  dom.addEventListener('click', (event) => {
    if (!(event instanceof MouseEvent)) return
    if (editing) return
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (anchor && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      onOpenLink?.(view, anchor.getAttribute('href') ?? '')
      return
    }
    const interactive = event.target instanceof Element && event.target.closest(interactiveSelector)
    if (interactive && !event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const pos = getPos()
    if (pos == null) return
    start()
    if (view.editable)
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
  })
  render()
  return {
    dom,
    update(updated) {
      if (updated.type !== node.type) return false
      const changed = currentNode.attrs.value !== updated.attrs.value
      currentNode = updated
      if (!changed) return true
      if (editing && source) {
        if (source.value !== updated.attrs.value) source.value = String(updated.attrs.value)
        if (preview) renderPreview(preview)
        loadResources()
      } else render()
      return true
    },
    selectNode() {
      dom.classList.add('ProseMirror-selectednode')
      start()
    },
    deselectNode() {
      dom.classList.remove('ProseMirror-selectednode')
    },
    stopEvent: (event) =>
      (event.target instanceof Element && Boolean(event.target.closest('textarea, button'))) ||
      (event.type !== 'keydown' &&
        event.target instanceof Element &&
        Boolean(event.target.closest(interactiveSelector))),
    ignoreMutation: () => true,
    destroy() {
      destroyed = true
      revision++
    },
  }
}
