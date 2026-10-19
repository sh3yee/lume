import { remarkCtx, serializerCtx } from '@milkdown/kit/core'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { TextSelection } from '@milkdown/kit/prose/state'
import { $inputRule } from '@milkdown/kit/utils'
import { openLinkSource } from './linkEditing'
import { normalizeIdentifier, type ReferenceNode } from './linkDefinitions'
import { getLinkDefinitionSource } from './referenceLinks'

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

export const referenceLinkInputRule = $inputRule(
  (ctx) =>
    new InputRule(
      /\[[^\n]*\][ \t]?$(?![\s\S])/,
      (state, match, start, end) => {
        const $start = state.doc.resolve(start)
        if ($start.parent.type.spec.code) return null
        const before = $start.parent.textBetween(0, $start.parentOffset, undefined, '\ufffc')
        const source = before + match[0]
        const finished = /[ \t]$/.test(match[0])
        const candidate = /\[([^\]\n]+)\](?:\[([^\]\n]*)\])?$/.exec(match[0].trimEnd())
        if (!candidate) return null
        const definitions = getLinkDefinitionSource(state.doc)
        // 用临时定义仅验证完整语法；未定义的显式引用保留源码，补上定义后再收起。
        const placeholder = ctx.get(remarkCtx).stringify({
          type: 'root',
          children: [
            {
              type: 'definition',
              identifier: candidate[2] || candidate[1],
              label: candidate[2] || candidate[1],
              url: 'https://lume.invalid',
            },
          ],
        })
        const prefix = 'text '
        const tree = ctx
          .get(remarkCtx)
          .parse(`${prefix}${source}\n\n${definitions}\n\n${placeholder}`)
        const paragraph = tree.children[0]
        if (paragraph?.type !== 'paragraph') return null
        const reference = paragraph.children.at(-1) as ReferenceNode | undefined
        if (
          reference?.type !== 'linkReference' ||
          reference.position?.end.offset !== prefix.length + source.length - (finished ? 1 : 0)
        )
          return null
        const identifier = normalizeIdentifier(reference.identifier ?? '')
        let definition: { url: string; title: string | null } | undefined
        state.doc.descendants((node) => {
          if (
            !definition &&
            node.type.name === 'link_definition' &&
            node.attrs.identifier === identifier &&
            node.attrs.identifier
          )
            definition = { url: node.attrs.url, title: node.attrs.title || null }
        })
        // 简写等到空格才补全，允许继续输入行内链接、完整引用或链接定义。
        if (reference.referenceType === 'shortcut' && (!definition || !finished)) return null
        const offset = reference.position.start.offset
        const labelStart = reference.children?.[0]?.position?.start.offset
        const labelEnd = reference.children?.at(-1)?.position?.end.offset
        if (offset == null || labelStart == null || labelEnd == null) return null
        const from = $start.start() + offset - prefix.length
        const textFrom = $start.start() + labelStart - prefix.length
        const textTo = $start.start() + labelEnd - prefix.length
        if (textFrom >= textTo || textTo > end) return null
        let protectedSyntax = false
        state.doc.nodesBetween(from, end, (node) => {
          if (node.marks.some((mark) => mark.type.spec.code || mark.type.name === 'link'))
            protectedSyntax = true
        })
        if (protectedSyntax) return null
        const tr = state.tr.delete(textTo, end).delete(from, textFrom)
        tr.addMark(
          from,
          from + textTo - textFrom,
          state.schema.marks.link.create({
            href: definition?.url ?? '',
            title: definition?.title ?? null,
            referenceId: identifier,
            referenceLabel: reference.label ?? identifier,
            referenceType: reference.referenceType ?? 'full',
          }),
        )
        if (finished) {
          const position = from + textTo - textFrom
          tr.insertText(match[0].slice(-1), position)
          tr.removeMark(position, position + 1, state.schema.marks.link)
          tr.setSelection(TextSelection.create(tr.doc, position + 1))
          return tr.setStoredMarks([])
        }
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

export const linkDefinitionInputRule = $inputRule(
  () =>
    new InputRule(
      /^ {0,3}\[([^\]\n]+)\]:[ \t]$/,
      (state, match, start, end) => {
        const $start = state.doc.resolve(start)
        if (
          $start.parent.type.name !== 'paragraph' ||
          $start.parent.childCount > 1 ||
          $start.parent.firstChild?.marks.length
        )
          return null
        const from = $start.before()
        const source =
          match[0] + $start.parent.textBetween(end - $start.start(), $start.parent.content.size)
        const node = state.schema.nodes.link_definition.create(
          { identifier: normalizeIdentifier(match[1]), label: match[1] },
          state.schema.text(source),
        )
        const tr = state.tr.replaceWith(from, $start.after(), node)
        return tr.setSelection(TextSelection.create(tr.doc, from + 1 + match[0].length))
      },
      { inCodeMark: false },
    ),
)
