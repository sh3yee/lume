import { type Editor } from '@milkdown/kit/core'
import type MarkdownIt from 'markdown-it'

let renderSequence = 0

/** Mermaid 在 WYSIWYG 中复用可编辑的围栏代码块，不注册额外节点。 */
export function useMermaidWysiwygExtension(editor: Editor) {
  return editor
}

/** 将 Mermaid 围栏代码块输出为可异步增强的安全占位元素。 */
export function useMermaidPreviewExtension(markdown: MarkdownIt) {
  const defaultFenceRenderer = markdown.renderer.rules.fence!
  markdown.renderer.rules.fence = (tokens, index, options, env, renderer) => {
    const token = tokens[index]
    if (token.info.trim().split(/\s+/)[0]?.toLowerCase() !== 'mermaid') {
      return defaultFenceRenderer(tokens, index, options, env, renderer)
    }

    const source = encodeURIComponent(token.content.trim())
    const fallback = markdown.utils.escapeHtml(token.content)
    return `<div class="lume-mermaid" data-mermaid-source="${source}"><pre><code>${fallback}</code></pre></div>`
  }
  return markdown
}

/** 按需加载 Mermaid，并增强当前 Preview 中尚未渲染的图表。 */
export async function renderMermaidDiagrams(container: HTMLElement) {
  const diagrams = Array.from(container.querySelectorAll<HTMLElement>('.lume-mermaid[data-mermaid-source]'))
  if (diagrams.length === 0) return

  const sequence = ++renderSequence
  const { default: mermaid } = await import('mermaid')
  const isDark = document.documentElement.dataset.theme === 'dark'
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: isDark ? 'dark' : 'default',
  })

  for (const [index, diagram] of diagrams.entries()) {
    if (sequence !== renderSequence || !diagram.isConnected) return
    const encodedSource = diagram.dataset.mermaidSource
    if (!encodedSource) continue

    try {
      const source = decodeURIComponent(encodedSource)
      const { svg, bindFunctions } = await mermaid.render(`lume-mermaid-${sequence}-${index}`, source)
      if (sequence !== renderSequence || !diagram.isConnected) return
      diagram.innerHTML = svg
      diagram.classList.remove('lume-mermaid--error')
      diagram.removeAttribute('data-mermaid-source')
      bindFunctions?.(diagram)
    } catch (error) {
      diagram.classList.add('lume-mermaid--error')
      diagram.title = error instanceof Error ? error.message : 'Mermaid 图表渲染失败'
    }
  }
}
