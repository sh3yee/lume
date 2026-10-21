import type { Fragment, Mark, Slice } from '@milkdown/kit/prose/model'
import { markdownPreferences } from '@/app/preferences/useMarkdownPreference'
import { inlineFormats, type InlineFormat } from './formats'

export const getDisabledFormats = (marks: readonly Mark[]) =>
  marks.flatMap((mark) => {
    const format = inlineFormats.find(({ name }) => name === mark.type.name)
    return format && !markdownPreferences.enabled[format.name] ? [format] : []
  })

export const getSourceEscapePositions = (text: string, scripts: boolean) => {
  const positions: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (
      '=~^'.includes(character) ||
      (scripts && /\s/.test(character)) ||
      (character === '\\' && /[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(text[index + 1] ?? ''))
    )
      positions.push(index)
  }
  return positions
}

const serializeVisibleSource = (
  fragment: Fragment,
  inheritedScript = false,
  inheritedSource = false,
): string => {
  let result = ''
  let active: InlineFormat[] = []
  const closeMarks = (from: number) => {
    result += active
      .slice(from)
      .reverse()
      .map(({ marker }) => marker)
      .join('')
  }
  fragment.forEach((node) => {
    const formats = getDisabledFormats(node.marks)
    let shared = 0
    while (shared < active.length && active[shared] === formats[shared]) shared += 1
    closeMarks(shared)
    result += formats
      .slice(shared)
      .map(({ marker }) => marker)
      .join('')
    active = formats
    const scripts = inheritedScript || formats.some(({ name }) => name !== 'highlight')
    if (node.isText) {
      const text = node.text!
      const escapes = new Set(
        node.marks.some((mark) => mark.type.spec.code) || (!formats.length && !inheritedSource)
          ? []
          : getSourceEscapePositions(text, scripts),
      )
      result += text
        .split('')
        .map((character, index) => `${escapes.has(index) ? '\\' : ''}${character}`)
        .join('')
    } else if (node.isLeaf) result += node.type.spec.leafText?.(node) ?? ''
    else {
      if (node.isBlock && result) result += '\n\n'
      result += serializeVisibleSource(node.content, scripts, inheritedSource || formats.length > 0)
    }
  })
  closeMarks(0)
  return result
}

export const serializeInlineFormattingClipboard = (slice: Slice) => {
  let hasDisabledFormat = false
  slice.content.descendants((node) => {
    if (getDisabledFormats(node.marks).length) hasDisabledFormat = true
  })
  if (!hasDisabledFormat) return slice.content.textBetween(0, slice.content.size, '\n\n')
  return serializeVisibleSource(slice.content)
}
