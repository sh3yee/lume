import { convertFileSrc } from '@tauri-apps/api/core'
import { invokeCommand, isTauri } from './client'
import type { ImagePathOptions } from './images'

/** HTML 图片和媒体共用文档路径规则，入口只解析普通资源文件。 */
export const resolveHtmlResourceUrl = async (
  source: string,
  documentPath: string | null,
  documentId: string,
  options?: ImagePathOptions,
) => {
  if (!isTauri() || /^(?:https?:|data:|blob:|asset:|\/\/|#)/i.test(source)) return source
  const path = await invokeCommand<string>('lume_resolve_html_resource_path', {
    markdownPath: source,
    documentPath,
    documentId,
    options,
  })
  return convertFileSrc(path)
}
