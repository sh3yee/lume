import type { Editor } from '@milkdown/kit/core'
import { emojiCompletionPlugin } from './interaction'
import { emojiInputRule, emojiSchema, emojiView } from './schema'
import { emojiRemark } from './syntax'
import './styles.css'

export const useEmojiWysiwygExtension = (editor: Editor) =>
  editor
    .use(emojiRemark)
    .use(emojiSchema)
    .use(emojiView)
    .use(emojiInputRule)
    .use(emojiCompletionPlugin)

export { useEmojiPreviewExtension } from './preview'
