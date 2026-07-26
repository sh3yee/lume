import { imageSchema } from '@milkdown/kit/preset/commonmark'
import type { Node as MarkdownNode } from '@milkdown/kit/transformer'
import { $remark } from '@milkdown/kit/utils'
import {
  clampImageZoom,
  parseSizedImageHtml,
  serializeSizedImageHtml,
} from '@/utils/imageHtml'

type MarkdownTreeNode = MarkdownNode & {
  alt?: unknown
  children?: MarkdownTreeNode[]
  data?: { align?: unknown; zoom?: unknown }
  title?: unknown
  url?: unknown
  value?: unknown
}

function transformSizedImageHtml(node: MarkdownTreeNode): MarkdownTreeNode {
  if (node.type === 'html' && typeof node.value === 'string') {
    const image = parseSizedImageHtml(node.value)
    if (image) {
      return {
        type: 'image',
        url: image.src,
        alt: image.alt,
        title: image.title,
        data: { align: image.align, zoom: image.zoom },
      } as MarkdownTreeNode
    }
  }

  if (node.children) node.children = node.children.map(transformSizedImageHtml)
  return node
}

export const sizedImageRemarkPlugin = $remark(
  'sizedImageHtml',
  () => () => (tree: MarkdownNode) => {
    transformSizedImageHtml(tree as MarkdownTreeNode)
  },
)

export const sizedImageSchema = imageSchema.extendSchema((previous) => (ctx) => {
  const schema = previous(ctx)
  return {
    ...schema,
    attrs: {
      ...schema.attrs,
      zoom: { default: 100, validate: 'number' },
      align: { default: 'left', validate: 'string' },
    },
    parseMarkdown: {
      match: ({ type }) => type === 'image',
      runner: (state, node, type) => {
        const image = node as MarkdownTreeNode
        const zoom = typeof image.data?.zoom === 'number'
          ? clampImageZoom(image.data.zoom)
          : 100
        const align = image.data?.align === 'center' || image.data?.align === 'right'
          ? image.data.align
          : 'left'
        state.addNode(type, {
          src: String(image.url ?? ''),
          alt: String(image.alt ?? ''),
          title: String(image.title ?? ''),
          zoom,
          align,
        })
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'image',
      runner: (state, node) => {
        const zoom = clampImageZoom(Number(node.attrs.zoom) || 100)
        const align = node.attrs.align === 'center' || node.attrs.align === 'right'
          ? node.attrs.align
          : 'left'
        if (zoom === 100 && align === 'left') {
          schema.toMarkdown.runner(state, node)
          return
        }
        state.addNode('html', undefined, serializeSizedImageHtml({
          src: String(node.attrs.src ?? ''),
          alt: String(node.attrs.alt ?? ''),
          title: String(node.attrs.title ?? ''),
          zoom,
          align,
        }))
      },
    },
  }
})