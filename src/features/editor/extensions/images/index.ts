import type { ImageInputAttributes } from '../../wysiwyg/imageInput'
import { type Editor } from '@milkdown/kit/core'
import type { NodeSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import type MarkdownIt from 'markdown-it'
import { parseSizedImageHtml, serializeSizedImageHtml } from '@/utils/imageHtml'
import { parseMarkdownImageAt } from '@/utils/imageMarkdown'
import { createImageInputPlugin, insertNativeImagePaths } from '../../wysiwyg/imageInput'
import { createImageNodeView } from '../../wysiwyg/imageNodeView'
import { sizedImageRemarkPlugin, sizedImageSchema } from '../../wysiwyg/imageSchema'
import { imageHtmlInputRule, imageSourceInputRule } from '../../wysiwyg/imageInputRule'

const REMOTE_IMAGE_PATTERN = /^(?:https?:|data:|blob:|\/\/)/i

/** 注册图片 Schema、Markdown 往返、NodeView 和输入处理。 */
export function useImagesWysiwygExtension(
  editor: Editor,
  options: {
    importFile: (file: File) => Promise<string | null>
    importImageSource?: (src: string) => Promise<string>
    isActive: () => boolean
    onSelect: (view: EditorView, selection: NodeSelection) => void
    resolveSource: (src: string) => string | Promise<string>
    selectImages?: () => Promise<ImageInputAttributes[]>
  },
) {
  const imageNodeView = createImageNodeView({
    onSelect: options.onSelect,
    resolveImageSource: options.resolveSource,
    importImageSource: options.importImageSource,
    selectImages: options.selectImages,
  })
  const imageInputPlugin = createImageInputPlugin({
    importFile: options.importFile,
    importImageSource: options.importImageSource,
    isActive: options.isActive,
  })

  return editor
    .use(sizedImageSchema)
    .use(sizedImageRemarkPlugin)
    .use(imageSourceInputRule)
    .use(imageHtmlInputRule)
    .use(imageNodeView)
    .use(imageInputPlugin)
}

/** 注册图片 HTML 安全渲染和本地图片 URL 替换。 */
export function useImagesPreviewExtension(
  markdown: MarkdownIt,
  resolveSource: (src: string) => string | undefined,
) {
  markdown.inline.ruler.before('image', 'typora_image_path', (state, silent) => {
    const image = parseMarkdownImageAt(state.src, state.pos)
    if (!image) return false
    const localPath = /^(?:file:|[a-z]:[\\/]|\\)/i.test(image.src)
    if (!localPath && (!/\s/.test(image.src) || !markdown.validateLink(image.src))) return false
    if (!silent) {
      const token = state.push('image', 'img', 0)
      token.attrs = [
        ['src', image.src],
        ['alt', image.alt],
      ]
      if (image.title) token.attrSet('title', image.title)
      const text = new state.Token('text', '', 0)
      text.content = image.alt
      token.children = [text]
      token.content = image.alt
    }
    state.pos = image.end
    return true
  })

  const renderSafeHtmlImage = (value: string, standalone: boolean) => {
    const image = parseSizedImageHtml(value)
    if (!image) return markdown.utils.escapeHtml(value)
    const html = serializeSizedImageHtml(
      { ...image, src: resolveSource(image.src) ?? image.src },
      { forDisplay: true },
    )
    return standalone ? html.replace('<img ', '<img class="lume-image-standalone" ') : html
  }

  markdown.renderer.rules.html_inline = (tokens, index) =>
    renderSafeHtmlImage(tokens[index].content, tokens.length === 1)
  markdown.renderer.rules.html_block = (tokens, index) =>
    renderSafeHtmlImage(tokens[index].content, true)
  const defaultImageRenderer = markdown.renderer.rules.image!
  markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
    const token = tokens[index]
    const originalSrc = token.attrGet('src') ?? ''
    if (tokens.length === 1) token.attrSet('class', 'lume-image-standalone')
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
