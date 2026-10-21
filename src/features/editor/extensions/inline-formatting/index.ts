import type { Editor } from '@milkdown/kit/core'
import {
  inlineFormattingInputRule,
  inlineFormattingPreferences,
  inlineFormattingSchemas,
} from './schema'
import { inlineFormattingRemark } from './syntax'
import './styles.css'

export const useInlineFormattingWysiwygExtension = (editor: Editor) => {
  editor.use(inlineFormattingRemark)
  for (const schema of inlineFormattingSchemas) editor.use(schema)
  return editor.use(inlineFormattingInputRule).use(inlineFormattingPreferences)
}

export { useInlineFormattingPreviewExtension } from './preview'
