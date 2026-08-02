import { type Editor } from '@milkdown/kit/core'
import type { NodeSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import type MarkdownIt from 'markdown-it'
import { parseSizedImageHtml, serializeSizedImageHtml } from '@/utils/imageHtml'
import { createImageInputPlugin, insertNativeImagePaths } from '../../wysiwyg/imageInput'
import { createImageNodeView } from '../../wysiwyg/imageNodeView'
import { sizedImageRemarkPlugin, sizedImageSchema } from '../../wysiwyg/imageSchema'

const REMOTE_IMAGE_PATTERN = /^(?:https?:|data:|blob:|\/\/)/i

/** 注册图片 Schema、Markdown 往返、NodeView 和输入处理。 */
export function useImagesWysiwygExtension(editor: Editor, options: {
  importFile: (file: File) => Promise<string | null>
  isActive: () => boolean
  onSelect: (view: EditorView, selection: NodeSelection) => void
  resolveSource: (src: string) => string | Promise<string>
}) {
  const imageNodeView = createImageNodeView({
    onSelect: options.onSelect,
    resolveImageSource: options.resolveSource,
  })
  const imageInputPlugin = createImageInputPlugin({
    importFile: options.importFile,
    isActive: options.isActive,
  })

  return editor
    .use(sizedImageSchema)
    .use(sizedImageRemarkPlugin)
    .use(imageNodeView)
    .use(imageInputPlugin)
}

/** 注册图片 HTML 安全渲染和本地图片 URL 替换。 */
export function useImagesPreviewExtension(
  markdown: MarkdownIt,
  resolveSource: (src: string) => string | undefined,
) {
  const renderSafeHtmlImage = (value: string) => {
    const image = parseSizedImageHtml(value)
    if (!image) return markdown.utils.escapeHtml(value)
    return serializeSizedImageHtml({ ...image, src: resolveSource(image.src) ?? image.src })
  }

  markdown.renderer.rules.html_inline = (tokens, index) => renderSafeHtmlImage(tokens[index].content)
  markdown.renderer.rules.html_block = (tokens, index) => renderSafeHtmlImage(tokens[index].content)
  const defaultImageRenderer = markdown.renderer.rules.image!
  markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
    const token = tokens[index]
    const originalSrc = token.attrGet('src') ?? ''
    const displaySrc = resolveSource(originalSrc)
    if (displaySrc) token.attrSet('src', displaySrc)
    const html = defaultImageRenderer(tokens, index, options, env, renderer)
    if (displaySrc) token.attrSet('src', originalSrc)
    return html
  }

  return markdown
}

/** 收集 Preview 中需要通过平台层解析的本地图片路径。 */
export function collectLocalImageSources(
  tokens: ReturnType<MarkdownIt['parse']>,
  result = new Set<string>(),
) {
  for (const token of tokens) {
    if (token.type === 'image') {
      const src = token.attrGet('src')
      if (src && !REMOTE_IMAGE_PATTERN.test(src)) result.add(src)
    }
    if (token.type === 'html_inline' || token.type === 'html_block') {
      const image = parseSizedImageHtml(token.content)
      if (image && !REMOTE_IMAGE_PATTERN.test(image.src)) result.add(image.src)
    }
    if (token.children) collectLocalImageSources(token.children, result)
  }
  return result
}

export { insertNativeImagePaths }
