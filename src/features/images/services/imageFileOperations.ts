import { isTauri } from '@/platform/tauri/client'
import {
  deleteImageFile,
  importImageFile,
  resolveImagePath,
  transferImage,
  uploadImageFiles,
} from '@/platform/tauri/images'
import { getDocumentImageOptions } from '../model/imageSettings'

export type ImageFileOperation = 'copyImageTo' | 'moveImageTo' | 'uploadImage' | 'deleteImageFile'
export const isLocalImage = (src: string) => !/^(?:https?:|data:|blob:|\/\/)/i.test(src)

interface ImageDocument {
  path: string | null
  id: string
  content: string
}

export const rebaseImageSource = async (
  src: string,
  original: ImageDocument,
  current: ImageDocument,
) => {
  if (
    !src ||
    !isLocalImage(src) ||
    (original.path === current.path && original.content === current.content)
  )
    return src
  const path = await resolveImagePath(
    src,
    original.path,
    original.id,
    getDocumentImageOptions(original.content),
  )
  const options = { ...getDocumentImageOptions(current.content), insertAction: 'original' as const }
  return (await importImageFile(path, current.path, current.id, options)).markdownPath
}

export const groupImageSources = async (sources: string[], document: ImageDocument) => {
  const groups = new Map<string, string[]>()
  for (const src of sources) {
    let key = src
    if (isTauri() && isLocalImage(src)) {
      try {
        key = await resolveImagePath(
          src,
          document.path,
          document.id,
          getDocumentImageOptions(document.content),
        )
        if (/^(?:[a-z]:|\\\\)/i.test(key)) key = key.toLowerCase()
      } catch {
        /* 无法解析的地址留给操作流程报告具体错误。 */
      }
    }
    const aliases = groups.get(key) ?? []
    aliases.push(src)
    groups.set(key, aliases)
  }
  return [...groups.values()]
}

export const chooseImageFiles = async (multiple = true) => {
  if (!isTauri()) throw new Error('选择本地图片需要在桌面应用中使用。')
  const { open } = await import('@tauri-apps/plugin-dialog')
  const paths = await open({
    multiple,
    filters: [
      {
        name: '图片',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico'],
      },
    ],
  })
  return typeof paths === 'string' ? [paths] : (paths ?? [])
}

export const chooseImageFolder = async (title: string) => {
  if (!isTauri()) throw new Error('管理图片文件需要在桌面应用中使用。')
  const { open } = await import('@tauri-apps/plugin-dialog')
  const folder = await open({ directory: true, multiple: false, title })
  return typeof folder === 'string' ? folder : null
}

export const chooseImageDestination = async (src: string, title: string) => {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const name = src.split(/[\\/]/).at(-1)?.split(/[?#]/)[0] || 'image.png'
  return save({ title, defaultPath: name })
}

export const operateImageFile = async (
  action: ImageFileOperation,
  src: string,
  document: ImageDocument,
  destination?: string,
) => {
  if (!isTauri()) throw new Error('管理图片文件需要在桌面应用中使用。')
  const options = getDocumentImageOptions(document.content)
  if (action === 'deleteImageFile') {
    const { confirm } = await import('@tauri-apps/plugin-dialog')
    if (
      !(await confirm(
        '删除后将移除本文档中的图片引用，并永久删除磁盘上的原文件。撤销只能恢复引用，无法恢复文件。',
        { title: '删除图片及原文件？', kind: 'warning' },
      ))
    )
      return null
    await deleteImageFile(src, document.path, document.id, options)
    return ''
  }
  if (action === 'uploadImage') {
    if (!options.uploader?.program) throw new Error('请先在偏好设置 → 图片中配置上传工具。')
    return (await uploadImageFiles([src], document.path, document.id, options.uploader, options))[0]
      .markdownPath
  }
  const target =
    destination ??
    (await chooseImageDestination(
      src,
      action === 'moveImageTo' ? '移动 / 重命名图片' : '复制图片到',
    ))
  if (!target) return null
  return (
    await transferImage(
      src,
      target,
      action === 'moveImageTo' ? 'move' : 'copy',
      document.path,
      document.id,
      options,
    )
  ).markdownPath
}
