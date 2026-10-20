import { isTauri } from '@/platform/tauri/client'
import { readClipboardImagePaths } from '@/platform/tauri/images'
import { normalizeImageSourceInput } from '@/utils/imageSource'

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
