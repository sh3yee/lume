import type { DocumentStats } from './documentTypes'

/** 计算 Markdown 文档的字符、字数、行数和预计阅读时长。 */
export function calculateDocumentStats(text: string): DocumentStats {
  const chars = text.length
  const lines = text.split('\n').length
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z0-9]+/g) || []).length
  const words = cjkChars + englishWords
  const readingTime = Math.max(1, Math.ceil(cjkChars / 300 + englishWords / 200))

  return { chars, words, lines, readingTime }
}