/**
 * useDocument - 文档状态管理
 *
 * 管理当前 Markdown 文档的内容、光标位置和统计信息。
 * 作为编辑区与预览区之间的共享状态桥梁。
 */
import { computed, ref } from 'vue'

/** 光标位置 */
export interface CursorPosition {
  line: number
  column: number
}

/** 文档统计信息 */
export interface DocumentStats {
  /** 字符数（含空格） */
  chars: number
  /** 字数（中文按字计，英文按词计） */
  words: number
  /** 行数 */
  lines: number
  /** 预计阅读时长（分钟） */
  readingTime: number
}

/** 编辑器中打开的文档 */
export interface OpenDocument {
  id: string
  name: string
  path: string | null
  content: string
  isDirty: boolean
  cursor: CursorPosition
}

/** 持久化的编辑会话快照。 */
interface DocumentSession {
  version: 1
  activeDocumentId: string
  documents: OpenDocument[]
}

const SESSION_STORAGE_KEY = 'lume-document-session'

/** 默认欢迎文档 */
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

/** 创建具有稳定标识的文档。 */
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

/** 校验并恢复上次关闭时的编辑会话。 */
function restoreDocumentSession(): DocumentSession | null {
  try {
    const serializedSession = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!serializedSession) return null

    const session = JSON.parse(serializedSession) as Partial<DocumentSession>
    if (session.version !== 1 || !Array.isArray(session.documents) || session.documents.length === 0) {
      return null
    }

    const restoredDocuments = session.documents.filter((document): document is OpenDocument =>
      typeof document?.id === 'string'
      && typeof document.name === 'string'
      && (typeof document.path === 'string' || document.path === null)
      && typeof document.content === 'string'
      && typeof document.isDirty === 'boolean'
      && typeof document.cursor?.line === 'number'
      && typeof document.cursor?.column === 'number',
    )
    if (restoredDocuments.length === 0) return null

    const activeId = restoredDocuments.some((document) => document.id === session.activeDocumentId)
      ? session.activeDocumentId!
      : restoredDocuments[0].id

    return {
      version: 1,
      documents: restoredDocuments,
      activeDocumentId: activeId,
    }
  } catch (error) {
    console.warn('恢复编辑会话失败，将使用默认文档:', error)
    return null
  }
}

/** 单例多文档状态（跨组件共享） */
const restoredSession = restoreDocumentSession()
const documents = ref<OpenDocument[]>(restoredSession?.documents ?? [
  createDocumentRecord(DEFAULT_CONTENT, '欢迎使用 Lume.md'),
])
const activeDocumentId = ref(restoredSession?.activeDocumentId ?? documents.value[0].id)

/** 避免恢复后创建的新文档与已有文档 ID 冲突。 */
documentSequence = documents.value.reduce((maximum, document) => {
  const sequence = Number(document.id.match(/^document-(\d+)$/)?.[1] ?? 0)
  return Math.max(maximum, sequence)
}, documentSequence)

const activeDocument = computed(() =>
  documents.value.find((document) => document.id === activeDocumentId.value) ?? documents.value[0],
)

/** 兼容编辑器现有接口，同时将输入写入当前活动文档。 */
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

/** 计算文档统计信息 */
const stats = computed<DocumentStats>(() => {
  const text = content.value
  const chars = text.length
  const lines = text.split('\n').length

  // 中文字符 + 英文单词
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z0-9]+/g) || []).length
  const words = cjkChars + englishWords

  // 阅读时长：中文 300 字/分钟，英文 200 词/分钟
  const readingTime = Math.max(1, Math.ceil((cjkChars / 300 + englishWords / 200)))

  return { chars, words, lines, readingTime }
})

/** 更新光标位置 */
function updateCursor(line: number, column: number) {
  if (activeDocument.value) activeDocument.value.cursor = { line, column }
}

/** 设置文档内容 */
function setContent(text: string, markDirty = true) {
  if (!activeDocument.value) return
  activeDocument.value.content = text
  if (markDirty) activeDocument.value.isDirty = true
}

/** 新建并激活一个空白文档。 */
function newDocument() {
  const document = createDocumentRecord()
  documents.value.push(document)
  activeDocumentId.value = document.id
  return document
}

/** 打开并激活文档；相同路径已打开时只切换标签。 */
function openDocument(text: string, name: string, path: string | null) {
  const existing = path
    ? documents.value.find((document) => document.path === path)
    : undefined

  if (existing) {
    activeDocumentId.value = existing.id
    return existing
  }

  const document = createDocumentRecord(text, name, path)
  documents.value.push(document)
  activeDocumentId.value = document.id
  return document
}

/** 切换当前活动标签。 */
function activateDocument(id: string) {
  if (documents.value.some((document) => document.id === id)) {
    activeDocumentId.value = id
  }
}

/** 关闭标签，并优先激活其右侧相邻标签。 */
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

/** 更新当前文档的文件信息或保存状态。 */
function updateActiveDocument(metadata: Partial<Pick<OpenDocument, 'name' | 'path' | 'isDirty'>>) {
  if (activeDocument.value) Object.assign(activeDocument.value, metadata)
}

/**
 * 将当前编辑会话写入本地暂存区。
 * 此操作不会写入任何 Markdown 文件，正式文件仍只通过保存命令更新。
 */
function persistDocumentSession() {
  try {
    const session: DocumentSession = {
      version: 1,
      activeDocumentId: activeDocumentId.value,
      documents: documents.value,
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch (error) {
    console.error('暂存编辑会话失败:', error)
  }
}

export function useDocument() {
  return {
    documents,
    activeDocumentId,
    activeDocument,
    content,
    cursor,
    stats,
    updateCursor,
    setContent,
    newDocument,
    openDocument,
    activateDocument,
    closeDocument,
    updateActiveDocument,
    persistDocumentSession,
  }
}