import { t } from '@/app/i18n'
import { schemaCtx } from '@milkdown/kit/core'
import { Fragment, Slice, type Node as ProseNode } from '@milkdown/kit/prose/model'
import { closeHistory } from '@milkdown/kit/prose/history'
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type SelectionBookmark,
} from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { parseMarkdownImageAt } from '@/utils/imageMarkdown'
import { parseSizedImageHtml } from '@/utils/imageHtml'
import {
  createImageClipboardSerializer,
  getClipboardImageInput,
  getClipboardImageOrigins,
  type ImageClipboardOptions,
  type ImageClipboardOrigin,
} from '@/features/images/editor/imageClipboard'

const IMAGE_SOURCE_PATTERN =
  /^(?:https?:\/\/\S+|file:\/\/[^\r\n]+|[a-z]:[\\/][^\r\n]+|\\\\[^\r\n]+)\.(?:png|jpe?g|gif|webp|bmp|avif|svg|ico)(?:[?#][^\r\n]*)?$/i
export type ImageInputAttributes = { src: string; alt: string; title: string }
type ImageImportState = { pending: Map<string, SelectionBookmark>; decorations: DecorationSet }
const imageImportKey = new PluginKey<ImageImportState>('lume-image-input')
let imageImportSequence = 0

function createImageDecorations(doc: ProseNode) {
  const decorations: Decoration[] = []
  doc.descendants((node, pos, parent) => {
    // 空路径是行内输入占位符，不参与独立图片的自动居中。
    if (
      node.type.name === 'image' &&
      node.attrs.src &&
      parent?.type.name === 'paragraph' &&
      parent.childCount === 1
    )
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, { class: 'lume-image-standalone' }),
      )
  })
  return DecorationSet.create(doc, decorations)
}

function beginImageImport(view: EditorView, point?: { x: number; y: number }) {
  let selection = view.state.selection
  if (point) {
    const dropPosition = view.posAtCoords({ left: point.x, top: point.y })
    if (dropPosition) selection = TextSelection.near(view.state.doc.resolve(dropPosition.pos))
  }
  const id = String(++imageImportSequence)
  view.dispatch(
    view.state.tr.setMeta(imageImportKey, { add: { id, bookmark: selection.getBookmark() } }),
  )
  return id
}

function finishImageSliceImport(view: EditorView, id: string, slice: Slice) {
  const bookmark = imageImportKey.getState(view.state)?.pending.get(id)
  if (!bookmark) return
  let tr = view.state.tr.setMeta(imageImportKey, { remove: id })
  if (slice.size === 0 || !view.editable) {
    view.dispatch(tr)
    return
  }
  const selection = bookmark.resolve(view.state.doc)
  const preserveSelection = !selection.eq(view.state.selection)
  const currentBookmark = view.state.selection.getBookmark()
  tr = tr.setSelection(selection).replaceSelection(slice)
  // 异步导入期间继续输入或移动光标时，图片仍插入原位置，并保留当前光标。
  if (preserveSelection) tr = tr.setSelection(currentBookmark.map(tr.mapping).resolve(tr.doc))
  view.dispatch(closeHistory(tr).scrollIntoView())
}

function createImageSlice(view: EditorView, attributes: ImageInputAttributes[]) {
  const images = attributes.map((attrs) => view.state.schema.nodes.image.create(attrs))
  if (images.length < 2)
    return images.length ? new Slice(Fragment.from(images[0]), 0, 0) : Slice.empty
  const paragraphs = images.map((image) => view.state.schema.nodes.paragraph.create(null, image))
  return new Slice(Fragment.fromArray(paragraphs), 1, 1)
}

function finishImageImport(view: EditorView, id: string, attributes: ImageInputAttributes[]) {
  finishImageSliceImport(view, id, createImageSlice(view, attributes))
}

function replaceImageSources(fragment: Fragment, sources: Map<string, string>): Fragment {
  const nodes: ProseNode[] = []
  fragment.forEach((node) => {
    if (node.type.name === 'image') {
      const src = sources.get(String(node.attrs.src))
      nodes.push(src ? node.type.create({ ...node.attrs, src }, node.content, node.marks) : node)
    } else
      nodes.push(node.childCount ? node.copy(replaceImageSources(node.content, sources)) : node)
  })
  return Fragment.fromArray(nodes)
}

function reportImageError(error: unknown) {
  const message = error instanceof Error ? error.message : t('无法导入图片。')
  window.dispatchEvent(new CustomEvent('lume:image-error', { detail: message }))
}

function getImageAlt(src: string) {
  if (/^(?:[a-z]:[\\/]|\\\\)/i.test(src))
    return (
      src
        .split(/[\\/]/)
        .at(-1)
        ?.replace(/\.[^.]+$/, '') || 'image'
    )
  try {
    const fileName = decodeURIComponent(new URL(src).pathname.split('/').at(-1) ?? '')
    return fileName.replace(/\.[^.]+$/, '') || 'image'
  } catch {
    return (
      src
        .split(/[\\/]/)
        .at(-1)
        ?.replace(/\.[^.]+$/, '') || 'image'
    )
  }
}

function parseImageSource(source: string) {
  if (/^<img\b/i.test(source.trim())) {
    const image = parseSizedImageHtml(source)
    return image ? { ...image, html: true } : null
  }
  const markdownImage = parseMarkdownImageAt(source)
  if (markdownImage?.end === source.length) {
    return {
      src: markdownImage.src,
      alt: markdownImage.alt,
      title: markdownImage.title,
    }
  }

  const src = source.match(IMAGE_SOURCE_PATTERN)?.[0]
  return src ? { src, alt: getImageAlt(src), title: '' } : null
}

function convertImageSourceBeforeCursor(view: EditorView, createFollowingParagraph: boolean) {
  const { state } = view
  const { $from, empty } = state.selection
  if (
    !empty ||
    $from.parent.type.name !== 'paragraph' ||
    $from.parentOffset !== $from.parent.content.size
  )
    return false

  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  let inCode = false
  $from.parent.nodesBetween(0, $from.parentOffset, (node) => {
    if (node.marks.some((mark) => mark.type.spec.code)) inCode = true
  })
  if (inCode) return false
  const imageSource = parseImageSource(textBeforeCursor)
  if (!imageSource) return false

  const contentFrom = $from.pos - textBeforeCursor.length
  const contentTo = $from.pos
  const blockEnd = $from.after()
  const image = state.schema.nodes.image.create(imageSource)
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
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('.lume-image-path')) return false
  const imageElement = target?.closest('.lume-image-resizer')
  if (!(imageElement instanceof HTMLElement)) return false

  event.preventDefault()
  event.stopPropagation()
  view.dispatch(
    view.state.tr
      .setSelection(NodeSelection.create(view.state.doc, view.posAtDOM(imageElement, 0)))
      .scrollIntoView(),
  )
  view.focus()
  return true
}

function deleteAdjacentImage(view: EditorView, event: KeyboardEvent) {
  if (event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
    return false
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
  const target =
    event.key === 'Delete'
      ? after?.type.name === 'image'
        ? { from: $from.pos, to: $from.pos + after.nodeSize }
        : null
      : before?.type.name === 'image'
        ? { from: $from.pos - before.nodeSize, to: $from.pos }
        : null

  if (!target) return false
  event.preventDefault()
  view.dispatch(state.tr.delete(target.from, target.to).scrollIntoView())
  return true
}

export function createImageInputPlugin(
  options: ImageClipboardOptions & {
    importFile: (file: File) => Promise<string | null>
    isActive: () => boolean
  },
) {
  let pasteAsPlainText = false
  let resetPlainTextTimer: number | undefined
  const importFiles = async (
    view: EditorView,
    files: File[],
    point?: { x: number; y: number },
    clipboardPaths?: Promise<string[]>,
  ) => {
    const id = beginImageImport(view, point)
    const images: ImageInputAttributes[] = []
    const paths = (await clipboardPaths) ?? []
    if (paths.length && options.importImageSource) {
      for (const path of paths) {
        if (!options.isActive() || view.isDestroyed || !view.editable) return
        try {
          const src = await options.importImageSource(path)
          images.push({ src, alt: getImageAlt(path), title: '' })
        } catch (error) {
          if (options.isActive() && !view.isDestroyed) reportImageError(error)
        }
      }
      if (options.isActive() && !view.isDestroyed) finishImageImport(view, id, images)
      return
    }
    for (const file of files) {
      if (!options.isActive() || view.isDestroyed || !view.editable) return
      try {
        const src = await options.importFile(file)
        if (!src) continue
        if (!options.isActive() || view.isDestroyed) return
        images.push({ src, alt: file.name.replace(/\.[^.]+$/, '') || 'image', title: '' })
      } catch (error) {
        if (options.isActive() && !view.isDestroyed) reportImageError(error)
      }
    }
    if (options.isActive() && !view.isDestroyed) finishImageImport(view, id, images)
  }

  const importImageUrl = async (
    view: EditorView,
    source: string,
    point?: { x: number; y: number },
  ) => {
    const id = beginImageImport(view, point)
    try {
      const src = await (options.importImageSource?.(source) ?? Promise.resolve(source))
      if (options.isActive() && !view.isDestroyed)
        finishImageImport(view, id, [{ src, alt: getImageAlt(source), title: '' }])
    } catch (error) {
      if (options.isActive() && !view.isDestroyed) {
        finishImageImport(view, id, [])
        reportImageError(error)
      }
    }
  }

  const importClipboardImages = async (
    view: EditorView,
    slice: Slice,
    imageSources: string[],
    origins?: ReadonlyMap<string, ImageClipboardOrigin>,
  ) => {
    const importSource = options.importImageSource
    if (!importSource) return
    const id = beginImageImport(view)
    const sources = new Map<string, string>()
    for (const source of imageSources) {
      if (!options.isActive() || view.isDestroyed || !view.editable) return
      try {
        const src = await importSource(source, origins?.get(source))
        if (src) sources.set(source, src)
      } catch (error) {
        if (options.isActive() && !view.isDestroyed) reportImageError(error)
      }
    }
    if (options.isActive() && !view.isDestroyed)
      finishImageSliceImport(
        view,
        id,
        new Slice(replaceImageSources(slice.content, sources), slice.openStart, slice.openEnd),
      )
  }

  return $prose(
    (ctx) =>
      new Plugin({
        key: imageImportKey,
        state: {
          init: (_, state) => ({
            pending: new Map(),
            decorations: createImageDecorations(state.doc),
          }),
          apply: (tr, previous) => {
            const pending = new Map(
              Array.from(previous.pending, ([id, bookmark]) => [id, bookmark.map(tr.mapping)]),
            )
            const meta = tr.getMeta(imageImportKey) as
              { add?: { id: string; bookmark: SelectionBookmark }; remove?: string } | undefined
            if (meta?.add) pending.set(meta.add.id, meta.add.bookmark)
            if (meta?.remove) pending.delete(meta.remove)
            return {
              pending,
              decorations: tr.docChanged ? createImageDecorations(tr.doc) : previous.decorations,
            }
          },
        },
        view: () => {
          let refreshFrame: number | null = null
          return {
            update: (view, previous) => {
              const currentMatter =
                view.state.doc.firstChild?.type.name === 'front_matter'
                  ? view.state.doc.firstChild.textContent
                  : ''
              const previousMatter =
                previous.doc.firstChild?.type.name === 'front_matter'
                  ? previous.doc.firstChild.textContent
                  : ''
              if (currentMatter === previousMatter) return
              if (refreshFrame !== null) cancelAnimationFrame(refreshFrame)
              refreshFrame = requestAnimationFrame(() => {
                refreshFrame = null
                if (!view.isDestroyed) view.dom.dispatchEvent(new CustomEvent('lume:image-refresh'))
              })
            },
            destroy: () => {
              if (refreshFrame !== null) cancelAnimationFrame(refreshFrame)
              window.clearTimeout(resetPlainTextTimer)
            },
          }
        },
        props: {
          clipboardSerializer: createImageClipboardSerializer(
            ctx.get(schemaCtx),
            options.getImageClipboardOrigin,
          ),
          decorations: (state) => imageImportKey.getState(state)?.decorations ?? null,
          handleClickOn(view, _pos, node, nodePos, event, direct) {
            if (!direct || node.type.name !== 'image') return false
            event.preventDefault()
            view.dispatch(
              view.state.tr
                .setSelection(NodeSelection.create(view.state.doc, nodePos))
                .scrollIntoView(),
            )
            view.focus()
            return true
          },
          handleDOMEvents: {
            mousedown: selectImageFromEvent,
            pointerdown: selectImageFromEvent,
          },
          handlePaste(view, event, slice) {
            if (pasteAsPlainText) {
              pasteAsPlainText = false
              window.clearTimeout(resetPlainTextTimer)
              return false
            }
            if (!view.editable || !options.isActive()) return false
            const imageSources = new Set<string>()
            slice.content.descendants((node) => {
              if (node.type.name === 'image' && node.attrs.src)
                imageSources.add(String(node.attrs.src))
            })
            const hasImageFiles = Array.from(event.clipboardData?.files ?? []).some((file) =>
              file.type.startsWith('image/'),
            )
            const origins = getClipboardImageOrigins(event.clipboardData)
            if (
              options.importImageSource &&
              imageSources.size &&
              (origins.size > 0 ||
                !hasImageFiles ||
                Array.from(imageSources).every((src) => /^(?:file:|[a-z]:[\\/]|\\\\)/i.test(src)))
            ) {
              event.preventDefault()
              void importClipboardImages(view, slice, Array.from(imageSources), origins)
              return true
            }
            const clipboard = getClipboardImageInput(event.clipboardData)
            if (clipboard) {
              event.preventDefault()
              void importFiles(view, clipboard.files, undefined, clipboard.paths)
              return true
            }
            const src = event.clipboardData?.getData('text/plain').trim() ?? ''
            const htmlImages = /^<img\b/i.test(src)
              ? src.split(/\r?\n\s*\r?\n/).map(parseSizedImageHtml)
              : []
            if (
              htmlImages.length &&
              htmlImages.every((image) => image !== null) &&
              !view.state.selection.$from.parent.type.spec.code &&
              !view.state.selection.$from.marks().some((mark) => mark.type.spec.code)
            ) {
              event.preventDefault()
              const imageSlice = createImageSlice(
                view,
                htmlImages.map((image) => ({ ...image, html: true })),
              )
              if (options.importImageSource)
                void importClipboardImages(view, imageSlice, [
                  ...new Set(htmlImages.map((image) => image.src)),
                ])
              else
                view.dispatch(
                  closeHistory(view.state.tr.replaceSelection(imageSlice))
                    .setMeta('uiEvent', 'paste')
                    .scrollIntoView(),
                )
              return true
            }
            if (!IMAGE_SOURCE_PATTERN.test(src)) return false
            event.preventDefault()
            void importImageUrl(view, src)
            return true
          },
          handleKeyDown(view, event) {
            if (
              event.key.toLowerCase() === 'v' &&
              event.shiftKey &&
              (event.ctrlKey || event.metaKey)
            ) {
              pasteAsPlainText = true
              window.clearTimeout(resetPlainTextTimer)
              resetPlainTextTimer = window.setTimeout(() => {
                pasteAsPlainText = false
              }, 1000)
              return false
            }
            if (!view.editable) return false
            if (deleteAdjacentImage(view, event)) return true
            if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false
            if (event.key !== 'Enter' && event.key !== ' ') return false
            const converted = convertImageSourceBeforeCursor(view, event.key === 'Enter')
            if (converted) event.preventDefault()
            return converted
          },
          handleDrop(view, event, _slice, moved) {
            if (moved || !view.editable || !options.isActive()) return false
            const images = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
              file.type.startsWith('image/'),
            )
            if (images.length === 0) {
              const src = (
                event.dataTransfer?.getData('text/uri-list') ||
                event.dataTransfer?.getData('text/plain') ||
                ''
              ).trim()
              if (!IMAGE_SOURCE_PATTERN.test(src)) return false
              event.preventDefault()
              void importImageUrl(view, src, { x: event.clientX, y: event.clientY })
              return true
            }
            event.preventDefault()
            void importFiles(view, images, { x: event.clientX, y: event.clientY })
            return true
          },
        },
      }),
  )
}

export async function insertNativeImagePaths(
  view: EditorView,
  detail: { paths: string[]; x?: number; y?: number },
  options: {
    importPath: (path: string) => Promise<string | null>
    isActive: () => boolean
  },
) {
  if (!view.editable || !options.isActive() || view.isDestroyed) return
  const point =
    typeof detail.x === 'number' && typeof detail.y === 'number'
      ? { x: detail.x, y: detail.y }
      : undefined
  const id = beginImageImport(view, point)
  const images: ImageInputAttributes[] = []
  for (const path of detail.paths) {
    if (!options.isActive() || view.isDestroyed || !view.editable) return
    try {
      const src = await options.importPath(path)
      if (!src) continue
      if (!options.isActive() || view.isDestroyed) return
      const fileName = path.split(/[\\/]/).at(-1) ?? 'image'
      images.push({ src, alt: fileName.replace(/\.[^.]+$/, '') || 'image', title: '' })
    } catch (error) {
      if (options.isActive() && !view.isDestroyed) reportImageError(error)
    }
  }
  if (options.isActive() && !view.isDestroyed) finishImageImport(view, id, images)
}
