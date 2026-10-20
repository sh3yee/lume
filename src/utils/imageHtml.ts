export type ImageAlign = 'auto' | 'left' | 'center' | 'right'

export interface SizedImageAttributes {
  src: string
  alt: string
  title: string
  zoom: number
  align: ImageAlign
  width?: string
  height?: string
  extraStyle?: string
}

export const MIN_IMAGE_ZOOM = 10
export const MAX_IMAGE_ZOOM = 200

export function clampImageZoom(value: number) {
  if (!Number.isFinite(value)) return 100
  return Math.min(MAX_IMAGE_ZOOM, Math.max(MIN_IMAGE_ZOOM, Math.round(value * 100) / 100))
}

export function normalizeImageZoom(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 100
}

export function normalizeImageDimension(value: unknown): string {
  if (typeof value !== 'string') return ''
  const dimension = value.trim().toLowerCase()
  if (dimension === 'auto') return dimension
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|em|rem|vw|vh|vmin|vmax|cm|mm|in|pt|pc)?$/.test(dimension))
    return ''
  if (Number.parseFloat(dimension) <= 0) return ''
  return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(dimension) ? `${dimension}px` : dimension
}

function parseZoom(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 100
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(trimmed)) return null
  const numeric = Number.parseFloat(trimmed)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return trimmed.endsWith('%') ? numeric : numeric * 100
}

function parseAlign(element: HTMLImageElement): ImageAlign {
  if (element.style.marginLeft === 'auto' && element.style.marginRight === 'auto') return 'center'
  if (element.style.marginLeft === 'auto') return 'right'
  if (['0', '0px'].includes(element.style.marginLeft) && element.style.marginRight === 'auto')
    return 'left'
  return 'auto'
}

export function parseSizedImageHtml(value: string): SizedImageAttributes | null {
  const parsed = new DOMParser().parseFromString(value, 'text/html')
  const element = parsed.body.firstElementChild
  if (
    !(element instanceof HTMLImageElement) ||
    parsed.body.children.length !== 1 ||
    parsed.body.textContent?.trim()
  )
    return null

  if (
    parsed.head.childNodes.length ||
    Array.from(parsed.body.childNodes).some(
      (node) => node !== element && (node.nodeType !== Node.TEXT_NODE || node.textContent?.trim()),
    )
  )
    return null

  if (
    Array.from(element.attributes).some(
      (attribute) => !['src', 'alt', 'title', 'style', 'width', 'height'].includes(attribute.name),
    )
  )
    return null
  const src = element.getAttribute('src')?.trim() ?? ''
  const zoom = parseZoom(element.style.getPropertyValue('zoom'))
  if (!src || /^(?:javascript|vbscript):/i.test(src) || zoom === null) return null

  const widthSource = element.style.width || element.getAttribute('width') || ''
  const heightSource = element.style.height || element.getAttribute('height') || ''
  const width = normalizeImageDimension(widthSource)
  const height = normalizeImageDimension(heightSource)
  // 无法表达的尺寸保留为原始 HTML，避免编辑正文后静默丢失信息。
  if ((widthSource && !width) || (heightSource && !height)) return null

  const align = parseAlign(element)
  for (const property of ['width', 'height', 'zoom']) element.style.removeProperty(property)
  if (align !== 'auto') {
    for (const property of ['display', 'margin-left', 'margin-right'])
      element.style.removeProperty(property)
  }

  return {
    src,
    alt: element.getAttribute('alt') ?? '',
    title: element.getAttribute('title') ?? '',
    zoom,
    align,
    width,
    height,
    extraStyle: element.style.cssText,
  }
}

export function serializeSizedImageHtml(
  attributes: SizedImageAttributes,
  options: { forDisplay?: boolean } = {},
) {
  const image = document.createElement('img')
  image.setAttribute('src', attributes.src)
  if (attributes.alt) image.setAttribute('alt', attributes.alt)
  if (attributes.title) image.setAttribute('title', attributes.title)
  // Typora 编辑和预览只应用图片尺寸；其他样式保留在 Markdown 源码中。
  if (!options.forDisplay && attributes.extraStyle) image.style.cssText = attributes.extraStyle
  const width = normalizeImageDimension(attributes.width)
  const height = normalizeImageDimension(attributes.height)
  if (width) image.style.width = width
  if (height) image.style.height = height
  const zoom = normalizeImageZoom(attributes.zoom)
  if (zoom !== 100) image.style.zoom = `${zoom}%`
  if (attributes.align !== 'auto') {
    image.style.display = 'block'
    image.style.marginLeft = attributes.align === 'left' ? '0' : 'auto'
    image.style.marginRight = attributes.align === 'right' ? '0' : 'auto'
  }
  return image.outerHTML
}
