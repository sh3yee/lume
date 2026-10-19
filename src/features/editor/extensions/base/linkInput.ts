import { remarkCtx, serializerCtx } from '@milkdown/kit/core'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { TextSelection } from '@milkdown/kit/prose/state'
import { $inputRule } from '@milkdown/kit/utils'
import { openLinkSource } from './linkEditing'

export const inlineLinkInputRule = $inputRule(
  (ctx) =>
    new InputRule(
      /\[[^\n]*\]\([^\n]*\)$(?![\s\S])/,
      (state, match, start, end) => {
        const $start = state.doc.resolve(start)
        if ($start.parent.type.spec.code) return null
        const before = $start.parent.textBetween(0, $start.parentOffset, undefined, '\ufffc')
        const source = before + match[0]
        // 加普通文字前缀，只解析行内语法，避免将段首内容识别为列表或引用块。
        const prefix = 'text '
        const tree = ctx.get(remarkCtx).parse(prefix + source)
        const paragraph = tree.children[0]
        if (paragraph?.type !== 'paragraph') return null
        const link = paragraph.children[paragraph.children.length - 1]
        if (link?.type !== 'link' || link.position?.end.offset !== prefix.length + source.length)
          return null
        const offset = link.position.start.offset
        const labelEnd = link.children[link.children.length - 1]?.position?.end.offset
        if (offset == null || labelEnd == null) return null

        const from = $start.start() + offset - prefix.length
        const textFrom = from + 1
        const textTo = $start.start() + labelEnd - prefix.length
        if (textFrom >= textTo || textTo > end) return null

        let protectedSyntax = false
        state.doc.nodesBetween(from, end, (node, pos) => {
          if (
            node.marks.some(
              (mark) =>
                mark.type.name === 'link' ||
                (mark.type.spec.code && (pos < textFrom || pos + node.nodeSize > textTo)),
            )
          )
            protectedSyntax = true
        })
        if (protectedSyntax) return null

        // 只移除链接定界符和目标地址，保留标签中已有的粗体、代码等行内格式。
        const tr = state.tr.delete(textTo, end).delete(from, textFrom)
        tr.addMark(
          from,
          from + textTo - textFrom,
          state.schema.marks.link.create({ href: link.url, title: link.title ?? null }),
        )
        // 语法补全后仍停留在源码末尾，移出链接才收起。
        const editingSource = openLinkSource(
          tr,
          from,
          from + textTo - textFrom,
          ctx.get(serializerCtx),
        )
        tr.setSelection(TextSelection.create(tr.doc, from + 1 + editingSource.length))
        return tr.setStoredMarks([])
      },
      { inCodeMark: false },
    ),
)
