import { t } from '@/app/i18n'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useDocument } from '@/features/documents/model/useDocument'
import {
  chooseImageFolder,
  groupImageSources,
  type ImageFileOperation,
} from '../services/imageFileOperations'
import { collectMarkdownImageReferences } from '../services/markdownImageReferences'
import { imageSettings, setDocumentImageMetadata } from '../model/imageSettings'
import { useImageFileOperations, type ImageSourceEditor } from './useImageFileOperations'

export interface ImageCommandEditor extends ImageSourceEditor {
  flushPendingMarkdown?: () => void
  insertLocalImages: () => Promise<void>
  insertImage: () => void
  setImageMetadata: (key: 'typora-copy-images-to' | 'typora-root-url', value: string | null) => void
}

export const useImageCommands = (options: {
  getEditor: () => ImageCommandEditor | null
  onMessage: (message: string) => void
}) => {
  const { activeDocument, documents, updateDocumentContent, persistDocumentSession } = useDocument()
  const busy = ref(false)
  const imageFiles = useImageFileOperations(options.getEditor)
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
          throw new Error(t('请先在偏好设置 → 图片中允许根据文档设置自动上传。'))
        if (command === 'imageRuleCopy' && !imageSettings.allowYamlCopy)
          throw new Error(t('请先在偏好设置 → 图片中允许根据文档设置复制图片。'))
        const key = command.startsWith('imageRoot') ? 'typora-root-url' : 'typora-copy-images-to'
        if (command === 'imageRootReset' || command === 'imageRuleGlobal')
          updateMetadata(snapshot.id, key, null)
        else if (command === 'imageRuleUpload') updateMetadata(snapshot.id, key, 'upload')
        else if (command === 'imageRuleOriginal') updateMetadata(snapshot.id, key, '')
        else {
          if (!snapshot.path) throw new Error(t('请先保存文档，再设置图片目录。'))
          const folder = await chooseImageFolder(
            command === 'imageRoot' ? t('选择图片根目录') : t('插入图片时复制到此目录'),
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
        options.onMessage(t('文档中没有符合条件的图片。'))
        return
      }
      const folder =
        operation === 'uploadImage' ? undefined : await chooseImageFolder(t('选择图片目标文件夹'))
      if (folder === null) return
      busy.value = true
      const groups = await groupImageSources(sources, snapshot)
      let completed = 0
      const errors: string[] = []
      for (const aliases of groups) {
        try {
          options.onMessage(
            t('正在处理图片 {0} / {1}…', completed + errors.length + 1, groups.length),
          )
          const updated = await imageFiles.execute(
            operation,
            aliases,
            snapshot,
            folder ? `${folder.replace(/[\\/]$/, '')}/` : undefined,
          )
          if (updated) completed++
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error))
        }
      }
      options.onMessage(
        t(
          '已处理 {0} 张图片{1}',
          completed,
          errors.length ? t('，{0} 张失败：{1}', errors.length, errors[0]) : '',
        ),
      )
    } catch (error) {
      options.onMessage(error instanceof Error ? error.message : String(error))
    } finally {
      busy.value = false
    }
  }
  const handleImageError = (event: Event) =>
    options.onMessage(String((event as CustomEvent<unknown>).detail ?? t('图片操作失败')))
  onMounted(() => {
    window.addEventListener('lume:image-error', handleImageError)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('lume:image-error', handleImageError)
  })
  return { busy, execute }
}
