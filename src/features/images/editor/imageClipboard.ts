import { isTauri } from '@/platform/tauri/client'
import { readClipboardImagePaths } from '@/platform/tauri/images'
import { normalizeImageSourceInput } from '@/utils/imageSource'
import { DOMSerializer, type Schema } from '@milkdown/kit/prose/model'

export interface ImageClipboardOrigin {
  documentId: string
  documentPath: string | null
  rootUrl?: string
}

export interface ImageClipboardOptions {
  getImageClipboardOrigin?: () => ImageClipboardOrigin | null
  importImageSource?: (src: string, origin?: ImageClipboardOrigin) => Promise<string>
}

const IMAGE_ORIGIN_ATTRIBUTE = 'data-lume-image-origin'

/** 来源信息只写入剪贴板 HTML，不进入文档节点或 Markdown。 */
export const createImageClipboardSerializer = (
  schema: Schema,
  getOrigin?: ImageClipboardOptions['getImageClipboardOrigin'],
) => {
  const serializer = DOMSerializer.fromSchema(schema)
  const serializeImage = serializer.nodes.image
  if (!serializeImage || !getOrigin) return serializer
  return new DOMSerializer(
    {
      ...serializer.nodes,
      image: (node) => {
        const image = DOMSerializer.renderSpec(document, serializeImage(node)).dom
        const origin = getOrigin()
        if (origin && node.attrs.src && !/^(?:https?:|data:|blob:|\/\/)/i.test(node.attrs.src))
          (image as HTMLElement).setAttribute(IMAGE_ORIGIN_ATTRIBUTE, JSON.stringify(origin))
        return image
      },
    },
    serializer.marks,
  )
}

export const getClipboardImageOrigins = (data: DataTransfer | null) => {
  const origins = new Map<string, ImageClipboardOrigin>()
  const html = data?.getData('text/html') ?? ''
  if (!html.includes(IMAGE_ORIGIN_ATTRIBUTE)) return origins
  const document = new DOMParser().parseFromString(html, 'text/html')
  for (const image of document.querySelectorAll(`img[${IMAGE_ORIGIN_ATTRIBUTE}]`)) {
    const src = image.getAttribute('src')
    if (!src) continue
    try {
      const origin: unknown = JSON.parse(image.getAttribute(IMAGE_ORIGIN_ATTRIBUTE) ?? '')
      if (!origin || typeof origin !== 'object' || Array.isArray(origin)) continue
      const value = origin as Record<string, unknown>
      if (
        typeof value.documentId !== 'string' ||
        !/^[\w-]+$/.test(value.documentId) ||
        (value.documentPath !== null && typeof value.documentPath !== 'string') ||
        (value.rootUrl !== undefined && typeof value.rootUrl !== 'string')
      )
        continue
      origins.set(src, {
        documentId: value.documentId,
        documentPath: value.documentPath,
        rootUrl: value.rootUrl,
      })
    } catch {
      // 外部 HTML 中无效的来源标记按普通图片处理。
    }
  }
  return origins
}

const LOCAL_IMAGE =
  /^(?:file:\/\/|[a-z]:[\\/]|\\\\|\/)[^\r\n]+\.(?:png|jpe?g|gif|webp|bmp|avif|svg|ico|tiff?)(?:[?#][^\r\n]*)?$/i

/** 在 paste 事件内读取 WebView 数据；原文件路径优先于同一图片的位图副本。 */
export const getClipboardImageInput = (data: DataTransfer | null) => {
  if (!data) return null
  const files = Array.from(data.files).filter((file) => file.type.startsWith('image/'))
  const text = data.getData('text/uri-list') || data.getData('text/plain')
  const lines = text
    .split(/\r?\n/)
    .map(normalizeImageSourceInput)
    .filter((line) => line && !line.startsWith('#'))
  const paths = lines.length && lines.every((line) => LOCAL_IMAGE.test(line)) ? lines : []
  const hasFiles = files.length > 0 || Array.from(data.types).includes('Files')
  if (!paths.length && !hasFiles) return null
  return {
    files,
    paths: paths.length
      ? Promise.resolve(paths)
      : isTauri()
        ? readClipboardImagePaths().catch(() => [])
        : Promise.resolve([] as string[]),
  }
}
