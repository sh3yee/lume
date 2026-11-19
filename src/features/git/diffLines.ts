interface DiffLine {
  text: string
  kind: 'context' | 'added' | 'removed' | 'hunk' | 'metadata'
  lineNumber?: string
}

const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: |$)/

export const parseDiffLines = (content: string) => {
  const source = content.split('\n')
  if (source[source.length - 1] === '') source.pop()

  let before = 0
  let after = 0
  let beforeRemaining = 0
  let afterRemaining = 0
  let lineNumberWidth = 3

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

    const lineNumber =
      hasBefore && hasAfter && before !== after
        ? `${before} → ${after}`
        : String(hasAfter ? after : before)
    lineNumberWidth = Math.max(lineNumberWidth, lineNumber.length)
    if (hasBefore) {
      before++
      beforeRemaining--
    }
    if (hasAfter) {
      after++
      afterRemaining--
    }
    return {
      text: text.slice(1),
      kind: marker === '+' ? 'added' : marker === '-' ? 'removed' : 'context',
      lineNumber,
    }
  })

  return { lines, lineNumberWidth: `${lineNumberWidth}ch` }
}
