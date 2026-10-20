import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { useDocument } from '@/features/documents/model/useDocument'
import { chooseImageFiles } from '../services/imageFileOperations'
import { importEditorImageFile, importEditorImagePath } from './imageEditorAssets'
import { imageMarkdown, replaceMarkdownImageSources } from '../services/markdownImageReferences'
import { setDocumentImageMetadata } from '../model/imageSettings'
import { getClipboardImageInput } from './imageClipboard'

interface SourceTarget {
  id: string
  source: string
  from: number
  to: number
}

export const useSourceImages = (
  textarea: Ref<HTMLTextAreaElement | null>,
  onCursor: (element: HTMLTextAreaElement) => void,
) => {
  const { content, activeDocument, persistDocumentSession } = useDocument()
  let disposed = false
  let plainPaste = false

  const getTarget = (): SourceTarget | null => {
    const element = textarea.value
    const document = activeDocument.value
    return element && document
      ? {
          id: document.id,
          source: content.value,
          from: element.selectionStart,
          to: element.selectionEnd,
        }
      : null
  }
  const reportError = (error: unknown) =>
    window.dispatchEvent(
      new CustomEvent('lume:image-error', {
        detail: error instanceof Error ? error.message : String(error),
      }),
    )
  const insertAtTarget = (target: SourceTarget, text: string, cursorOffset = text.length) => {
    if (disposed || activeDocument.value?.id !== target.id || content.value !== target.source)
      throw new Error('插入位置已发生变化，请重新插入图片。')
    const element = textarea.value
    if (!element) return
    element.focus()
    element.setSelectionRange(target.from, target.to)
    if (!document.execCommand('insertText', false, text))
      element.setRangeText(text, target.from, target.to, 'end')
    content.value = element.value
    element.setSelectionRange(target.from + cursorOffset, target.from + cursorOffset)
    onCursor(element)
    persistDocumentSession()
  }
  const importPaths = async (paths: string[], target: SourceTarget) => {
    const document = activeDocument.value
    if (!document || document.id !== target.id) return
    const images: string[] = []
    for (const path of paths) {
      try {
        images.push(
          imageMarkdown(
            await importEditorImagePath(path, document.path, document.id, target.source),
            path
              .split(/[\\/]/)
              .at(-1)
              ?.replace(/\.[^.]+$/, '') ?? '',
          ),
        )
      } catch (error) {
        reportError(error)
      }
    }
    if (images.length) insertAtTarget(target, images.join('\n\n'))
  }
  const insertLocalImages = async () => {
    const target = getTarget()
    if (target) await importPaths(await chooseImageFiles(), target)
  }
  const insertImage = () => {
    const target = getTarget()
    if (!target) return
    const markdown = imageMarkdown('', target.source.slice(target.from, target.to))
    insertAtTarget(target, markdown, markdown.length - 1)
  }
  const replaceSource = (source: string) => {
    const target = getTarget()
    if (target && source !== target.source)
      insertAtTarget({ ...target, from: 0, to: target.source.length }, source)
  }
  const replaceImageSources = (replacements: ReadonlyMap<string, string>) =>
    replaceSource(replaceMarkdownImageSources(content.value, replacements))
  const setImageMetadata = (
    key: 'typora-copy-images-to' | 'typora-root-url',
    value: string | null,
  ) => replaceSource(setDocumentImageMetadata(content.value, key, value))
  const importFiles = async (files: File[], target = getTarget()) => {
    const document = activeDocument.value
    if (!target || !document) return
    const images: string[] = []
    for (const file of files) {
      try {
        const src = await importEditorImageFile(file, document.path, document.id, target.source)
        if (src) images.push(imageMarkdown(src, file.name.replace(/\.[^.]+$/, '')))
      } catch (error) {
        reportError(error)
      }
    }
    if (images.length) insertAtTarget(target, images.join('\n\n'))
  }
  const handleKeydown = (event: KeyboardEvent) => {
    plainPaste =
      (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v'
  }
  const handlePaste = (event: ClipboardEvent) => {
    if (plainPaste) {
      plainPaste = false
      return
    }
    const clipboard = getClipboardImageInput(event.clipboardData)
    const target = getTarget()
    if (!clipboard || !target) return
    event.preventDefault()
    void clipboard.paths
      .then((paths) =>
        paths.length ? importPaths(paths, target) : importFiles(clipboard.files, target),
      )
      .catch(reportError)
  }
  const handleDrop = (event: DragEvent) => {
    const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    )
    if (!files.length) return
    event.preventDefault()
    void importFiles(files).catch(reportError)
  }
  const handleNativeDrop = (event: Event) => {
    const paths = (event as CustomEvent<{ paths: string[] }>).detail?.paths
    const target = getTarget()
    if (paths?.length && target) void importPaths(paths, target).catch(reportError)
  }
  onMounted(() => window.addEventListener('lume:image-drop', handleNativeDrop))
  onBeforeUnmount(() => {
    disposed = true
    window.removeEventListener('lume:image-drop', handleNativeDrop)
  })
  return {
    insertLocalImages,
    insertImage,
    replaceImageSources,
    setImageMetadata,
    handleKeydown,
    handlePaste,
    handleDrop,
  }
}
