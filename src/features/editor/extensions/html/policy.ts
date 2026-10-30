export const inlineHtmlTags = new Set(
  'a abbr b bdi bdo big br cite code del dfn em font i ins kbd mark q rp rt ruby s samp small span strike strong sub sup time tt u var wbr'.split(
    ' ',
  ),
)
export const voidHtmlTags = new Set(
  'area base br col embed hr img input link meta param source track wbr'.split(' '),
)
const htmlTags = new Set([
  ...inlineHtmlTags,
  ...'address article aside audio blockquote caption center col colgroup dd details div dl dt figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr img li main nav ol p pre section source summary table tbody td tfoot th thead tr track ul video iframe'.split(
    ' ',
  ),
])
const svgTags = new Set(
  'svg g path circle ellipse line polyline polygon rect text tspan defs linearGradient radialGradient stop clipPath use title desc'
    .toLowerCase()
    .split(' '),
)
const globalAttributes = new Set(['title', 'lang', 'dir', 'style'])
const tagAttributes: Record<string, string[]> = {
  a: ['href', 'name'],
  font: ['color', 'face', 'size'],
  time: ['datetime'],
  q: ['cite'],
  blockquote: ['cite'],
  ol: ['start', 'reversed', 'type'],
  li: ['value'],
  details: ['open'],
  table: ['width', 'border', 'cellpadding', 'cellspacing', 'align'],
  col: ['span', 'width'],
  colgroup: ['span', 'width'],
  td: ['colspan', 'rowspan', 'align', 'valign', 'width', 'height'],
  th: ['colspan', 'rowspan', 'align', 'valign', 'width', 'height', 'scope'],
  img: ['src', 'alt', 'width', 'height'],
  video: [
    'src',
    'poster',
    'controls',
    'loop',
    'muted',
    'preload',
    'width',
    'height',
    'playsinline',
  ],
  audio: ['src', 'controls', 'loop', 'muted', 'preload'],
  source: ['src', 'type', 'media'],
  track: ['src', 'kind', 'srclang', 'label', 'default'],
  iframe: ['src', 'width', 'height', 'allowfullscreen', 'frameborder', 'scrolling'],
}
const svgAttributes = new Set(
  'viewbox width height x y x1 x2 y1 y2 cx cy r rx ry d points fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-opacity opacity transform preserveaspectratio xmlns offset stop-color stop-opacity font-family font-size text-anchor dx dy'.split(
    ' ',
  ),
)
const styleProperties =
  /^(?:color|background(?:-color)?|font(?:-(?:family|size|style|weight|variant|stretch))?|text-(?:align|decoration(?:-line|-style|-color|-thickness)?|indent|transform|shadow|underline-offset)|line-height|letter-spacing|word-spacing|vertical-align|white-space|word-break|overflow-wrap|display|visibility|opacity|width|height|min-(?:width|height)|max-(?:width|height)|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|border(?:-(?:top|right|bottom|left|color|style|width|radius|collapse|spacing))?|list-style-type|float|clear|overflow(?:-x|-y)?|object-fit|zoom)$/
const resourceAttributes = new Set(['src', 'poster'])
const invisibleTags = new Set([
  'script',
  'style',
  'meta',
  'link',
  'base',
  'head',
  'title',
  'template',
])

export interface HtmlRenderOptions {
  editing?: boolean
  resolveSource?: (source: string) => string | undefined
}

export const isLocalHtmlResource = (source: string) =>
  Boolean(source) && !/^(?:https?:|data:|blob:|asset:|\/\/|#)/i.test(source)

const safeUrl = (value: string, resource: boolean, frame = false) => {
  // eslint-disable-next-line no-control-regex -- 过滤控制字符，防止 URL 协议检查被绕过。
  const compact = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
  if (frame) return /^(?:https?:)?\/\//i.test(compact)
  if (!/^[a-z][\w+.-]*:/i.test(compact)) return true
  if (/^(?:https?:|asset:|blob:)/i.test(compact)) return true
  if (!resource) return /^(?:mailto:|tel:)/i.test(compact)
  return /^data:(?:image\/(?:png|jpeg|gif|webp|avif)|audio\/[\w.+-]+|video\/[\w.+-]+);/i.test(
    compact,
  )
}

const sanitizeStyle = (value: string, editing: boolean) => {
  const style = document.createElement('span').style
  const output = document.createElement('span').style
  style.cssText = value
  for (const property of Array.from(style)) {
    const content = style.getPropertyValue(property)
    if (
      !styleProperties.test(property) ||
      /[\\@]|url\s*\(|expression\s*\(|image-set\s*\(/i.test(content)
    )
      continue
    output.setProperty(property, content)
  }
  if (editing) {
    if (output.display === 'none') output.display = 'inline'
    if (output.visibility === 'hidden' || output.visibility === 'collapse')
      output.visibility = 'visible'
    if (output.opacity === '0') output.opacity = '1'
  }
  return output.cssText
}

export const getHtmlAttributes = (
  element: Element,
  options: HtmlRenderOptions = {},
): Record<string, string> => {
  const tag = element.localName.toLowerCase()
  const attributes: Record<string, string> = {}
  const svg = element.namespaceURI === 'http://www.w3.org/2000/svg'
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase()
    if (
      !globalAttributes.has(name) &&
      !tagAttributes[tag]?.includes(name) &&
      !(svg && svgAttributes.has(name))
    )
      continue
    let value = attribute.value
    if (name === 'style') value = sanitizeStyle(value, options.editing ?? false)
    else if (resourceAttributes.has(name)) {
      if (tag === 'iframe') {
        if (!safeUrl(value, true, true)) continue
      } else {
        if (isLocalHtmlResource(value)) value = options.resolveSource?.(value) ?? value
        if (!safeUrl(value, true)) continue
      }
      if (value.startsWith('//')) value = `https:${value}`
    } else if (['href', 'cite'].includes(name) && !safeUrl(value, false)) continue
    else if (svg && /[\\]|url\s*\(/i.test(value)) continue
    attributes[attribute.name] = value
  }
  if (tag === 'iframe') {
    attributes.sandbox = 'allow-scripts'
    attributes.referrerpolicy = 'no-referrer'
    attributes.loading = 'lazy'
  }
  return attributes
}

/** 源码始终保留；只有进入页面的副本执行标签、属性与样式过滤。 */
export const renderHtml = (source: string, options: HtmlRenderOptions = {}) => {
  const template = document.createElement('template')
  template.innerHTML = source
  const sanitize = (parent: ParentNode) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 8) {
        node.remove()
        continue
      }
      if (node.nodeType !== 1) continue
      const element = node as Element
      const tag = element.localName.toLowerCase()
      if (invisibleTags.has(tag) && element.namespaceURI !== 'http://www.w3.org/2000/svg') {
        element.remove()
        continue
      }
      sanitize(element)
      if (
        !htmlTags.has(tag) &&
        !(element.namespaceURI === 'http://www.w3.org/2000/svg' && svgTags.has(tag))
      ) {
        element.replaceWith(...Array.from(element.childNodes))
        continue
      }
      const attributes = getHtmlAttributes(element, options)
      for (const attribute of Array.from(element.attributes))
        element.removeAttribute(attribute.name)
      for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
    }
  }
  sanitize(template.content)
  return template.innerHTML
}

export const getHtmlResources = (source: string) => {
  const template = document.createElement('template')
  template.innerHTML = source
  const sources = new Set<string>()
  for (const element of template.content.querySelectorAll('img, video, audio, source, track')) {
    for (const name of resourceAttributes) {
      const value = element.getAttribute(name)
      if (value && isLocalHtmlResource(value)) sources.add(value)
    }
  }
  return sources
}

export const isInvisibleHtml = (source: string) =>
  /^\s*(?:<!--|<(?:script|style|meta|link|base|head|title|template)\b)/i.test(source)
