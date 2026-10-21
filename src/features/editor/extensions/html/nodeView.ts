import type { Node } from '@milkdown/kit/prose/model'
import { NodeSelection, Selection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { deleteHtmlNode } from './commands'
import { getHtmlResources, isInvisibleHtml, renderHtml } from './policy'
import { createHtmlSourceEditor } from './sourceEditor'
import { htmlEditingKey } from './sourceEditing'

const interactiveSelector = 'a, summary, video, audio, iframe, button, input, select, textarea'

/** 源码与预览使用独立容器，避免切换编辑状态时重载 iframe。 */
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
  dom.tabIndex = 0
  dom.setAttribute('aria-label', 'HTML，按 Enter 编辑源码')
  const tools = document.createElement('span')
  tools.className = 'lume-html-tools'
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.textContent = 'HTML'
  toggle.className = 'lume-html-source-toggle'
  const sourceHost = document.createElement(block ? 'div' : 'span')
  sourceHost.className = 'lume-html-editor'
  sourceHost.hidden = true
  const preview = document.createElement(block ? 'div' : 'span')
  preview.className = 'lume-html-preview'
  tools.append(toggle)
  dom.append(tools, sourceHost, preview)
  let currentNode = node
  let source: ReturnType<typeof createHtmlSourceEditor> | null = null
  let editing = false
  let selected = false
  let destroyed = false
  let revision = 0
  let rendered = ''
  let renderTimer: ReturnType<typeof setTimeout> | undefined
  let blurTimer: ReturnType<typeof setTimeout> | undefined
  let focusFrame = 0
  const urls = new Map<string, string>()

  const updateControls = () => {
    toggle.disabled = !view.editable
    toggle.title = editing ? '收起 HTML 源码（Ctrl / Cmd + Enter）' : '编辑 HTML 源码'
    toggle.setAttribute('aria-label', toggle.title)
    toggle.setAttribute('aria-expanded', String(editing))
    dom.classList.toggle('lume-html-editing', editing)
    sourceHost.hidden = !editing
  }
  const renderPreview = () => {
    const raw = String(currentNode.attrs.value)
    const invisible = isInvisibleHtml(raw)
    preview.hidden = invisible && editing
    preview.classList.toggle('lume-html-invisible', invisible)
    const key = invisible
      ? raw
      : renderHtml(raw, {
          editing: true,
          resolveSource: (source) => urls.get(source),
        })
    // 展开和收起源码时保留预览节点，避免中断媒体和嵌入页面。
    if (rendered === key && preview.childNodes.length) return
    rendered = key
    if (invisible) {
      dom.classList.remove('lume-html-embedded')
      const code = document.createElement('code')
      code.textContent = raw
      preview.replaceChildren(code)
      return
    }
    preview.innerHTML = key
    if (
      !preview.textContent?.trim() &&
      !preview.querySelector('img, video, audio, iframe, svg, hr, br')
    ) {
      const placeholder = document.createElement('span')
      placeholder.className = 'lume-html-placeholder'
      placeholder.textContent = raw
      preview.append(placeholder)
    }
    dom.classList.toggle(
      'lume-html-embedded',
      Boolean(preview.querySelector('iframe, video, audio')),
    )
  }
  const loadResources = () => {
    const sequence = ++revision
    const resources = Array.from(getHtmlResources(String(currentNode.attrs.value)))
    if (!resources.length) return
    void Promise.all(
      resources.map(async (resource) => {
        try {
          return [resource, await resolveSource(resource)] as const
        } catch {
          return null
        }
      }),
    ).then((entries) => {
      if (destroyed || sequence !== revision) return
      for (const entry of entries) if (entry) urls.set(...entry)
      renderPreview()
    })
  }
  const refreshPreview = () => {
    clearTimeout(renderTimer)
    renderPreview()
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
  const handleSourceChange = (value: string) => {
    if (destroyed) return
    const pos = getPos()
    if (pos == null || view.isDestroyed || !view.editable) return
    if (!value.trim()) {
      const tr = deleteHtmlNode(view.state, pos)
      if (!tr) return
      const focused = dom.contains(dom.ownerDocument.activeElement)
      if (!focused)
        tr.setSelection(view.state.selection.getBookmark().map(tr.mapping).resolve(tr.doc))
      view.dispatch(focused ? tr.scrollIntoView() : tr)
      if (focused) view.focus()
      return
    }
    view.dispatch(view.state.tr.setNodeAttribute(pos, 'value', value))
  }
  const finish = (direction?: number) => {
    if (!editing) return
    if (source && !source.editor.compositionStarted && !source.editor.state.doc.toString().trim()) {
      handleSourceChange(source.editor.state.doc.toString())
      if (destroyed) return
    }
    editing = false
    cancelAnimationFrame(focusFrame)
    source?.destroy()
    source = null
    sourceHost.replaceChildren()
    updateControls()
    refreshPreview()
    if (direction) leave(direction)
  }
  const start = () => {
    if (editing || !view.editable || destroyed) return
    editing = true
    updateControls()
    renderPreview()
    const value = String(currentNode.attrs.value)
    const entry = htmlEditingKey.getState(view.state)
    source = createHtmlSourceEditor(
      sourceHost,
      value,
      view,
      handleSourceChange,
      finish,
      entry?.pos === getPos() && entry.atEnd ? value.length : 0,
    )
    focusFrame = requestAnimationFrame(() => {
      if (!destroyed && editing) source?.editor.focus()
    })
  }
  const selectAndStart = () => {
    const pos = getPos()
    if (pos == null || !view.editable) return
    view.dispatch(
      view.state.tr
        .setSelection(NodeSelection.create(view.state.doc, pos))
        .setMeta(htmlEditingKey, { sourceCursor: 'start' }),
    )
    start()
  }
  toggle.addEventListener('mousedown', (event) => event.preventDefault())
  toggle.addEventListener('click', (event) => {
    event.stopPropagation()
    if (editing) finish(1)
    else selectAndStart()
  })
  dom.addEventListener('lume-edit-html', selectAndStart)
  dom.addEventListener('focus', (event) => {
    if (event.target === dom) selectAndStart()
  })
  dom.addEventListener('focusout', () => {
    clearTimeout(blurTimer)
    blurTimer = setTimeout(() => {
      if (!destroyed && !dom.contains(dom.ownerDocument.activeElement)) finish()
    }, 0)
  })
  dom.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent)) return
    if (event.target !== dom || event.isComposing || event.key !== 'Enter') return
    event.preventDefault()
    selectAndStart()
  })
  dom.addEventListener('click', (event) => {
    if (!(event instanceof MouseEvent)) return
    if (editing || !(event.target instanceof Element)) return
    const anchor = event.target.closest('a[href]')
    if (anchor && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      onOpenLink?.(view, anchor.getAttribute('href') ?? '')
      return
    }
    if (event.target.closest(interactiveSelector) && !event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    selectAndStart()
  })
  updateControls()
  refreshPreview()
  return {
    dom,
    update(updated) {
      if (updated.type !== node.type) return false
      const changed = currentNode.attrs.value !== updated.attrs.value
      currentNode = updated
      updateControls()
      if (!changed) return true
      source?.update(String(updated.attrs.value))
      clearTimeout(renderTimer)
      if (editing) renderTimer = setTimeout(refreshPreview, 200)
      else refreshPreview()
      return true
    },
    selectNode() {
      selected = true
      dom.classList.add('ProseMirror-selectednode')
      start()
    },
    deselectNode() {
      selected = false
      dom.classList.remove('ProseMirror-selectednode')
      // 选区同步完成后再退出，避免清空源码时在视图更新中派发删除事务。
      queueMicrotask(() => {
        if (!destroyed && !selected && !dom.contains(dom.ownerDocument.activeElement)) finish()
      })
    },
    // HTML 自行处理点击，避免外层编辑器在 mouseup 时抢回焦点并收起源码。
    stopEvent: (event) =>
      event.type === 'mousedown' ||
      (event.target instanceof Element &&
        (Boolean(event.target.closest('.lume-html-editor, .lume-html-tools')) ||
          (event.type !== 'keydown' && Boolean(event.target.closest(interactiveSelector))))),
    ignoreMutation: () => true,
    destroy() {
      destroyed = true
      revision++
      clearTimeout(renderTimer)
      clearTimeout(blurTimer)
      cancelAnimationFrame(focusFrame)
      source?.destroy()
    },
  }
}
