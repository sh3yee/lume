import type { Node } from '@milkdown/kit/prose/model'

export const normalizeFootnoteLabel = (label: string) =>
  label.trim().replace(/\s+/g, ' ').toLowerCase()

export const getFootnoteDefinitions = (doc: Node) => {
  const definitions = new Map<string, { node: Node; pos: number }>()
  doc.descendants((node, pos) => {
    if (node.type.name !== 'footnote_definition') return
    const label = normalizeFootnoteLabel(String(node.attrs.label))
    if (!definitions.has(label)) definitions.set(label, { node, pos })
  })
  return definitions
}

export const findFootnoteReference = (
  doc: Node,
  label: string,
): { node: Node; pos: number } | null => {
  const identifier = normalizeFootnoteLabel(label)
  let reference: { node: Node; pos: number } | null = null
  doc.descendants((node, pos) => {
    if (
      !reference &&
      node.type.name === 'footnote_reference' &&
      typeof node.attrs.source !== 'string' &&
      normalizeFootnoteLabel(String(node.attrs.label)) === identifier
    )
      reference = { node, pos }
  })
  return reference
}

// 单独粘贴引用时，解析器也需要知道当前文档中已有的脚注定义。
export const parseWithFootnoteContext = (
  source: string,
  doc: Node,
  parse: (text: string) => Node,
) => {
  const definitions = [...getFootnoteDefinitions(doc).values()].filter(({ node }) =>
    /^[^\]\s]+$/.test(String(node.attrs.label)),
  )
  if (!source.includes('[^') || !definitions.length) return parse(source)
  const context = definitions.map(({ node }) => `[^${node.attrs.label}]:`).join('\n\n')
  const parsed = parse(`${source}\n\n${context}`)
  if (parsed.childCount < definitions.length) return parse(source)
  let end = parsed.content.size
  for (let index = definitions.length - 1; index >= 0; index -= 1) {
    const node = parsed.child(parsed.childCount - definitions.length + index)
    if (
      node?.type.name !== 'footnote_definition' ||
      node.attrs.label !== definitions[index].node.attrs.label
    )
      return parse(source)
    end -= node.nodeSize
  }
  return parsed.copy(parsed.content.cut(0, end))
}
