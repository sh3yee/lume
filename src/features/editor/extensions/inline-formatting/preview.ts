import type MarkdownIt from 'markdown-it'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
import type { Delimiter } from 'markdown-it/lib/rules_inline/state_inline.mjs'
import { markdownPreferences } from '@/app/preferences/useMarkdownPreference'
import { acceptsInlineContent, inlineFormats } from './formats'

export const useInlineFormattingPreviewExtension = (markdown: MarkdownIt) => {
  markdown.inline.ruler.before('strikethrough', 'lume_inline_formatting', (state, silent) => {
    const format = inlineFormats.find(({ code }) => state.src.charCodeAt(state.pos) === code)
    if (!format || !markdownPreferences.enabled[format.name] || silent) return false
    const scanned = state.scanDelims(state.pos, true)
    if (scanned.length !== format.marker.length) return false
    if (state.src[state.pos - 1] === format.marker[0]) return false
    const token = state.push('text', '', 0)
    token.content = format.marker
    token.meta = { sourcePosition: state.pos, format: format.name }
    // 与 GFM 的双波浪线定界符分组，单波浪线只参与下标配对。
    state.delimiters.push({
      marker: 0x10000 + format.code,
      length: 0,
      token: state.tokens.length - 1,
      end: -1,
      open: !/\s/.test(state.src[state.pos + scanned.length] ?? ' '),
      close: state.pos > 0 && !/\s/.test(state.src[state.pos - 1]),
    })
    state.pos += scanned.length
    return true
  })

  const process = (state: StateInline, delimiters: Delimiter[]) => {
    for (let index = 0; index < delimiters.length; index += 1) {
      const closing = delimiters[index]
      if (!closing.close) continue
      const format = inlineFormats.find(({ code }) => closing.marker === 0x10000 + code)
      if (!format) continue
      const last = state.tokens[closing.token]
      for (let open = index - 1; open >= 0; open -= 1) {
        const opening = delimiters[open]
        if (!opening.open || opening.marker !== closing.marker) continue
        const first = state.tokens[opening.token]
        if (first.type !== 'text') continue
        const source = state.src.slice(
          first.meta.sourcePosition + format.marker.length,
          last.meta.sourcePosition,
        )
        if (!acceptsInlineContent(format, source)) continue
        first.type = `lume_${format.name}_open`
        first.tag = format.tag
        first.nesting = 1
        first.content = ''
        first.markup = format.marker
        first.meta.source = `${format.marker}${source}${format.marker}`
        first.meta.closePosition = last.meta.sourcePosition
        last.type = `lume_${format.name}_close`
        last.tag = format.tag
        last.nesting = -1
        last.content = ''
        last.markup = format.marker
        closing.open = false
        break
      }
    }
  }
  markdown.inline.ruler2.before('balance_pairs', 'lume_inline_formatting', (state) => {
    process(state, state.delimiters)
    for (const meta of state.tokens_meta) {
      if (meta?.delimiters) process(state, meta.delimiters)
    }
    return true
  })
  markdown.inline.ruler2.after('fragments_join', 'lume_inline_whitespace', (state) => {
    let scripts = 0
    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index]
      if (/^lume_(?:subscript|superscript)_open$/.test(token.type)) scripts += 1
      else if (/^lume_(?:subscript|superscript)_close$/.test(token.type)) scripts -= 1
      else if (
        scripts > 0 &&
        token.type === 'text_special' &&
        token.markup === '\\' &&
        /^[ \t]/.test(state.tokens[index + 1]?.content ?? '')
      )
        token.content = ''
    }
    return true
  })
  markdown.core.ruler.after('inline', 'lume_inline_image_alt', (state) => {
    const preserveImageAlt = (tokens: typeof state.tokens) => {
      for (const token of tokens) {
        if (token.type !== 'image') {
          if (token.children) preserveImageAlt(token.children)
          continue
        }
        const children = token.children ?? []
        for (let index = 0; index < children.length; index += 1) {
          const opening = children[index]
          if (!opening.type.startsWith('lume_') || !opening.type.endsWith('_open')) continue
          const end = children.findIndex(
            (closing, position) =>
              position > index &&
              closing.type === opening.type.replace('_open', '_close') &&
              closing.meta?.sourcePosition === opening.meta?.closePosition,
          )
          if (end < 0) continue
          opening.type = 'text'
          opening.tag = ''
          opening.nesting = 0
          opening.content = opening.meta.source
          children.splice(index + 1, end - index)
        }
      }
    }
    preserveImageAlt(state.tokens)
  })
  return markdown
}
