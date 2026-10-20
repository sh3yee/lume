export interface MarkdownImageSource {
  src: string
  alt: string
  title: string
  end: number
}

const unescapeImageText = (value: string) => value.replace(/\\([\\[\]()<>!"'])/g, '$1')

/** 兼容 Typora 未转义的本地路径，同时识别括号路径和可选标题。 */
export function parseMarkdownImageAt(
  source: string,
  start = 0,
  options: { allowEmpty?: boolean } = {},
): MarkdownImageSource | null {
  if (source.slice(start, start + 2) !== '![') return null
  let labelEnd = start + 2
  let labelDepth = 1
  for (; labelEnd < source.length; labelEnd++) {
    if (source[labelEnd] === '\\') labelEnd++
    else if (source[labelEnd] === '[') labelDepth++
    else if (source[labelEnd] === ']' && --labelDepth === 0) break
  }
  if (source.slice(labelEnd, labelEnd + 2) !== '](') return null

  let depth = 1
  let quote = ''
  let angle = false
  let end = labelEnd + 2
  for (; end < source.length; end++) {
    const character = source[end]
    if (character === '\n' || character === '\r') return null
    if (character === '\\') {
      end++
      continue
    }
    if (quote) {
      if (character === quote) quote = ''
      continue
    }
    if (angle) {
      if (character === '>') angle = false
      continue
    }
    if (character === '<' && !source.slice(labelEnd + 2, end).trim()) angle = true
    else if ((character === '"' || character === "'") && /\s/.test(source[end - 1] ?? ''))
      quote = character
    else if (character === '(') depth++
    else if (character === ')' && --depth === 0) break
  }
  if (depth || end === source.length) return null

  let destination = source.slice(labelEnd + 2, end).trim()
  const titleMatch = destination.match(
    /\s+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\))$/,
  )
  const title = titleMatch ? (titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? '') : ''
  if (titleMatch) destination = destination.slice(0, titleMatch.index).trim()
  if (destination.startsWith('<') && destination.endsWith('>'))
    destination = destination.slice(1, -1)
  if ((!destination && !options.allowEmpty) || /[<>\r\n]/.test(destination)) return null

  return {
    src: unescapeImageText(destination),
    alt: unescapeImageText(source.slice(start + 2, labelEnd)),
    title: unescapeImageText(title),
    end: end + 1,
  }
}
