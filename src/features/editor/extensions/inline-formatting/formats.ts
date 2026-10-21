export const inlineFormats = [
  { name: 'highlight', marker: '==', tag: 'mark', code: 61 },
  { name: 'subscript', marker: '~', tag: 'sub', code: 126 },
  { name: 'superscript', marker: '^', tag: 'sup', code: 94 },
] as const

export type InlineFormat = (typeof inlineFormats)[number]
export type InlineFormatName = InlineFormat['name']

export const isEscaped = (source: string, index: number) => {
  let slashes = 0
  while (source[index - slashes - 1] === '\\') slashes += 1
  return slashes % 2 === 1
}

export const acceptsInlineContent = (format: InlineFormat, source: string) => {
  if (!source || /^\s|\s$/.test(source) || /[\r\n]/.test(source)) return false
  if (format.name === 'highlight') return true
  for (let index = 0; index < source.length; index += 1) {
    if (/\s/.test(source[index]) && !isEscaped(source, index)) return false
  }
  return true
}
