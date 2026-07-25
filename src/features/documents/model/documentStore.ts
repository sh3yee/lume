/**
 * documentStore - 文档内存状态
 *
 * 管理打开文档、活动标签、内容、光标和关闭流程；文件 IO 与会话存储由外部模块负责。
 */
import { computed, ref } from 'vue'
import { calculateDocumentStats } from './documentStats'
import type {
  CursorPosition,
  DocumentDropPosition,
  DocumentSession,
  DocumentStats,
  OpenDocument,
} from './documentTypes'

const DEFAULT_CONTENT = `# 欢迎使用 Lume

Lume 是一款面向个人创作与本地知识管理的桌面 Markdown 编辑器。

## 功能特性

- ✏️ **实时编辑** — 左侧编辑，右侧即时预览
- 📝 **Markdown 渲染** — 支持完整 Markdown 语法
- 🎨 **双主题** — 亮色 / 暗色一键切换
- 📁 **本地知识管理** — 基于文件系统的工作区

## 快速开始

直接在左侧编辑区输入 Markdown 内容，右侧预览区会实时渲染。

> 提示：试试修改这段文字，看看右侧预览的变化！

### 代码示例

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`
}

console.log(greet('Lume'))
\`\`\`

### 列表示例

1. 有序列表项一
2. 有序列表项二
3. 有序列表项三

- 无序列表项 A
- 无序列表项 B
- 无序列表项 C

---

开始你的创作之旅吧！
`

let documentSequence = 0

function createDocumentRecord(
  content = '',
  name = '未命名文档',
  path: string | null = null,
): OpenDocument {
  documentSequence += 1
  return {
    id: `document-${documentSequence}`,
    name,
    path,
    content,
    isDirty: false,
    cursor: { line: 1, column: 1 },
  }
}

const documents = ref<OpenDocument[]>([
  createDocumentRecord(DEFAULT_CONTENT, '欢迎使用 Lume.md'),
])
const activeDocumentId = ref(documents.value[0].id)
const pendingCloseDocument = ref<OpenDocument | null>(null)
const pendingCloseDocumentIds: string[] = []
let closeQueueCompletion: ((completed: boolean) => void) | null = null
let sessionHydrated = false

function syncDocumentSequence() {
  documentSequence = documents.value.reduce((maximum, document) => {
    const sequence = Number(document.id.match(/^document-(\d+)$/)?.[1] ?? 0)
    return Math.max(maximum, sequence)
  }, documentSequence)
}

/** 使用外部 Repository 恢复的快照初始化 Store，仅首次调用生效。 */
function hydrateDocumentSession(session: DocumentSession | null) {
  if (sessionHydrated) return
  sessionHydrated = true
  if (!session) return
  documents.value = session.documents
  activeDocumentId.value = session.activeDocumentId
  syncDocumentSequence()
}

const activeDocument = computed(() =>
  documents.value.find((document) => document.id === activeDocumentId.value) ?? documents.value[0],
)

const content = computed<string>({
  get: () => activeDocument.value?.content ?? '',
  set: (text) => {
    if (!activeDocument.value || activeDocument.value.content === text) return
    activeDocument.value.content = text
    activeDocument.value.isDirty = true
  },
})

const cursor = computed<CursorPosition>(() =>
  activeDocument.value?.cursor ?? { line: 1, column: 1 },
)
const stats = computed<DocumentStats>(() => calculateDocumentStats(content.value))

function updateCursor(line: number, column: number) {
  if (activeDocument.value) activeDocument.value.cursor = { line, column }
}

function updateDocumentCursor(id: string, line: number, column: number) {
  const document = documents.value.find((item) => item.id === id)
  if (document) document.cursor = { line, column }
}

function updateDocumentContent(id: string, text: string, markDirty = true) {
  const document = documents.value.find((item) => item.id === id)
  if (!document || document.content === text) return false
  document.content = text
  if (markDirty) document.isDirty = true
  return true
}

function setContent(text: string, markDirty = true) {
  if (!activeDocument.value) return
  activeDocument.value.content = text
  if (markDirty) activeDocument.value.isDirty = true
}

function newDocument() {
  const document = createDocumentRecord()
  documents.value.push(document)
  activeDocumentId.value = document.id
  return document
}

function openDocument(text: string, name: string, path: string | null) {
  const existing = path ? documents.value.find((document) => document.path === path) : undefined
  if (existing) {
    activeDocumentId.value = existing.id
    return existing
  }

  const document = createDocumentRecord(text, name, path)
  documents.value.push(document)
  activeDocumentId.value = document.id
  return document
}

function activateDocument(id: string) {
  if (documents.value.some((document) => document.id === id)) activeDocumentId.value = id
}

function moveDocument(sourceId: string, targetId: string, position: DocumentDropPosition) {
  if (sourceId === targetId) return false
  const sourceIndex = documents.value.findIndex((document) => document.id === sourceId)
  if (sourceIndex < 0 || !documents.value.some((document) => document.id === targetId)) return false

  const [sourceDocument] = documents.value.splice(sourceIndex, 1)
  const targetIndex = documents.value.findIndex((document) => document.id === targetId)
  documents.value.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, sourceDocument)
  return true
}

function closeDocument(id: string) {
  const index = documents.value.findIndex((document) => document.id === id)
  if (index < 0) return
  const wasActive = activeDocumentId.value === id
  documents.value.splice(index, 1)

  if (documents.value.length === 0) {
    const document = createDocumentRecord()
    documents.value.push(document)
    activeDocumentId.value = document.id
  } else if (wasActive) {
    activeDocumentId.value = documents.value[Math.min(index, documents.value.length - 1)].id
  }
}

function finishCloseQueue(completed: boolean) {
  const completion = closeQueueCompletion
  closeQueueCompletion = null
  completion?.(completed)
}

function processCloseDocumentQueue() {
  while (pendingCloseDocumentIds.length > 0) {
    const id = pendingCloseDocumentIds.shift()!
    const document = documents.value.find((item) => item.id === id)
    if (!document) continue
    if (document.isDirty) {
      pendingCloseDocument.value = document
      return false
    }
    closeDocument(id)
  }

  finishCloseQueue(true)
  return true
}

function requestCloseDocuments(ids: string[], onComplete?: (completed: boolean) => void) {
  if (pendingCloseDocument.value) return false
  if (onComplete) closeQueueCompletion = onComplete

  const existingIds = new Set(documents.value.map((document) => document.id))
  const queuedIds = new Set(pendingCloseDocumentIds)
  for (const id of ids) {
    if (existingIds.has(id) && !queuedIds.has(id)) {
      pendingCloseDocumentIds.push(id)
      queuedIds.add(id)
    }
  }
  return processCloseDocumentQueue()
}

function requestCloseDocument(id: string) {
  return requestCloseDocuments([id])
}

function confirmCloseDocument() {
  const document = pendingCloseDocument.value
  if (!document) return
  pendingCloseDocument.value = null
  closeDocument(document.id)
  processCloseDocumentQueue()
}

function cancelCloseDocument() {
  pendingCloseDocument.value = null
  pendingCloseDocumentIds.length = 0
  finishCloseQueue(false)
}

function updateActiveDocument(metadata: Partial<Pick<OpenDocument, 'name' | 'path' | 'isDirty'>>) {
  if (activeDocument.value) Object.assign(activeDocument.value, metadata)
}

/** 获取可由外部 Repository 持久化的文档会话快照。 */
function getDocumentSessionSnapshot(): DocumentSession {
  return {
    version: 1,
    activeDocumentId: activeDocumentId.value,
    documents: documents.value,
  }
}

export function useDocumentStore() {
  return {
    documents,
    activeDocumentId,
    activeDocument,
    pendingCloseDocument,
    content,
    cursor,
    stats,
    updateCursor,
    updateDocumentCursor,
    updateDocumentContent,
    setContent,
    newDocument,
    openDocument,
    activateDocument,
    moveDocument,
    closeDocument,
    requestCloseDocument,
    requestCloseDocuments,
    confirmCloseDocument,
    cancelCloseDocument,
    updateActiveDocument,
    hydrateDocumentSession,
    getDocumentSessionSnapshot,
  }
}

export type { CursorPosition, DocumentDropPosition, DocumentStats, OpenDocument }