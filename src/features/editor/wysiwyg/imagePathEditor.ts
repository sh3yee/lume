import { language, t } from '@/app/i18n'
import { watch } from 'vue'
import { Fragment, Slice, type Node as ProseNode } from '@milkdown/kit/prose/model'
import { closeHistory, undo, redo } from '@milkdown/kit/prose/history'
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { normalizeImageSourceInput } from '@/utils/imageSource'
import { parseMarkdownImageAt } from '@/utils/imageMarkdown'
import type { ImageInputAttributes } from './imageInput'
import { createImageSourceEditor } from './imageSourceEditor'

export const createImagePathEditor = (options: {
  view: EditorView
  getPos: () => number | undefined
  importSource?: (src: string) => Promise<string>
  selectImages?: () => Promise<ImageInputAttributes[]>
  onUpdate: () => void
}) => {
  const dom = document.createElement('span')
  const choose = document.createElement('button')
  const source = createImageSourceEditor(choose)
  const input = source.path
  let editing = false
  let busy = false
  let destroyed = false
  let composing = false

  dom.className = 'lume-image-path'
  dom.contentEditable = 'false'
  input.dir = 'ltr'
  input.setAttribute('aria-label', t('图片路径'))
  choose.className = 'lume-image-path__choose'
  choose.type = 'button'
  choose.title = t('选择本地图片')
  choose.setAttribute('aria-label', t('选择本地图片'))
  const stopLanguageWatch = watch(language, () => {
    input.setAttribute('aria-label', t('图片路径'))
    source.dom.setAttribute('aria-label', t('图片 Markdown'))
    input.dataset.placeholder = t('输入图片路径')
    choose.title = t('选择本地图片')
    choose.setAttribute('aria-label', t('选择本地图片'))
  })
  choose.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2H8l-5 10H2V7Z"/><path d="M3 20h15l4-10H8Z"/></svg>'
  dom.append(source.dom)

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
    // 源码接管编辑焦点后退出图片对象选择，保留内部的文字光标。
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
    source.focusPath()
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
    input.title = `${message}\n${normalizeImageSourceInput(String(getTarget()?.node.attrs.src ?? ''))}`
    window.dispatchEvent(new CustomEvent('lume:image-error', { detail: message }))
  }
  const setBusy = (value: boolean) => {
    busy = value
    source.setEditable(!value && options.view.editable)
    choose.disabled = value || !options.view.editable
    dom.setAttribute('aria-busy', String(value))
  }
  const finish = async (selectFile: boolean, moveFocus = true) => {
    const target = getTarget()
    if (!target || busy) return
    const draft = normalizeImageSourceInput(String(target.node.attrs.src ?? ''))
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
        throw new Error(t('请输入有效的图片路径。'))
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
      // 单张图片只更新路径，避免替换节点使图片对象选区退化为文字光标。
      const tr =
        images.length === 1
          ? state.tr.setNodeAttribute(current.pos, 'src', images[0]!.src)
          : state.tr.replaceRange(current.pos, end, slice)
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
    if (!target || busy || composing) return
    input.removeAttribute('aria-invalid')
    input.title = ''
    const value = source.getValue()
    const image = parseMarkdownImageAt(value, 0, { allowEmpty: true })
    const { state } = options.view
    if (!image || image.end !== value.length) {
      // 语法被删改后退回普通文字，让跨符号选择、替换和删除沿用正文行为。
      const selection = source.getSelection()
      const tr = state.tr.replaceWith(
        target.pos,
        target.pos + target.node.nodeSize,
        value ? state.schema.text(value, target.node.marks) : [],
      )
      tr.setSelection(
        TextSelection.create(
          tr.doc,
          target.pos + Math.min(selection?.anchor ?? value.length, value.length),
          target.pos + Math.min(selection?.head ?? value.length, value.length),
        ),
      )
      options.view.dispatch(tr)
      options.view.focus()
      return
    }
    const tr = state.tr
    for (const attribute of ['src', 'alt', 'title'] as const)
      if (target.node.attrs[attribute] !== image[attribute])
        tr.setNodeAttribute(target.pos, attribute, image[attribute])
    if (tr.docChanged) options.view.dispatch(tr)
    else options.onUpdate()
  }
  const handlePointerDown = (event: MouseEvent | PointerEvent) => {
    if (event.target instanceof Node && source.dom.contains(event.target)) handleFocus()
    event.stopPropagation()
  }
  const handleBlur = (event: FocusEvent) => {
    if (busy || (event.relatedTarget instanceof Node && dom.contains(event.relatedTarget))) return
    void finish(false, false)
  }
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.isComposing) return
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      event.stopPropagation()
      source.setSelection(0, source.getValue().length)
      return
    }
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
    const selection = source.getSelection()
    const collapsed = selection && selection.anchor === selection.head && !event.shiftKey
    const before = collapsed && event.key === 'ArrowLeft' && selection.head === 0
    const after =
      collapsed && event.key === 'ArrowRight' && selection.head === source.getValue().length
    if (!before && !after && !['Enter', 'Escape', 'Tab'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape' || before || after) leave(Boolean(before))
    else void finish(false)
  }
  const handleCompositionStart = () => {
    composing = true
  }
  const handleCompositionEnd = () => {
    composing = false
    handleInput()
  }
  const handleChoosePointerDown = (event: PointerEvent) => event.preventDefault()
  const handleChoose = () => {
    void finish(true)
  }
  source.dom.addEventListener('input', handleInput)
  source.dom.addEventListener('focus', handleFocus)
  source.dom.addEventListener('blur', handleBlur)
  source.dom.addEventListener('keydown', handleKeydown)
  source.dom.addEventListener('compositionstart', handleCompositionStart)
  source.dom.addEventListener('compositionend', handleCompositionEnd)
  choose.addEventListener('pointerdown', handleChoosePointerDown)
  choose.addEventListener('click', handleChoose)
  // 整段 Markdown 使用同一个编辑区域，保留原生点击定位和跨符号拖选。
  dom.addEventListener('pointerdown', handlePointerDown)
  dom.addEventListener('mousedown', handlePointerDown)

  return {
    dom,
    focus,
    update(node: ProseNode) {
      const visible = !node.attrs.src || editing
      dom.hidden = !visible
      if (!composing) source.update(node)
      if (!input.hasAttribute('aria-invalid'))
        input.title = normalizeImageSourceInput(String(node.attrs.src ?? ''))
      source.setEditable(!busy && options.view.editable)
      choose.disabled = busy || !options.view.editable || !options.selectImages
      return visible
    },
    contains: (target: EventTarget | null) => target instanceof Node && dom.contains(target),
    destroy() {
      stopLanguageWatch()
      destroyed = true
      source.dom.removeEventListener('input', handleInput)
      source.dom.removeEventListener('focus', handleFocus)
      source.dom.removeEventListener('blur', handleBlur)
      source.dom.removeEventListener('keydown', handleKeydown)
      source.dom.removeEventListener('compositionstart', handleCompositionStart)
      source.dom.removeEventListener('compositionend', handleCompositionEnd)
      choose.removeEventListener('pointerdown', handleChoosePointerDown)
      choose.removeEventListener('click', handleChoose)
      dom.removeEventListener('pointerdown', handlePointerDown)
      dom.removeEventListener('mousedown', handlePointerDown)
    },
  }
}
