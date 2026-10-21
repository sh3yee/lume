import type MarkdownIt from 'markdown-it'
import { markdownPreferences } from '@/app/preferences/useMarkdownPreference'
import { findEmoji } from './data'

export const useEmojiPreviewExtension = (markdown: MarkdownIt) => {
  markdown.inline.ruler.after('escape', 'lume_emoji', (state, silent) => {
    if (!markdownPreferences.enabled.emoji || state.src.charCodeAt(state.pos) !== 58) return false
    const match = /^:([a-z0-9_+-]+):/.exec(state.src.slice(state.pos, state.posMax))
    if (!match) return false
    const emoji = findEmoji(match[1])
    if (!emoji) return false
    if (!silent) state.pending += emoji
    state.pos += match[0].length
    return true
  })
  return markdown
}
