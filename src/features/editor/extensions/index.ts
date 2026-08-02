import { type Editor } from '@milkdown/kit/core'
import type { NodeSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { createBasePreviewExtension, useBaseWysiwygExtension } from './base'
import { useCodeBlockWysiwygExtension } from './code-block'
import { useGfmPreviewExtension, useGfmWysiwygExtension } from './gfm'
import { useImagesWysiwygExtension } from './images'
import { useSearchWysiwygExtension } from './search'

/** 按稳定顺序注册 WYSIWYG Markdown 扩展。 */
export function useWysiwygMarkdownExtensions(editor: Editor, options: {
  importImageFile: (file: File) => Promise<string | null>
  isDocumentActive: () => boolean
  onImageSelect: (view: EditorView, selection: NodeSelection) => void
  resolveImageSource: (src: string) => string | Promise<string>
}) {
  const baseEditor = useGfmWysiwygExtension(useBaseWysiwygExtension(editor))
  const imageEditor = useImagesWysiwygExtension(baseEditor, {
    importFile: options.importImageFile,
    isActive: options.isDocumentActive,
    onSelect: options.onImageSelect,
    resolveSource: options.resolveImageSource,
  })
  return useCodeBlockWysiwygExtension(useSearchWysiwygExtension(imageEditor))
}

/** 按稳定顺序创建并配置 Preview Markdown 扩展。 */
export function createMarkdownPreview() {
  return useGfmPreviewExtension(createBasePreviewExtension())
}
