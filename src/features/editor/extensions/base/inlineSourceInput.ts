import { remarkCtx } from '@milkdown/kit/core'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { $inputRule } from '@milkdown/kit/utils'
import type { PhrasingContent } from 'mdast'
import { insertInlineSource } from './inlineSourceEditing'

const formats = new Set([
  'emphasis',
  'strong',
  'delete',
  'inlineCode',
  'highlight',
  'subscript',
  'superscript',
])
const findClosingFormat = (
  nodes: PhrasingContent[],
  offset: number,
): PhrasingContent | undefined => {
  for (const node of nodes) {
    if (formats.has(node.type) && node.position?.end.offset === offset) return node
    if ('children' in node) {
      const emphasis = findClosingFormat(node.children, offset)
      if (emphasis) return emphasis
    }
  }
}

export const inlineSourceInputRule = $inputRule(
  (ctx) =>
    new InputRule(/[*_~^=`][^\n]*[*_~^=`]$(?![\s\S])/, (state, match, start, end) => {
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
      const emphasis = findClosingFormat(paragraph.children, prefix.length + source.length)
      if (!emphasis) return null
      const offset = emphasis.position?.start.offset
      if (offset == null) return null

      const from = $start.start() + offset - prefix.length
      const marker = source[offset - prefix.length]
      if (from >= end) return null
      // 连续定界符必须完整配对，避免在 ***文字*** 尚未输完时提前收起。
      if (source[offset - prefix.length - 1] === marker) return null
      // Do not capture an inner pair while a surrounding delimiter is still being typed.
      // In particular, ``a`b`` must not turn its inner `b` into a separate source node.
      const pending = new Set<string>()
      const preceding = source.slice(0, offset - prefix.length)
      for (let index = 0; index < preceding.length; index++) {
        const outerMarker = preceding[index]
        if (!'_*~^=`'.includes(outerMarker)) continue
        let slashes = 0
        while (preceding[index - slashes - 1] === '\\') slashes++
        if (slashes % 2) continue
        let finish = index + 1
        while (preceding[finish] === outerMarker) finish++
        const delimiter = preceding.slice(index, finish)
        if (
          delimiter === '=' ||
          (outerMarker === '_' &&
            /[\p{L}\p{N}]/u.test(preceding[index - 1] ?? '') &&
            /[\p{L}\p{N}]/u.test(preceding[finish] ?? ''))
        ) {
          index = finish - 1
          continue
        }
        if (pending.has(delimiter)) pending.delete(delimiter)
        else if (outerMarker === '`' || /\S/.test(preceding[finish] ?? ' ')) pending.add(delimiter)
        index = finish - 1
      }
      if (pending.size) return null
      // 代码内容可以被斜体包裹，但代码中的星号和下划线不能充当定界符。
      const delimiter = state.doc.nodeAt(from)
      if (delimiter?.marks.some((mark) => mark.type.spec.code)) return null

      const raw = source.slice(offset - prefix.length)
      // Insert the missing closing character before wrapping so history keeps the original text positions.
      const tr = state.tr.insertText(match[0].slice(end - start), end)
      return insertInlineSource(tr, from, end + match[0].length - (end - start), raw)
    }),
)
