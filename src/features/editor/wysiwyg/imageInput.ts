import { NodeSelection, Plugin, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'

const ONLINE_IMAGE_URL_PATTERN = /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|bmp|avif|svg)(?:[?#]\S*)?$/i
const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
  'image/svg+xml',
])

function insertImage(
  view: EditorView,
  src: string,
  alt: string,
  point?: { x: number; y: number },
) {
  const image = view.state.schema.nodes.image.create({ src, alt, title: '' })
  let tr = view.state.tr
  if (point) {
    const dropPosition = view.posAtCoords({ left: point.x, top: point.y })
    if (dropPosition) {
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(dropPosition.pos)))
    }
  }
  view.dispatch(tr.replaceSelectionWith(image).scrollIntoView())
  view.focus()
}

function getImageAlt(src: string) {
  try {
    const fileName = decodeURIComponent(new URL(src).pathname.split('/').at(-1) ?? '')
    return fileName.replace(/\.[^.]+$/, '') || 'image'
  } catch {
    return 'image'
  }
}

function convertImageUrlBeforeCursor(view: EditorView, createFollowingParagraph: boolean) {
  const { state } = view
  const { $from, empty } = state.selection
  if (
    !empty
    || $from.parent.type.name !== 'paragraph'
    || $from.parentOffset !== $from.parent.content.size
  ) return false

  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const src = textBeforeCursor.match(ONLINE_IMAGE_URL_PATTERN)?.[0]
  if (!src) return false

  const contentFrom = $from.pos - src.length
  const contentTo = $from.pos
  const blockEnd = $from.after()
  const image = state.schema.nodes.image.create({ src, alt: getImageAlt(src), title: '' })
  let tr = state.tr.replaceWith(contentFrom, contentTo, image)

  if (createFollowingParagraph) {
    const insertPos = tr.mapping.map(blockEnd)
    tr = tr
      .insert(insertPos, state.schema.nodes.paragraph.create())
      .setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)))
  } else {
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(contentFrom + image.nodeSize)))
  }

  view.dispatch(tr.scrollIntoView())
  return true
}

function selectImageFromEvent(view: EditorView, event: MouseEvent | PointerEvent) {
  if (event.button !== 0) return false
  const imageElement = (event.target as Element | null)?.closest('.lume-image-resizer')
  if (!(imageElement instanceof HTMLElement)) return false

  event.preventDefault()
  event.stopPropagation()
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, view.posAtDOM(imageElement, 0))).scrollIntoView())
  view.focus()
  return true
}

function deleteAdjacentImage(view: EditorView, event: KeyboardEvent) {
  if (event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false

  const { state } = view
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
    event.preventDefault()
    view.dispatch(state.tr.delete(selection.from, selection.to).scrollIntoView())
    return true
  }
  if (!selection.empty) return false

  const { $from } = selection
  const before = $from.nodeBefore
  const after = $from.nodeAfter
  const target = event.key === 'Delete'
    ? after?.type.name === 'image'
      ? { from: $from.pos, to: $from.pos + after.nodeSize }
      : before?.type.name === 'image'
        ? { from: $from.pos - before.nodeSize, to: $from.pos }
        : null
    : before?.type.name === 'image'
      ? { from: $from.pos - before.nodeSize, to: $from.pos }
      : after?.type.name === 'image'
        ? { from: $from.pos, to: $from.pos + after.nodeSize }
        : null

  if (!target) return false
  event.preventDefault()
  view.dispatch(state.tr.delete(target.from, target.to).scrollIntoView())
  return true
}

function insertPastedImageUrl(view: EditorView, event: ClipboardEvent) {
  const src = event.clipboardData?.getData('text/plain').trim() ?? ''
  if (!ONLINE_IMAGE_URL_PATTERN.test(src)) return false

  event.preventDefault()
  insertImage(view, src, getImageAlt(src))
  return true
}

export function createImageInputPlugin(options: {
  importFile: (file: File) => Promise<string | null>
  isActive: () => boolean
}) {
  const importFiles = async (view: EditorView, files: File[]) => {
    for (const file of files) {
      try {
        const src = await options.importFile(file)
        if (!src) continue
        if (!options.isActive() || view.isDestroyed) return
        insertImage(view, src, file.name.replace(/\.[^.]+$/, '') || 'image')
      } catch (error) {
        console.error('粘贴图片失败:', error)
      }
    }
  }

  return $prose(() => new Plugin({
    props: {
      handleClickOn(view, _pos, node, nodePos, event, direct) {
        if (!direct || node.type.name !== 'image') return false
        event.preventDefault()
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)).scrollIntoView())
        view.focus()
        return true
      },
      handleDOMEvents: {
        mousedown: selectImageFromEvent,
        pointerdown: selectImageFromEvent,
      },
      handlePaste(view, event) {
        const images = Array.from(event.clipboardData?.files ?? [])
          .filter((file) => IMAGE_MIME_TYPES.has(file.type))
        if (images.length === 0) return insertPastedImageUrl(view, event)
        event.preventDefault()
        void importFiles(view, images)
        return true
      },
      handleKeyDown(view, event) {
        if (deleteAdjacentImage(view, event)) return true
        if (event.key === 'Tab' && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault()
          if (!event.shiftKey) {
            const indent = '    '
            const { from, to } = view.state.selection
            const tr = view.state.tr.replaceWith(from, to, view.state.schema.text(indent))
            view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + indent.length)).scrollIntoView())
          }
          return true
        }
        if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false
        if (event.key !== 'Enter' && event.key !== ' ') return false
        const converted = convertImageUrlBeforeCursor(view, event.key === 'Enter')
        if (converted) event.preventDefault()
        return converted
      },
      handleDrop(view, event) {
        const images = Array.from(event.dataTransfer?.files ?? [])
          .filter((file) => IMAGE_MIME_TYPES.has(file.type))
        if (images.length === 0) return false
        event.preventDefault()
        void importFiles(view, images)
        return true
      },
    },
  }))
}

export async function insertNativeImagePaths(
  view: EditorView,
  detail: { paths: string[]; x: number; y: number },
  options: {
    importPath: (path: string) => Promise<string | null>
    isActive: () => boolean
  },
) {
  let useDropPoint = true
  for (const path of detail.paths) {
    try {
      const src = await options.importPath(path)
      if (!src) continue
      if (!options.isActive() || view.isDestroyed) return
      const fileName = path.split(/[\\/]/).at(-1) ?? 'image'
      insertImage(
        view,
        src,
        fileName.replace(/\.[^.]+$/, ''),
        useDropPoint ? { x: detail.x, y: detail.y } : undefined,
      )
      useDropPoint = false
    } catch (error) {
      console.error('导入图片失败:', error)
    }
  }
}