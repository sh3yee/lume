/**
 * useDocument - 文档状态管理
 *
 * 管理当前 Markdown 文档的内容、光标位置和统计信息。
 * 作为编辑区与预览区之间的共享状态桥梁。
 */
import { ref, computed, type Ref } from 'vue'

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

/** 单例文档状态（跨组件共享） */
const content: Ref<string> = ref(DEFAULT_CONTENT)
const cursor = ref<CursorPosition>({ line: 1, column: 1 })

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
  cursor.value = { line, column }
}

/** 设置文档内容 */
function setContent(text: string) {
  content.value = text
}

export function useDocument() {
  return {
    content,
    cursor,
    stats,
    updateCursor,
    setContent,
  }
}