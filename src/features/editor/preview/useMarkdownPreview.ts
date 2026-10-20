/** markdown-it 预览渲染与本地图片、HTML 媒体资源解析。 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { isTauri } from '@/platform/tauri/client'
import { resolveHtmlResourceUrl } from '@/platform/tauri/resources'
import { getDocumentImageOptions } from '@/features/images/model/imageSettings'
import type { OpenDocument } from '../../documents/model/documentTypes.ts'
import { createMarkdownPreview } from '../extensions'
import { highlightCodeBlocks } from '../extensions/code-block'
import { collectLocalImageSources, useImagesPreviewExtension } from '../extensions/images'
import { renderMermaidDiagrams } from '../extensions/mermaid'
import { collectHtmlResourceSources } from '../extensions/html'

export function useMarkdownPreview(
  content: Ref<string>,
  activeDocument: ComputedRef<OpenDocument | undefined>,
) {
  const localResourceUrls = ref<Record<string, string>>({})
  const markdown = createMarkdownPreview()
  useImagesPreviewExtension(markdown, (src) => localResourceUrls.value[src])

  let resourceLoadSequence = 0
  watch(
    [content, () => activeDocument.value?.path, () => activeDocument.value?.id],
    async ([source, documentPath, documentId]) => {
      const sequence = ++resourceLoadSequence
      if (!isTauri() || !documentId) {
        localResourceUrls.value = {}
        return
      }
      const tokens = markdown.parse(source ?? '', {})
      const sources = collectHtmlResourceSources(tokens, collectLocalImageSources(tokens))
      const entries = await Promise.all(
        Array.from(sources, async (src) => {
          try {
            return [
              src,
              await resolveHtmlResourceUrl(
                src,
                documentPath ?? null,
                documentId,
                getDocumentImageOptions(source ?? ''),
              ),
            ] as const
          } catch {
            return null
          }
        }),
      )
      if (sequence === resourceLoadSequence)
        localResourceUrls.value = Object.fromEntries(entries.filter((entry) => entry !== null))
    },
    { immediate: true },
  )

  return {
    enhancePreview: (container: HTMLElement) =>
      Promise.all([highlightCodeBlocks(container), renderMermaidDiagrams(container)]),
    renderedHtml: computed(() => markdown.render(content.value)),
  }
}
