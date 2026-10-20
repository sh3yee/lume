import { InputRule } from '@milkdown/kit/prose/inputrules'
import { NodeSelection } from '@milkdown/kit/prose/state'
import { $inputRule } from '@milkdown/kit/utils'
import { parseMarkdownImageAt } from '@/utils/imageMarkdown'
import { parseSizedImageHtml } from '@/utils/imageHtml'

/** 图片语法闭合后立即建立节点，空地址由 NodeView 提供路径输入。 */
export const imageSourceInputRule = $inputRule(
  () =>
    new InputRule(
      /!\[[^\n]*\]\([^\n]*\)$(?![\s\S])/,
      (state, match, start, end) => {
        const $start = state.doc.resolve(start)
        if ($start.parent.type.spec.code) return null
        const prefix = $start.parent.textBetween(0, $start.parentOffset, undefined, '\ufffc')
        const source = prefix + match[0]
        let offset = prefix.length
        while ((offset = source.indexOf('![', offset)) !== -1) {
          const escapes = source.slice(0, offset).match(/\\+$/)?.[0].length ?? 0
          const image =
            escapes % 2 ? null : parseMarkdownImageAt(source, offset, { allowEmpty: true })
          if (image?.end === source.length) {
            const from = $start.start() + offset
            let protectedSyntax = false
            $start.parent.nodesBetween(offset, end - $start.start(), (node) => {
              if (!node.isText || node.marks.some((mark) => mark.type.spec.code))
                protectedSyntax = true
            })
            if (protectedSyntax) return null
            const node = state.schema.nodes.image.create({
              src: image.src,
              alt: image.alt,
              title: image.title,
            })
            const tr = state.tr.replaceWith(from, end, node)
            return !image.src ? tr.setSelection(NodeSelection.create(tr.doc, from)) : tr
          }
          offset += 2
        }
        return null
      },
      { inCodeMark: false },
    ),
)

/** HTML 图片标签闭合后建立图片节点，并保留宽高与缩放信息。 */
export const imageHtmlInputRule = $inputRule(
  () =>
    new InputRule(
      /<img\b(?:[^<>"'\n]|"[^"\n]*"|'[^'\n]*')*>$/i,
      (state, match, start, end) => {
        const $start = state.doc.resolve(start)
        if ($start.parent.type.spec.code) return null
        const prefix = $start.parent.textBetween(0, $start.parentOffset, undefined, '\ufffc')
        if ((prefix.match(/\\+$/)?.[0].length ?? 0) % 2) return null
        const image = parseSizedImageHtml(match[0])
        if (!image) return null
        return state.tr.replaceWith(
          start,
          end,
          state.schema.nodes.image.create({ ...image, html: true }),
        )
      },
      { inCodeMark: false },
    ),
)
