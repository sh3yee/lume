import { InputRule } from '@milkdown/kit/prose/inputrules'
import { Fragment } from '@milkdown/kit/prose/model'
import { insertInlineSource } from '../extensions/base/inlineSourceEditing'
import { $inputRule } from '@milkdown/kit/utils'
import { parseMarkdownImageAt } from '@/utils/imageMarkdown'
import { parseSizedImageHtml } from '@/utils/imageHtml'

/** 图片语法闭合后保留源码，光标移出后显示图片。 */
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
            return insertInlineSource(
              state.tr,
              from,
              end,
              source.slice(offset),
              Fragment.from(node),
            )
          }
          offset += 2
        }
        return null
      },
      { inCodeMark: false },
    ),
)

/** HTML 图片标签同样保留源码编辑态，并保留宽高与缩放信息。 */
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
        return insertInlineSource(
          state.tr,
          start,
          end,
          match[0],
          Fragment.from(state.schema.nodes.image.create({ ...image, html: true })),
        )
      },
      { inCodeMark: false },
    ),
)
