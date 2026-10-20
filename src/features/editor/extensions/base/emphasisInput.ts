import { remarkCtx } from '@milkdown/kit/core'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { $inputRule } from '@milkdown/kit/utils'
import type { Emphasis, PhrasingContent } from 'mdast'

const findClosingEmphasis = (nodes: PhrasingContent[], offset: number): Emphasis | undefined => {
  for (const node of nodes) {
    if (node.type === 'emphasis' && node.position?.end.offset === offset) return node
    if ('children' in node) {
      const emphasis = findClosingEmphasis(node.children, offset)
      if (emphasis) return emphasis
    }
  }
}

export const emphasisInputRule = $inputRule(
  (ctx) =>
    new InputRule(/[*_][^\n]*[*_]$(?![\s\S])/, (state, match, start, end) => {
      const $start = state.doc.resolve(start)
      const $end = state.doc.resolve(end)
      if (!$start.sameParent($end) || $start.parent.type.spec.code) return null
      const marks = state.storedMarks ?? state.selection.$from.marks()
      if (marks.some((mark) => mark.type.spec.code)) return null
      const before = $start.parent.textBetween(0, $start.parentOffset, undefined, '\ufffc')
      const after = $end.parent.textBetween(
        $end.parentOffset,
        $end.parent.content.size,
        undefined,
        '\ufffc',
      )
      // 与文件解析共用定界符规则，同时保留光标后的文字以判断词内下划线。
      const prefix = 'text '
      const source = before + match[0]
      const tree = ctx.get(remarkCtx).parse(prefix + source + after)
      const paragraph = tree.children[0]
      if (paragraph?.type !== 'paragraph') return null
      const emphasis = findClosingEmphasis(paragraph.children, prefix.length + source.length)
      if (!emphasis) return null
      const offset = emphasis.position?.start.offset
      if (offset == null) return null

      const from = $start.start() + offset - prefix.length
      const marker = source[offset - prefix.length]
      if (from >= end || (marker !== '*' && marker !== '_')) return null
      // 连续定界符交给粗体规则，避免在 ***文字*** 尚未输完时提前收起。
      if (source[offset - prefix.length - 1] === marker) return null
      // 代码内容可以被斜体包裹，但代码中的星号和下划线不能充当定界符。
      const delimiter = state.doc.nodeAt(from)
      if (delimiter?.marks.some((mark) => mark.type.spec.code)) return null

      const child = emphasis.children.length === 1 ? emphasis.children[0] : undefined
      const strong =
        child?.type === 'strong' &&
        child.position?.start.offset === offset + 1 &&
        child.position?.end.offset === prefix.length + source.length - 1
      const width = strong ? 3 : 1
      const tr = state.tr
      if (strong) tr.delete(end - 2, end)
      tr.delete(from, from + width)
      const to = end - width * 2 + 1
      tr.addMark(from, to, state.schema.marks.emphasis.create({ marker }))
      if (strong) tr.addMark(from, to, state.schema.marks.strong.create({ marker }))
      return tr.setStoredMarks(state.storedMarks ?? [])
    }),
)
