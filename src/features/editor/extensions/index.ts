import type { ImageInputAttributes } from '../wysiwyg/imageInput'
import { type Editor } from '@milkdown/kit/core'
import type { NodeSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { createBasePreviewExtension, useBaseWysiwygExtension } from './base'
import { useCodeBlockPreviewExtension, useCodeBlockWysiwygExtension } from './code-block'
import { useFootnotesPreviewExtension, useFootnotesWysiwygExtension } from './footnotes'
import { useGfmPreviewExtension, useGfmWysiwygExtension } from './gfm'
import { useImagesWysiwygExtension } from './images'
import { useMarkdownPasteWysiwygExtension } from './markdown-paste'
import { useMathPreviewExtension, useMathWysiwygExtension } from './math'
import { useMermaidPreviewExtension, useMermaidWysiwygExtension } from './mermaid'
import { useSearchWysiwygExtension } from './search'
import { useFrontMatterPreviewExtension, useFrontMatterWysiwygExtension } from './front-matter'
import { useTocPreviewExtension, useTocWysiwygExtension } from './toc'
import { useCalloutsPreviewExtension, useCalloutsWysiwygExtension } from './callouts'
import { useHtmlPreviewExtension, useHtmlWysiwygExtension } from './html'
import { captureSelectionContext, type EditorContext } from '../wysiwyg/selectionContext'

/** 按稳定顺序注册 WYSIWYG Markdown 扩展。 */
export function useWysiwygMarkdownExtensions(
  editor: Editor,
  options: {
    importImageFile: (file: File) => Promise<string | null>
    importImageSource?: (src: string) => Promise<string>
    selectImages?: () => Promise<ImageInputAttributes[]>
    isDocumentActive: () => boolean
    onImageSelect: (view: EditorView, selection: NodeSelection) => void
    resolveImageSource: (src: string) => string | Promise<string>
    resolveHtmlSource?: (src: string) => string | Promise<string>
    onViewUpdate?: (view: EditorView) => void
    onAction?: (id: string, target: EditorContext) => void
  },
) {
  const documentEditor = useTocWysiwygExtension(
    useFrontMatterWysiwygExtension(useGfmWysiwygExtension(useBaseWysiwygExtension(editor))),
  )
  const baseEditor = useCalloutsWysiwygExtension(documentEditor)
  const imageEditor = useImagesWysiwygExtension(baseEditor, {
    importFile: options.importImageFile,
    importImageSource: options.importImageSource,
    selectImages: options.selectImages,
    isActive: options.isDocumentActive,
    onSelect: options.onImageSelect,
    resolveSource: options.resolveImageSource,
  })
  const mathEditor = useMathWysiwygExtension(
    useHtmlWysiwygExtension(
      imageEditor,
      options.resolveHtmlSource ?? options.resolveImageSource,
      (view, href) => {
        const target = captureSelectionContext(view)
        target.link = {
          from: target.selection.from,
          to: target.selection.to,
          mark: view.state.schema.marks.link.create({ href }),
        }
        options.onAction?.('openLink', target)
      },
    ),
  )
  const mermaidEditor = useMermaidWysiwygExtension(mathEditor)
  const footnotesEditor = useFootnotesWysiwygExtension(mermaidEditor)
  const codeBlockEditor = useCodeBlockWysiwygExtension(footnotesEditor, options.onViewUpdate)
  return useMarkdownPasteWysiwygExtension(useSearchWysiwygExtension(codeBlockEditor))
}

/** 按稳定顺序创建并配置 Preview Markdown 扩展。 */
export function createMarkdownPreview() {
  const documentMarkdown = useTocPreviewExtension(
    useFrontMatterPreviewExtension(useGfmPreviewExtension(createBasePreviewExtension())),
  )
  const markdown = useHtmlPreviewExtension(useCalloutsPreviewExtension(documentMarkdown))
  const footnotesMarkdown = useFootnotesPreviewExtension(markdown)
  const mathMarkdown = useMathPreviewExtension(footnotesMarkdown)
  return useCodeBlockPreviewExtension(useMermaidPreviewExtension(mathMarkdown))
}
