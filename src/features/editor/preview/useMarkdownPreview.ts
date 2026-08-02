/** markdown-it 预览渲染与本地图片 URL 解析。 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { isTauri } from '@/platform/tauri/client'
import { resolveImageUrl } from '@/platform/tauri/images'
import type { OpenDocument } from '../../documents/model/documentTypes.ts'
import { createMarkdownPreview } from '../extensions'
import { highlightCodeBlocks } from '../extensions/code-block'
import { collectLocalImageSources, useImagesPreviewExtension } from '../extensions/images'
import { renderMermaidDiagrams } from '../extensions/mermaid'

export function useMarkdownPreview(content: Ref<string>, activeDocument: ComputedRef<OpenDocument | undefined>) {
  const localImageUrls = ref<Record<string, string>>({})
  const markdown = createMarkdownPreview()
  useImagesPreviewExtension(markdown, (src) => localImageUrls.value[src])

  let imageLoadSequence = 0
  watch([content, () => activeDocument.value?.path, () => activeDocument.value?.id], async ([source, documentPath, documentId]) => {
    const sequence = ++imageLoadSequence
    if (!isTauri() || !documentId) {
      localImageUrls.value = {}
      return
    }
    const entries = await Promise.all(Array.from(collectLocalImageSources(markdown.parse(source ?? '', {})), async (src) => {
      try {
        return [src, await resolveImageUrl(src, documentPath ?? null, documentId)] as const
      } catch {
        return null
      }
    }))
    if (sequence === imageLoadSequence) localImageUrls.value = Object.fromEntries(entries.filter((entry) => entry !== null))
  }, { immediate: true })

  return {
    enhancePreview: (container: HTMLElement) => Promise.all([
      highlightCodeBlocks(container),
      renderMermaidDiagrams(container),
    ]),
    renderedHtml: computed(() => markdown.render(content.value)),
  }
}