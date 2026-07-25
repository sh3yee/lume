/** 光标位置。 */
export interface CursorPosition {
  line: number
  column: number
}

/** 文档统计信息。 */
export interface DocumentStats {
  chars: number
  words: number
  lines: number
  readingTime: number
}

/** 编辑器中打开的文档。 */
export interface OpenDocument {
  id: string
  name: string
  path: string | null
  content: string
  isDirty: boolean
  cursor: CursorPosition
}

/** 标签拖放到目标标签的相对位置。 */
export type DocumentDropPosition = 'before' | 'after'

/** 持久化的编辑会话快照。 */
export interface DocumentSession {
  version: 1
  activeDocumentId: string
  documents: OpenDocument[]
}