import { type Editor } from '@milkdown/kit/core'
import {
  findTextMatches,
  searchHighlightPlugin,
  updateSearchHighlight,
  type SearchMatch,
} from '../../wysiwyg/searchHighlight'

/** 注册文档内搜索高亮能力。 */
export function useSearchWysiwygExtension(editor: Editor) {
  return editor.use(searchHighlightPlugin)
}

export { findTextMatches, updateSearchHighlight, type SearchMatch }
