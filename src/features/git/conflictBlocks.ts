interface ConflictBlock {
  start: number
  end: number
  local: string
  remote: string
}

export const findConflictBlocks = (content: string): ConflictBlock[] => {
  const lines = content.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const blocks: ConflictBlock[] = []
  let offset = 0
  let opening: { start: number; width: number; localStart: number } | null = null
  let baseStart: number | null = null
  let separator: { start: number; end: number } | null = null

  for (const line of lines) {
    const start = offset
    offset += line.length
    const marks = /^(<{7,}|\|{7,}|={7,}|>{7,})(?:[ \t]|\r?\n|$)/.exec(line)?.[1]
    if (!marks) continue
    if (marks[0] === '<') {
      opening = { start, width: marks.length, localStart: offset }
      baseStart = null
      separator = null
    } else if (opening && marks.length === opening.width) {
      if (marks[0] === '|' && !separator) baseStart = start
      if (marks[0] === '=' && !separator) separator = { start, end: offset }
      if (marks[0] === '>' && separator) {
        blocks.push({
          start: opening.start,
          end: offset,
          local: content.slice(opening.localStart, baseStart ?? separator.start),
          remote: content.slice(separator.end, start),
        })
        opening = null
      }
    }
  }
  return blocks
}
