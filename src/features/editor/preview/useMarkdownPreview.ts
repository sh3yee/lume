/** markdown-it 预览渲染与本地图片 URL 解析。 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import MarkdownIt from 'markdown-it'
import { convertFileSrc } from '@tauri-apps/api/core'
import { isTauri, resolveImagePath } from '../../../types/tauri.ts'
import { parseSizedImageHtml, serializeSizedImageHtml } from '../../../utils/imageHtml.ts'
import type { OpenDocument } from '../../documents/model/documentTypes.ts'

const REMOTE_IMAGE_PATTERN = /^(?:https?:|data:|blob:|\/\/)/i

export function useMarkdownPreview(content: Ref<string>, activeDocument: ComputedRef<OpenDocument | undefined>) {
  const localImageUrls = ref<Record<string, string>>({})
  const markdown = new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: false })

  function renderSafeHtmlImage(value: string) {
    const image = parseSizedImageHtml(value)
    if (!image) return markdown.utils.escapeHtml(value)
    return serializeSizedImageHtml({ ...image, src: localImageUrls.value[image.src] ?? image.src })
  }

  markdown.renderer.rules.html_inline = (tokens, index) => renderSafeHtmlImage(tokens[index].content)
  markdown.renderer.rules.html_block = (tokens, index) => renderSafeHtmlImage(tokens[index].content)
  const defaultImageRenderer = markdown.renderer.rules.image!
  markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
    const token = tokens[index]
    const originalSrc = token.attrGet('src') ?? ''
    const displaySrc = localImageUrls.value[originalSrc]
    if (displaySrc) token.attrSet('src', displaySrc)
    const html = defaultImageRenderer(tokens, index, options, env, renderer)
    if (displaySrc) token.attrSet('src', originalSrc)
    return html
  }

  function collectImageSources(tokens: ReturnType<typeof markdown.parse>, result = new Set<string>()) {
    for (const token of tokens) {
      if (token.type === 'image') {
        const src = token.attrGet('src')
        if (src && !REMOTE_IMAGE_PATTERN.test(src)) result.add(src)
      }
      if (token.type === 'html_inline' || token.type === 'html_block') {
        const image = parseSizedImageHtml(token.content)
        if (image && !REMOTE_IMAGE_PATTERN.test(image.src)) result.add(image.src)
      }
      if (token.children) collectImageSources(token.children, result)
    }
    return result
  }

  let imageLoadSequence = 0
  watch([content, () => activeDocument.value?.path, () => activeDocument.value?.id], async ([source, documentPath, documentId]) => {
    const sequence = ++imageLoadSequence
    if (!isTauri() || !documentId) {
      localImageUrls.value = {}
      return
    }
    const entries = await Promise.all(Array.from(collectImageSources(markdown.parse(source ?? '', {})), async (src) => {
      try {
        return [src, convertFileSrc(await resolveImagePath(src, documentPath ?? null, documentId))] as const
      } catch {
        return null
      }
    }))
    if (sequence === imageLoadSequence) localImageUrls.value = Object.fromEntries(entries.filter((entry) => entry !== null))
  }, { immediate: true })

  return { renderedHtml: computed(() => markdown.render(content.value)) }
}