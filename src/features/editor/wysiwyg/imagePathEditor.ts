import { Fragment, Slice, type Node as ProseNode } from '@milkdown/kit/prose/model'
import { closeHistory, undo, redo } from '@milkdown/kit/prose/history'
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { normalizeImageSourceInput } from '@/utils/imageSource'
import type { ImageInputAttributes } from './imageInput'

export const createImagePathEditor = (options: {
  view: EditorView
  getPos: () => number | undefined
  importSource?: (src: string) => Promise<string>
  selectImages?: () => Promise<ImageInputAttributes[]>
  onUpdate: () => void
}) => {
  const dom = document.createElement('span')
  const prefix = document.createElement('span')
  const input = document.createElement('input')
  const choose = document.createElement('button')
  const suffix = document.createElement('span')
  let editing = false
  let busy = false
  let destroyed = false

  dom.className = 'lume-image-path'
  dom.contentEditable = 'false'
  input.className = 'lume-image-path__input'
  input.type = 'text'
  input.dir = 'ltr'
  input.placeholder = '输入图片路径'
  input.setAttribute('aria-label', '图片路径')
  input.spellcheck = false
  choose.className = 'lume-image-path__choose'
  choose.type = 'button'
  choose.title = '选择本地图片'
  choose.setAttribute('aria-label', '选择本地图片')
  choose.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2H8l-5 10H2V7Z"/><path d="M3 20h15l4-10H8Z"/></svg>'
  suffix.textContent = ')'
  dom.append(prefix, input, choose, suffix)

  const getTarget = () => {
    if (destroyed || options.view.isDestroyed || !options.view.editable) return null
    const pos = options.getPos()
    if (typeof pos !== 'number') return null
    const node = options.view.state.doc.nodeAt(pos)
    return node?.type.name === 'image' ? { pos, node } : null
  }
  const handleFocus = () => {
    const target = getTarget()
    if (!target) return
    editing = true
    const { state } = options.view
    // 路径框接管编辑焦点后退出图片对象选择，避免整段图片语法保持选中。
    if (state.selection instanceof NodeSelection && state.selection.from === target.pos)
      options.view.dispatch(
        state.tr.setSelection(
          TextSelection.near(state.doc.resolve(target.pos + target.node.nodeSize)),
        ),
      )
    options.onUpdate()
  }
  const focus = () => {
    if (!getTarget() || !dom.isConnected || busy) return
    handleFocus()
    input.focus()
  }
  const leave = (before = false) => {
    const target = getTarget()
    if (!target) return
    editing = false
    options.onUpdate()
    const tr = options.view.state.tr
    const pos = before ? target.pos : target.pos + target.node.nodeSize
    options.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(pos))).scrollIntoView())
    options.view.focus()
  }
  const reportError = (error: unknown) => {
    if (destroyed) return
    const message = error instanceof Error ? error.message : String(error)
    input.setAttribute('aria-invalid', 'true')
    input.title = `${message}\n${normalizeImageSourceInput(input.value)}`
    window.dispatchEvent(new CustomEvent('lume:image-error', { detail: message }))
  }
  const setBusy = (value: boolean) => {
    busy = value
    input.disabled = value || !options.view.editable
    choose.disabled = value || !options.view.editable
    dom.setAttribute('aria-busy', String(value))
  }
  const finish = async (selectFile: boolean, moveFocus = true) => {
    const target = getTarget()
    if (!target || busy) return
    const draft = normalizeImageSourceInput(input.value)
    if (!selectFile && !draft) {
      if (moveFocus) leave()
      else {
        editing = false
        options.onUpdate()
      }
      return
    }
    const selection = options.view.state.selection
    setBusy(true)
    let restoreFocus = false
    try {
      if (!selectFile && /^(?:javascript|vbscript):/i.test(draft))
        throw new Error('请输入有效的图片路径。')
      const images = selectFile
        ? await options.selectImages?.()
        : [{ src: await (options.importSource?.(draft) ?? draft), alt: '', title: '' }]
      const current = getTarget()
      // 原节点被移除、切换模式或路径已被其他操作修改时，不覆盖新目标。
      if (!images?.length) {
        restoreFocus = moveFocus
        return
      }
      if (!current || current.node.attrs.src !== target.node.attrs.src) return
      const { state } = options.view
      const preserveSelection = !moveFocus || !selection.eq(state.selection)
      const bookmark = state.selection.getBookmark()
      const nodes = images.map((image, index) =>
        index === 0
          ? current.node.type.create(
              { ...current.node.attrs, src: image.src },
              current.node.content,
              current.node.marks,
            )
          : current.node.type.create(image),
      )
      const slice =
        nodes.length === 1
          ? new Slice(Fragment.from(nodes[0]), 0, 0)
          : new Slice(
              Fragment.fromArray(
                nodes.map((node) => state.schema.nodes.paragraph.create(null, node)),
              ),
              1,
              1,
            )
      const end = current.pos + current.node.nodeSize
      const tr = state.tr.replaceRange(current.pos, end, slice)
      tr.setSelection(
        preserveSelection
          ? bookmark.map(tr.mapping).resolve(tr.doc)
          : TextSelection.near(tr.doc.resolve(tr.mapping.map(end))),
      )
      editing = false
      // 整批替换占位图片，沿用多图插入的分段方式，并作为一次撤销操作。
      options.view.dispatch(closeHistory(tr).scrollIntoView())
      options.onUpdate()
      if (moveFocus && !preserveSelection) options.view.focus()
    } catch (error) {
      reportError(error)
      restoreFocus = moveFocus
    } finally {
      if (!destroyed) {
        setBusy(false)
        if (restoreFocus) focus()
      }
    }
  }
  const handleInput = () => {
    const target = getTarget()
    if (!target || busy) return
    input.removeAttribute('aria-invalid')
    input.title = ''
    options.view.dispatch(options.view.state.tr.setNodeAttribute(target.pos, 'src', input.value))
  }
  const handlePointerDown = (event: MouseEvent | PointerEvent) => {
    if (event.target === input) handleFocus()
    event.stopPropagation()
  }
  const handleBlur = (event: FocusEvent) => {
    if (busy || (event.relatedTarget instanceof Node && dom.contains(event.relatedTarget))) return
    void finish(false, false)
  }
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.isComposing) return
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      ['z', 'y'].includes(event.key.toLowerCase())
    ) {
      event.preventDefault()
      event.stopPropagation()
      const command = event.key.toLowerCase() === 'y' || event.shiftKey ? redo : undo
      command(options.view.state, (tr) => options.view.dispatch(tr))
      if (!dom.isConnected && !options.view.isDestroyed) options.view.focus()
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const before =
      event.key === 'ArrowLeft' && input.selectionStart === 0 && input.selectionEnd === 0
    if (!before && !['Enter', 'Escape', 'Tab'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape' || before) leave(before)
    else void finish(false)
  }
  const handleChoosePointerDown = (event: PointerEvent) => event.preventDefault()
  const handleChoose = () => {
    void finish(true)
  }
  input.addEventListener('input', handleInput)
  input.addEventListener('focus', handleFocus)
  input.addEventListener('blur', handleBlur)
  input.addEventListener('keydown', handleKeydown)
  choose.addEventListener('pointerdown', handleChoosePointerDown)
  choose.addEventListener('click', handleChoose)
  // 保留输入框原生的点击定位与拖选，不交给外层图片选择逻辑。
  dom.addEventListener('pointerdown', handlePointerDown)
  dom.addEventListener('mousedown', handlePointerDown)

  return {
    dom,
    focus,
    update(node: ProseNode) {
      const visible = !node.attrs.src || editing
      dom.hidden = !visible
      prefix.textContent = `![${node.attrs.alt ?? ''}](`
      if (input.value !== String(node.attrs.src ?? '')) input.value = String(node.attrs.src ?? '')
      if (!input.hasAttribute('aria-invalid')) input.title = normalizeImageSourceInput(input.value)
      input.style.width = `${Math.max(14, Math.min(28, input.value.length + 1))}ch`
      input.disabled = busy || !options.view.editable
      choose.disabled = busy || !options.view.editable || !options.selectImages
      return visible
    },
    contains: (target: EventTarget | null) => target instanceof Node && dom.contains(target),
    destroy() {
      destroyed = true
      input.removeEventListener('input', handleInput)
      input.removeEventListener('focus', handleFocus)
      input.removeEventListener('blur', handleBlur)
      input.removeEventListener('keydown', handleKeydown)
      choose.removeEventListener('pointerdown', handleChoosePointerDown)
      choose.removeEventListener('click', handleChoose)
      dom.removeEventListener('pointerdown', handlePointerDown)
      dom.removeEventListener('mousedown', handlePointerDown)
    },
  }
}
