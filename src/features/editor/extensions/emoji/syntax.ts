import { $remark } from '@milkdown/kit/utils'
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown'
import type { Literal, Root } from 'mdast'
import type { Extension, State, Tokenizer } from 'micromark-util-types'
import type { Plugin as RemarkPlugin } from 'unified'
import { emojiEntries, findEmoji } from './data'

interface Emoji extends Literal {
  type: 'emoji'
  value: string
}

declare module 'mdast' {
  interface PhrasingContentMap {
    emoji: Emoji
  }

  interface RootContentMap {
    emoji: Emoji
  }
}

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    lumeEmoji: 'lumeEmoji'
  }
}

export const isEmojiEscaped = (source: string, index: number) => {
  let slashes = 0
  while (source[index - slashes - 1] === '\\') slashes += 1
  return slashes % 2 === 1
}

export const getEmojiQuery = (textBefore: string): { from: number; query: string } | null => {
  const match = /:([a-z0-9_+-]*)$/i.exec(textBefore)
  if (!match || isEmojiEscaped(textBefore, match.index)) return null
  const prefix = textBefore.slice(0, match.index)
  const word = prefix.match(/\S*$/)?.[0] ?? ''
  if (/(?:[a-z][\w+.-]*:\/\/|www\.|mailto:)/i.test(word) || /[/@]$/.test(prefix)) return null
  // 已闭合的 :name: 的末尾冒号不能再次触发候选列表。
  if (/:[a-z0-9_+-]+$/i.test(prefix)) return null
  return { from: match.index, query: match[1].toLowerCase() }
}

const tokenizeEmoji: Tokenizer = function (effects, ok, nok) {
  let name = ''
  const start: State = (code) => {
    if (code !== 58) return nok(code)
    effects.enter('lumeEmoji')
    effects.consume(code)
    return inside
  }
  const inside: State = (code) => {
    if (code === 58 && findEmoji(name)) {
      effects.consume(code)
      effects.exit('lumeEmoji')
      return ok
    }
    if (code !== null && code > 0 && /[a-z0-9_+-]/.test(String.fromCharCode(code))) {
      name += String.fromCharCode(code)
      effects.consume(code)
      return inside
    }
    return nok(code)
  }
  return start
}

const emojiSyntax: Extension = { text: { 58: { name: 'lumeEmoji', tokenize: tokenizeEmoji } } }
const emojiFromMarkdown: FromMarkdownExtension = {
  enter: {
    lumeEmoji(token) {
      const source = this.sliceSerialize(token)
      // 图片替代文字最终会压成字符串，保留 shortcode，避免丢失冒号。
      const node = this.stack.some((parent) => parent.type === 'image')
        ? { type: 'text' as const, value: source }
        : { type: 'emoji' as const, value: source.slice(1, -1) }
      this.enter(node, token)
    },
  },
  exit: {
    lumeEmoji(token) {
      this.exit(token)
    },
  },
}

export const remarkEmoji: RemarkPlugin<[], Root> = function () {
  const data = this.data()
  const syntax = data.micromarkExtensions ?? (data.micromarkExtensions = [])
  const fromMarkdown = data.fromMarkdownExtensions ?? (data.fromMarkdownExtensions = [])
  const toMarkdown = data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])
  syntax.push(emojiSyntax)
  fromMarkdown.push(emojiFromMarkdown)
  toMarkdown.push({
    // 普通文字中的已转义 shortcode 仍需转义，防止保存再打开后意外成为表情。
    unsafe: [
      {
        character: ':',
        after: `(?:${emojiEntries.map(({ name }) => name.replace(/[+]/g, '\\+')).join('|')}):`,
        inConstruct: 'phrasing',
      },
    ],
    handlers: { emoji: (node) => `:${node.value}:` },
  })
}

export const emojiRemark = $remark('lumeEmoji', () => remarkEmoji)
