import type MarkdownIt from 'markdown-it'
import {
  getHtmlAttributes,
  getHtmlResources,
  renderHtml,
  voidHtmlTags,
  type HtmlRenderOptions,
} from './policy'
import { parseHtmlTag } from './remark'

const configured = new WeakSet<MarkdownIt>()

export const useHtmlPreviewExtension = (markdown: MarkdownIt, options: HtmlRenderOptions = {}) => {
  if (!configured.has(markdown)) {
    configured.add(markdown)
    // 对象整体渲染：保留 SVG 命名空间，并避免脚本、样式内容泄漏为普通文字。
    markdown.inline.ruler.before('html_inline', 'lume_html_object', (state, silent) => {
      const source = state.src.slice(state.pos)
      const match = source.match(
        /^<(svg|script|style|iframe|video|audio)\b(?:[^<>"']|"[^"]*"|'[^']*')*?(?:\/>|>[\s\S]*?<\/\1\s*>)/i,
      )
      if (!match) return false
      if (!silent) {
        const token = state.push('html_inline', '', 0)
        token.content = match[0]
      }
      state.pos += match[0].length
      return true
    })
  }
  markdown.renderer.rules.html_inline = (tokens, index) => {
    const raw = tokens[index].content
    const tag = parseHtmlTag(raw)
    if (!tag) return renderHtml(raw, options)
    if (tag.void && !voidHtmlTags.has(tag.name)) return renderHtml(raw, options)
    if (tag.closing)
      return renderHtml(`<${tag.name}></${tag.name}>`, options) ? `</${tag.name}>` : ''
    const template = document.createElement('template')
    template.innerHTML = renderHtml(raw, options)
    const element = template.content.firstElementChild
    if (!element) return ''
    const attributes = getHtmlAttributes(element, options)
    if (element.localName === 'img' && tokens.length === 1)
      attributes.class = 'lume-image-standalone'
    const attrs = Object.entries(attributes)
      .map(([name, value]) => ` ${name}="${markdown.utils.escapeHtml(value)}"`)
      .join('')
    return `<${element.localName}${attrs}>`
  }
  markdown.renderer.rules.html_block = (tokens, index) => {
    const template = document.createElement('template')
    template.innerHTML = renderHtml(tokens[index].content, options)
    const element = template.content.firstElementChild
    if (
      element?.localName === 'img' &&
      template.content.childElementCount === 1 &&
      !template.content.textContent?.trim()
    )
      element.classList.add('lume-image-standalone')
    return template.innerHTML
  }
  return markdown
}

export const collectHtmlResourceSources = (
  tokens: ReturnType<MarkdownIt['parse']>,
  sources = new Set<string>(),
) => {
  for (const token of tokens) {
    if (token.type === 'html_inline' || token.type === 'html_block')
      for (const source of getHtmlResources(token.content)) sources.add(source)
    if (token.children) collectHtmlResourceSources(token.children, sources)
  }
  return sources
}
