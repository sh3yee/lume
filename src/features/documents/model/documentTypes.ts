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

export type DocumentKind = 'placeholder' | 'welcome' | 'draft' | 'file'

/** 开始读取时记录的活动标签，成功后再检查复用条件。 */
export interface DocumentReuseCandidate {
  id: string
  revision: number
}

/** 编辑器中打开的文档。 */
export interface OpenDocument {
  id: string
  /** 旧会话可能缺少来源，无法确认的文档不自动复用。 */
  kind?: DocumentKind
  name: string
  path: string | null
  content: string
  /** 最近确认的磁盘内容；旧版未保存会话可能没有基准。 */
  savedContent?: string
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
