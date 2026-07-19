export interface SizedImageAttributes {
  src: string
  alt: string
  title: string
  zoom: number
}

export const MIN_IMAGE_ZOOM = 10
export const MAX_IMAGE_ZOOM = 200

export function clampImageZoom(value: number) {
  return Math.min(MAX_IMAGE_ZOOM, Math.max(MIN_IMAGE_ZOOM, Math.round(value)))
}

function parseZoom(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 100
  const numeric = Number.parseFloat(trimmed)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return clampImageZoom(trimmed.endsWith('%') ? numeric : numeric * 100)
}

export function parseSizedImageHtml(value: string): SizedImageAttributes | null {
  const parsed = new DOMParser().parseFromString(value, 'text/html')
  const element = parsed.body.firstElementChild
  if (
    !(element instanceof HTMLImageElement)
    || parsed.body.children.length !== 1
    || parsed.body.textContent?.trim()
  ) return null

  const src = element.getAttribute('src')?.trim() ?? ''
  const zoom = parseZoom(element.style.zoom)
  if (!src || /^(?:javascript|vbscript):/i.test(src) || zoom === null) return null

  return {
    src,
    alt: element.getAttribute('alt') ?? '',
    title: element.getAttribute('title') ?? '',
    zoom,
  }
}

export function serializeSizedImageHtml(attributes: SizedImageAttributes) {
  const image = document.createElement('img')
  image.setAttribute('src', attributes.src)
  if (attributes.alt) image.setAttribute('alt', attributes.alt)
  if (attributes.title) image.setAttribute('title', attributes.title)
  image.style.zoom = `${clampImageZoom(attributes.zoom)}%`
  return image.outerHTML
}
