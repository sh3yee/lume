import { imageSchema } from '@milkdown/kit/preset/commonmark'
import type { Node as MarkdownNode } from '@milkdown/kit/transformer'
import { $remark } from '@milkdown/kit/utils'
import { parseMarkdownImageAt } from '@/utils/imageMarkdown'
import {
  normalizeImageDimension,
  normalizeImageZoom,
  parseSizedImageHtml,
  serializeSizedImageHtml,
} from '@/utils/imageHtml'

type MarkdownTreeNode = MarkdownNode & {
  alt?: unknown
  children?: MarkdownTreeNode[]
  data?: {
    align?: unknown
    zoom?: unknown
    width?: unknown
    height?: unknown
    extraStyle?: unknown
    html?: boolean
  }
  title?: unknown
  url?: unknown
  value?: unknown
}

function transformImageText(node: MarkdownTreeNode, source: string): MarkdownTreeNode[] {
  if (node.type !== 'text' || typeof node.value !== 'string') return [node]
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  const raw =
    typeof start === 'number' && typeof end === 'number' ? source.slice(start, end) : node.value
  const wholeImage = parseMarkdownImageAt(raw)
  if (wholeImage?.end === raw.length && /\s/.test(wholeImage.src))
    return [
      {
        type: 'image',
        url: wholeImage.src,
        alt: wholeImage.alt,
        title: wholeImage.title,
      } as MarkdownTreeNode,
    ]
  // 有 Markdown 转义或实体时保留解析器结果，避免把字面量图片语法误转成对象。
  if (raw !== node.value) return [node]
  const children: MarkdownTreeNode[] = []
  let from = 0
  let cursor = 0
  while ((cursor = raw.indexOf('![', cursor)) !== -1) {
    const image = parseMarkdownImageAt(raw, cursor)
    if (!image || !/\s/.test(image.src)) {
      cursor += 2
      continue
    }
    if (cursor > from)
      children.push({ type: 'text', value: raw.slice(from, cursor) } as MarkdownTreeNode)
    children.push({
      type: 'image',
      url: image.src,
      alt: image.alt,
      title: image.title,
    } as MarkdownTreeNode)
    from = cursor = image.end
  }
  if (!children.length) return [node]
  if (from < raw.length) children.push({ type: 'text', value: raw.slice(from) } as MarkdownTreeNode)
  return children
}

function transformSizedImageHtml(
  node: MarkdownTreeNode,
  inline = false,
  source = '',
): MarkdownTreeNode {
  if (node.type === 'html' && typeof node.value === 'string') {
    const image = parseSizedImageHtml(node.value)
    if (image) {
      const imageNode = {
        type: 'image',
        url: image.src,
        alt: image.alt,
        title: image.title,
        data: { ...image, html: true },
      } as MarkdownTreeNode
      return inline ? imageNode : ({ type: 'paragraph', children: [imageNode] } as MarkdownTreeNode)
    }
  }

  if (node.children) {
    const inlineChildren = !['root', 'blockquote', 'listItem', 'list'].includes(node.type)
    node.children = node.children.flatMap((child) =>
      inlineChildren && child.type === 'text'
        ? transformImageText(child, source)
        : [transformSizedImageHtml(child, inlineChildren, source)],
    )
  }
  return node
}

export const sizedImageRemarkPlugin = $remark(
  'sizedImageHtml',
  () => () => (tree: MarkdownNode, file: { value?: unknown }) => {
    transformSizedImageHtml(
      tree as MarkdownTreeNode,
      false,
      typeof file.value === 'string' ? file.value : '',
    )
  },
)

export const sizedImageSchema = imageSchema.extendSchema((previous) => (ctx) => {
  const schema = previous(ctx)
  return {
    ...schema,
    attrs: {
      ...schema.attrs,
      zoom: { default: 100, validate: 'number' },
      align: { default: 'auto', validate: 'string' },
      width: { default: '', validate: 'string' },
      height: { default: '', validate: 'string' },
      extraStyle: { default: '', validate: 'string' },
      html: { default: false, validate: 'boolean' },
    },
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (dom) => {
          const element = (dom as HTMLImageElement).cloneNode() as HTMLImageElement
          for (const attribute of Array.from(element.attributes)) {
            if (!['src', 'alt', 'title', 'style', 'width', 'height'].includes(attribute.name))
              element.removeAttribute(attribute.name)
          }
          const image = parseSizedImageHtml(element.outerHTML)
          return image
            ? {
                ...image,
                html: Boolean(
                  image.width || image.height || image.zoom !== 100 || image.extraStyle,
                ),
              }
            : false
        },
      },
    ],
    toDOM: (node) => {
      const template = document.createElement('template')
      template.innerHTML = serializeSizedImageHtml(
        {
          ...node.attrs,
          src: String(node.attrs.src ?? ''),
          alt: String(node.attrs.alt ?? ''),
          title: String(node.attrs.title ?? ''),
          zoom: normalizeImageZoom(node.attrs.zoom),
          align: ['left', 'center', 'right'].includes(node.attrs.align) ? node.attrs.align : 'auto',
        },
        { forDisplay: true },
      )
      return template.content.firstElementChild as HTMLImageElement
    },
    parseMarkdown: {
      match: ({ type }) => type === 'image',
      runner: (state, node, type) => {
        const image = node as MarkdownTreeNode
        const zoom =
          typeof image.data?.zoom === 'number' ? normalizeImageZoom(image.data.zoom) : 100
        const align =
          image.data?.align === 'left' ||
          image.data?.align === 'center' ||
          image.data?.align === 'right'
            ? image.data.align
            : 'auto'
        state.addNode(type, {
          src: String(image.url ?? ''),
          alt: String(image.alt ?? ''),
          title: String(image.title ?? ''),
          zoom,
          align,
          width: normalizeImageDimension(image.data?.width),
          height: normalizeImageDimension(image.data?.height),
          extraStyle: typeof image.data?.extraStyle === 'string' ? image.data.extraStyle : '',
          html: image.data?.html === true,
        })
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === 'image',
      runner: (state, node) => {
        const zoom = normalizeImageZoom(node.attrs.zoom)
        const align = ['left', 'center', 'right'].includes(node.attrs.align)
          ? node.attrs.align
          : 'auto'
        if (
          zoom === 100 &&
          align === 'auto' &&
          !node.attrs.width &&
          !node.attrs.height &&
          !node.attrs.extraStyle &&
          !node.attrs.html
        ) {
          schema.toMarkdown.runner(state, node)
          return
        }
        state.addNode(
          'html',
          undefined,
          serializeSizedImageHtml({
            src: String(node.attrs.src ?? ''),
            alt: String(node.attrs.alt ?? ''),
            title: String(node.attrs.title ?? ''),
            zoom,
            align,
            width: node.attrs.width,
            height: node.attrs.height,
            extraStyle: node.attrs.extraStyle,
          }),
        )
      },
    },
  }
})
