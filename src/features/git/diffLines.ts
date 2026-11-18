interface DiffLine {
  text: string
  kind: 'context' | 'added' | 'removed' | 'hunk' | 'metadata'
  before?: number
  after?: number
}

const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: |$)/

export const parseDiffLines = (content: string) => {
  const source = content.split('\n')
  if (source[source.length - 1] === '') source.pop()

  let before = 0
  let after = 0
  let beforeRemaining = 0
  let afterRemaining = 0
  let largestLineNumber = 0

  const lines = source.map((raw): DiffLine => {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const header = hunkHeader.exec(text)
    if (header) {
      before = Number(header[1])
      beforeRemaining = Number(header[2] ?? 1)
      after = Number(header[3])
      afterRemaining = Number(header[4] ?? 1)
      return { text, kind: 'hunk' }
    }
    if (!beforeRemaining && !afterRemaining) return { text, kind: 'metadata' }

    // Git 可配置为省略空白上下文行原本的空格前缀。
    const marker = text[0] ?? ' '
    const hasBefore = marker === ' ' || marker === '-'
    const hasAfter = marker === ' ' || marker === '+'
    if (
      (!hasBefore && !hasAfter) ||
      (hasBefore && !beforeRemaining) ||
      (hasAfter && !afterRemaining)
    )
      return { text, kind: 'metadata' }

    const beforeNumber = hasBefore ? before++ : undefined
    const afterNumber = hasAfter ? after++ : undefined
    if (hasBefore) beforeRemaining--
    if (hasAfter) afterRemaining--
    largestLineNumber = Math.max(largestLineNumber, beforeNumber ?? 0, afterNumber ?? 0)
    return {
      text: text.slice(1),
      kind: marker === '+' ? 'added' : marker === '-' ? 'removed' : 'context',
      before: beforeNumber,
      after: afterNumber,
    }
  })

  return { lines, lineNumberWidth: `${Math.max(3, String(largestLineNumber).length)}ch` }
}
