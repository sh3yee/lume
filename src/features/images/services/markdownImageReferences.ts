import { remarkCtx } from '@milkdown/kit/core'
import { escapeHtml, unescapeAll } from 'markdown-it/lib/common/utils.mjs'
import { parseMarkdownImageAt } from '@/utils/imageMarkdown'

interface ImageTreeNode {
  type: string
  children?: ImageTreeNode[]
  url?: string
  identifier?: string
  alt?: string
  title?: string | null
  value?: string
  position?: { start: { offset?: number }; end: { offset?: number } }
}

export interface MarkdownImageReference {
  src: string
  from: number
  to: number
  replace: (src: string) => string
}

// 复用编辑器的 CommonMark 解析器，避免误改代码块、行内代码和普通链接。
const markdown = remarkCtx.create(new Map()).get()()
const FRONT_MATTER = /^(?:\uFEFF)?---[ \t]*\r?\n(?:[^\r\n]*\r?\n)*?(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/
const HTML_IMAGE_OR_RAW =
  /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>[\s\S]*?(?:<\/\1\s*>|$)|<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi
const HTML_ATTRIBUTE = /\s+([^\s"'<>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g
const HTML_TAG_OR_COMMENT = /<!--|<\/?[a-z][\w:-]*\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi

const decodeHtmlAttribute = (value: string) =>
  value.replace(/&(?:#x[\da-f]+|#\d+|[a-z][\da-z]*);/gi, (entity) => unescapeAll(entity))

export const collectMarkdownImageReferences = (source: string): MarkdownImageReference[] => {
  // 遮盖 YAML 而保留每个字符的位置，使返回偏移仍对应原始 Markdown。
  const body = source.replace(FRONT_MATTER, (yaml) => yaml.replace(/[^\r\n]/g, ' '))
  const tree = markdown.parse(body) as ImageTreeNode
  const definitions = new Map<string, ImageTreeNode>()
  const rawHtmlRanges: Array<{ from: number; to: number }> = []
  const isRawHtmlContent = (offset: number) =>
    rawHtmlRanges.some((range) => offset >= range.from && offset < range.to)
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
  const walk = (node: ImageTreeNode, visit: (node: ImageTreeNode) => void) => {
    visit(node)
    node.children?.forEach((child) => walk(child, visit))
  }
  walk(tree, (node) => {
    if (
      node.type === 'definition' &&
      node.identifier &&
      !definitions.has(normalize(node.identifier))
    )
      definitions.set(normalize(node.identifier), node)
    if (node.type !== 'html') return
    const from = node.position?.start.offset
    const to = node.position?.end.offset
    if (from === undefined || to === undefined) return
    for (const token of source.slice(from, to).matchAll(HTML_TAG_OR_COMMENT)) {
      const start = from + token.index!
      if (isRawHtmlContent(start)) continue
      const rawTag = /^<(script|style|textarea)\b/i.exec(token[0])?.[1]
      if (token[0] !== '<!--' && !rawTag) continue
      const closing = token[0] === '<!--' ? /-->/g : new RegExp(`</${rawTag}\\s*>`, 'gi')
      closing.lastIndex = start + token[0].length
      const end = closing.exec(source)
      rawHtmlRanges.push({ from: start, to: end ? end.index + end[0].length : source.length })
    }
  })
  const images: MarkdownImageReference[] = []
  walk(tree, (node) => {
    const from = node.position?.start.offset
    const to = node.position?.end.offset
    if (from === undefined || to === undefined) return
    if (node.type !== 'html' && isRawHtmlContent(from)) return
    if (node.type === 'text' && typeof node.value === 'string') {
      const raw = source.slice(from, to)
      const wholeImage = parseMarkdownImageAt(raw)
      // 与编辑器保持一致：含转义的普通文本不再扫描，完整图片语法除外。
      if (raw !== node.value && wholeImage?.end !== raw.length) return
      let cursor = 0
      while ((cursor = raw.indexOf('![', cursor)) !== -1) {
        const image = parseMarkdownImageAt(raw, cursor)
        if (!image || !/\s/.test(image.src)) {
          cursor += 2
          continue
        }
        images.push({
          src: image.src,
          from: from + cursor,
          to: from + image.end,
          replace: (src) => (src ? imageMarkdown(src, image.alt, image.title) : ''),
        })
        cursor = image.end
      }
    } else if (node.type === 'image' || node.type === 'imageReference') {
      const definition = definitions.get(normalize(node.identifier ?? ''))
      const src = node.url ?? definition?.url
      if (!src) return
      images.push({
        src,
        from,
        to,
        replace: (url) =>
          url ? imageMarkdown(url, node.alt ?? '', node.title ?? definition?.title ?? null) : '',
      })
    } else if (node.type === 'html') {
      for (const match of source.slice(from, to).matchAll(HTML_IMAGE_OR_RAW)) {
        if (isRawHtmlContent(from + match.index!)) continue
        const tag = match[0]
        if (!/^<img\b/i.test(tag)) continue
        const attribute = [...tag.matchAll(HTML_ATTRIBUTE)].find(
          (attribute) => attribute[1]?.toLowerCase() === 'src',
        )
        const rawValue = attribute?.[2]
        if (!attribute || !rawValue) continue
        const src = decodeHtmlAttribute(
          /^["']/.test(rawValue) ? rawValue.slice(1, -1) : rawValue,
        ).trim()
        if (!src) continue
        const valueFrom = attribute.index! + attribute[0].length - rawValue.length
        images.push({
          src,
          from: from + match.index!,
          to: from + match.index! + tag.length,
          replace: (src) =>
            !src
              ? ''
              : tag.slice(0, valueFrom) +
                `"${escapeHtml(src)}"` +
                tag.slice(valueFrom + rawValue.length),
        })
      }
    }
  })
  return images
}

export const replaceMarkdownImageSources = (
  source: string,
  replacements: ReadonlyMap<string, string>,
) => {
  let result = source
  for (const image of collectMarkdownImageReferences(source).sort((a, b) => b.from - a.from)) {
    const replacement = replacements.get(image.src)
    if (replacement !== undefined)
      result = result.slice(0, image.from) + image.replace(replacement) + result.slice(image.to)
  }
  return result
}

export const imageMarkdown = (src: string, alt = '', title: string | null = null) =>
  markdown
    .stringify({
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'image', url: src, alt, title }] }],
    })
    .trimEnd()
