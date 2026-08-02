import { type Editor } from '@milkdown/kit/core'
import { codeBlockInteractionPlugin } from '../../wysiwyg/codeBlock'

/** 注册代码块退出和空代码块转换交互。 */
export function useCodeBlockWysiwygExtension(editor: Editor) {
  return editor.use(codeBlockInteractionPlugin)
}
