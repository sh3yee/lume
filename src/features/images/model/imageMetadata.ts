export type ImageMetadataKey = 'typora-copy-images-to' | 'typora-root-url'

interface FrontMatter {
  lines: string[]
  end: number
  eol: string
  bom: string
}

const IMAGE_METADATA_LINE =
  /^(typora-copy-images-to|typora-root-url|"typora-copy-images-to"|"typora-root-url"|'typora-copy-images-to'|'typora-root-url')\s*:\s*(.*)$/

const readFrontMatter = (content: string): FrontMatter | null => {
  const bom = content.startsWith('\uFEFF') ? '\uFEFF' : ''
  const lines = content.slice(bom.length).split(/\r?\n/)
  if (!/^---\s*$/.test(lines[0] ?? '')) return null
  const end = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line))
  if (end < 0) return null
  return { lines, end, eol: content.includes('\r\n') ? '\r\n' : '\n', bom }
}

const splitYamlComment = (value: string) => {
  let quote = ''
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (quote === '"' && char === '\\') {
      index += 1
      continue
    }
    if (quote === "'" && char === "'" && value[index + 1] === "'") {
      index += 1
      continue
    }
    if (char === quote) quote = ''
    else if (!quote && (char === '"' || char === "'")) quote = char
    else if (!quote && char === '#' && (index === 0 || /\s/.test(value[index - 1] ?? ''))) {
      return { value: value.slice(0, index).trimEnd(), comment: value.slice(index) }
    }
  }
  return { value: value.trimEnd(), comment: '' }
}

const readYamlScalar = (source: string): string | undefined => {
  const value = splitYamlComment(source).value.trim()
  if (!value || /^(?:null|~)$/i.test(value)) return undefined
  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value)
      return typeof parsed === 'string' ? parsed : undefined
    } catch {
      return undefined
    }
  }
  if (value.startsWith("'")) {
    return value.endsWith("'") ? value.slice(1, -1).replace(/''/g, "'") : undefined
  }
  if (/^[[\]{&*!|>]/.test(value)) return undefined
  return value
}

export const getDocumentImageMetadata = (content: string) => {
  const metadata: { copyTo?: string; rootUrl?: string } = {}
  const frontMatter = readFrontMatter(content)
  if (!frontMatter) return metadata
  for (let index = 1; index < frontMatter.end; index += 1) {
    const match = IMAGE_METADATA_LINE.exec(frontMatter.lines[index] ?? '')
    if (!match) continue
    const key = match[1]?.replace(/^["']|["']$/g, '')
    const value = readYamlScalar(match[2] ?? '')
    if (key === 'typora-copy-images-to') metadata.copyTo = value
    if (key === 'typora-root-url') metadata.rootUrl = value
  }
  return metadata
}

/** 仅编辑图片相关顶层字段，保留其他 YAML 字段、注释和正文。 */
export const setDocumentImageMetadata = (
  content: string,
  key: ImageMetadataKey,
  value: string | null,
) => {
  const frontMatter = readFrontMatter(content)
  const entry = value === null ? null : `${key}: ${JSON.stringify(value)}`
  if (!frontMatter) {
    if (!entry) return content
    const eol = content.includes('\r\n') ? '\r\n' : '\n'
    const bom = content.startsWith('\uFEFF') ? '\uFEFF' : ''
    return `${bom}---${eol}${entry}${eol}---${eol}${eol}${content.slice(bom.length)}`
  }

  const { lines, end, eol, bom } = frontMatter
  const next = [lines[0] ?? '---']
  let updated = false
  for (let index = 1; index < end; index += 1) {
    const line = lines[index] ?? ''
    const match = IMAGE_METADATA_LINE.exec(line)
    if (!match || match[1]?.replace(/^["']|["']$/g, '') !== key) {
      next.push(line)
      continue
    }
    const { value: previousValue, comment } = splitYamlComment(match[2] ?? '')
    if (entry && !updated) next.push(`${entry}${comment ? ` ${comment}` : ''}`)
    else if (comment) next.push(comment)
    updated = true
    // 替换块标量或嵌套值时同步移除其缩进行，普通路径之后的注释仍保留。
    if (!previousValue || /^[|>]/.test(previousValue)) {
      while (index + 1 < end && /^(?:[ \t]+|$)/.test(lines[index + 1] ?? '')) {
        index += 1
        const continuation = lines[index] ?? ''
        if (!continuation.trim() || (!previousValue && /^\s*#/.test(continuation))) {
          next.push(continuation)
        }
      }
    }
  }
  if (entry && !updated) next.push(entry)
  next.push(...lines.slice(end))
  return bom + next.join(eol)
}
