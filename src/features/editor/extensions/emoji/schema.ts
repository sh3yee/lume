import { InputRule } from '@milkdown/kit/prose/inputrules'
import type { Node } from '@milkdown/kit/prose/model'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { NodeView } from '@milkdown/kit/prose/view'
import { $inputRule, $nodeSchema, $view } from '@milkdown/kit/utils'
import { watch } from 'vue'
import { markdownPreferences } from '@/app/preferences/useMarkdownPreference'
import { findEmoji } from './data'
import { getEmojiQuery, isEmojiEscaped } from './syntax'

const getEmojiSource = (node: Node) => `:${String(node.attrs.name)}:`
const getEmojiText = (node: Node) =>
  (markdownPreferences.enabled.emoji && findEmoji(String(node.attrs.name))) || getEmojiSource(node)

export const emojiSchema = $nodeSchema('emoji', () => ({
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  attrs: { name: { default: '', validate: 'string' } },
  leafText: getEmojiSource,
  parseDOM: [
    {
      tag: 'span[data-emoji]',
      getAttrs: (dom) => {
        const name = dom.getAttribute('data-emoji') ?? ''
        return findEmoji(name) ? { name } : false
      },
    },
  ],
  toDOM: (node) => [
    'span',
    { class: 'lume-emoji', 'data-emoji': node.attrs.name, title: getEmojiSource(node) },
    getEmojiText(node),
  ],
  parseMarkdown: {
    match: (node) => node.type === 'emoji',
    runner: (state, node, type) => state.addNode(type, { name: String(node.value ?? '') }),
  },
  toMarkdown: {
    match: (node) => node.type.name === 'emoji',
    runner: (state, node) => state.addNode('emoji', undefined, String(node.attrs.name)),
  },
}))

const createEmojiView = (node: Node): NodeView => {
  const dom = document.createElement('span')
  dom.className = 'lume-emoji'
  dom.contentEditable = 'false'
  let currentNode = node
  const render = () => {
    dom.dataset.emoji = String(currentNode.attrs.name)
    dom.title = getEmojiSource(currentNode)
    dom.setAttribute('aria-label', getEmojiSource(currentNode))
    dom.textContent = getEmojiText(currentNode)
    dom.classList.toggle('lume-emoji--source', !markdownPreferences.enabled.emoji)
  }
  const stop = watch(() => markdownPreferences.enabled.emoji, render, {
    immediate: true,
    flush: 'sync',
  })
  return {
    dom,
    update(updated) {
      if (updated.type !== node.type) return false
      currentNode = updated
      render()
      return true
    },
    ignoreMutation: () => true,
    destroy: stop,
  }
}

export const emojiView = $view(emojiSchema.node, () => createEmojiView)

export const canInsertEmoji = (state: EditorState, from: number, to: number) => {
  const $from = state.doc.resolve(from)
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false
  if ($from.marks().some((mark) => mark.type.spec.code)) return false
  let allowed = true
  state.doc.nodesBetween(from, to, (node) => {
    if (
      (node.isInline && !node.isText) ||
      node.type.spec.code ||
      node.marks.some((mark) => mark.type.spec.code)
    )
      allowed = false
  })
  return allowed
}

export const emojiInputRule = $inputRule(
  () =>
    new InputRule(
      /:([a-z0-9_+-]+):$/,
      (state, match, start, end) => {
        if (!findEmoji(match[1])) return null
        if (!canInsertEmoji(state, start, end)) return null
        const $start = state.doc.resolve(start)
        const before = $start.parent.textBetween(0, $start.parentOffset, undefined, '\ufffc')
        if (isEmojiEscaped(before, before.length)) return null
        if (!getEmojiQuery(`${before}:${match[1]}`)) return null
        return state.tr.replaceWith(
          start,
          end,
          state.schema.nodes.emoji.create({ name: match[1] }, null, $start.marks()),
        )
      },
      { inCodeMark: false },
    ),
)
