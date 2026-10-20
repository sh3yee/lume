import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useDocument } from '@/features/documents/model/useDocument'
import {
  chooseImageFolder,
  groupImageSources,
  operateImageFile,
  rebaseImageSource,
  type ImageFileOperation,
} from '../services/imageFileOperations'
import {
  collectMarkdownImageReferences,
  replaceMarkdownImageSources,
} from '../services/markdownImageReferences'
import { imageSettings, setDocumentImageMetadata } from '../model/imageSettings'

export interface ImageCommandEditor {
  flushPendingMarkdown?: () => void
  insertLocalImages: () => Promise<void>
  insertImage: () => void
  replaceImageSources: (replacements: ReadonlyMap<string, string>) => void
  setImageMetadata: (key: 'typora-copy-images-to' | 'typora-root-url', value: string | null) => void
}

export const useImageCommands = (options: {
  getEditor: () => ImageCommandEditor | null
  onMessage: (message: string) => void
}) => {
  const { activeDocument, documents, updateDocumentContent, persistDocumentSession } = useDocument()
  const busy = ref(false)
  const updateMetadata = (
    id: string,
    key: 'typora-copy-images-to' | 'typora-root-url',
    value: string | null,
  ) => {
    if (activeDocument.value?.id === id && options.getEditor()) {
      options.getEditor()!.setImageMetadata(key, value)
      return
    }
    const document = documents.value.find((document) => document.id === id)
    if (!document) return
    updateDocumentContent(id, setDocumentImageMetadata(document.content, key, value))
    persistDocumentSession()
  }
  const execute = async (command: string) => {
    if (busy.value) return
    options.getEditor()?.flushPendingMarkdown?.()
    const document = activeDocument.value
    if (!document) return
    const snapshot = { id: document.id, path: document.path, content: document.content }
    try {
      if (command === 'insertImage') {
        options.getEditor()?.insertImage()
        return
      }
      if (command === 'insertLocalImages') {
        await options.getEditor()?.insertLocalImages()
        return
      }
      if (command.startsWith('imageRule') || command.startsWith('imageRoot')) {
        if (command === 'imageRuleUpload' && !imageSettings.allowYamlUpload)
          throw new Error('请先在偏好设置 → 图片中允许根据文档设置自动上传。')
        if (command === 'imageRuleCopy' && !imageSettings.allowYamlCopy)
          throw new Error('请先在偏好设置 → 图片中允许根据文档设置复制图片。')
        const key = command.startsWith('imageRoot') ? 'typora-root-url' : 'typora-copy-images-to'
        if (command === 'imageRootReset' || command === 'imageRuleGlobal')
          updateMetadata(snapshot.id, key, null)
        else if (command === 'imageRuleUpload') updateMetadata(snapshot.id, key, 'upload')
        else if (command === 'imageRuleOriginal') updateMetadata(snapshot.id, key, '')
        else {
          if (!snapshot.path) throw new Error('请先保存文档，再设置图片目录。')
          const folder = await chooseImageFolder(
            command === 'imageRoot' ? '选择图片根目录' : '插入图片时复制到此目录',
          )
          if (folder) updateMetadata(snapshot.id, key, folder.replace(/\\/g, '/'))
        }
        return
      }
      if (
        !['uploadAllImages', 'copyAllImages', 'moveAllImages', 'downloadAllImages'].includes(
          command,
        )
      )
        return
      const operation: ImageFileOperation =
        command === 'uploadAllImages'
          ? 'uploadImage'
          : command === 'moveAllImages'
            ? 'moveImageTo'
            : 'copyImageTo'
      const sources = [
        ...new Set(collectMarkdownImageReferences(snapshot.content).map((image) => image.src)),
      ]
        .filter((src) => !/^(?:data:|blob:)/i.test(src))
        .filter((src) => command !== 'uploadAllImages' || !/^(?:https?:|\/\/)/i.test(src))
        .filter((src) => command !== 'downloadAllImages' || /^(?:https?:|\/\/)/i.test(src))
      if (!sources.length) {
        options.onMessage('文档中没有符合条件的图片。')
        return
      }
      const folder =
        operation === 'uploadImage' ? undefined : await chooseImageFolder('选择图片目标文件夹')
      if (folder === null) return
      busy.value = true
      const groups = await groupImageSources(sources, snapshot)
      let completed = 0
      const errors: string[] = []
      for (const aliases of groups) {
        const src = aliases[0]!
        try {
          options.onMessage(`正在处理图片 ${completed + errors.length + 1} / ${groups.length}…`)
          const replacement = await operateImageFile(
            operation,
            src,
            snapshot,
            folder ? `${folder.replace(/[\\/]$/, '')}/` : undefined,
          )
          if (replacement === null) continue
          const current = documents.value.find((document) => document.id === snapshot.id)
          const nextSource = current
            ? await rebaseImageSource(replacement, snapshot, current)
            : replacement
          const replacements = new Map(aliases.map((alias) => [alias, nextSource]))
          if (activeDocument.value?.id === snapshot.id && options.getEditor())
            options.getEditor()!.replaceImageSources(replacements)
          else {
            if (current)
              updateDocumentContent(
                snapshot.id,
                replaceMarkdownImageSources(current.content, replacements),
              )
          }
          completed++
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error))
        }
      }
      persistDocumentSession()
      options.onMessage(
        `已处理 ${completed} 张图片${errors.length ? `，${errors.length} 张失败：${errors[0]}` : ''}`,
      )
    } catch (error) {
      options.onMessage(error instanceof Error ? error.message : String(error))
    } finally {
      busy.value = false
    }
  }
  const handleKeydown = (event: KeyboardEvent) => {
    if (
      !(event.ctrlKey || event.metaKey) ||
      !event.shiftKey ||
      event.key.toLowerCase() !== 'i' ||
      document.querySelector('dialog[open]')
    )
      return
    event.preventDefault()
    void execute('insertImage')
  }
  const handleImageError = (event: Event) =>
    options.onMessage(String((event as CustomEvent<unknown>).detail ?? '图片操作失败'))
  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('lume:image-error', handleImageError)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('lume:image-error', handleImageError)
  })
  return { busy, execute }
}
