import { type Editor } from '@milkdown/kit/core'
import type MarkdownIt from 'markdown-it'
import { codeBlockInteractionPlugin } from '../../wysiwyg/codeBlock'

let highlightSequence = 0

/** 注册代码块退出和空代码块转换交互。 */
export function useCodeBlockWysiwygExtension(editor: Editor) {
  return editor.use(codeBlockInteractionPlugin)
}

/** 将带语言标记的围栏代码块输出为可异步高亮的安全占位元素。 */
export function useCodeBlockPreviewExtension(markdown: MarkdownIt) {
  const defaultFenceRenderer = markdown.renderer.rules.fence!
  markdown.renderer.rules.fence = (tokens, index, options, env, renderer) => {
    const token = tokens[index]
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    if (!language || language === 'mermaid') {
      return defaultFenceRenderer(tokens, index, options, env, renderer)
    }

    const source = encodeURIComponent(token.content)
    const encodedLanguage = encodeURIComponent(language)
    const fallback = markdown.utils.escapeHtml(token.content)
    return `<pre class="lume-code-block" data-code-language="${encodedLanguage}" data-code-source="${source}"><code class="language-${markdown.utils.escapeHtml(language)}">${fallback}</code></pre>`
  }
  return markdown
}

/** 按需加载 Shiki，并增强当前 Preview 中尚未高亮的代码块。 */
export async function highlightCodeBlocks(container: HTMLElement) {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>('.lume-code-block[data-code-source]'))
  if (blocks.length === 0) return

  const sequence = ++highlightSequence
  const { codeToHtml } = await import('shiki')
  const theme = document.documentElement.dataset.theme === 'dark' ? 'github-dark' : 'github-light'

  await Promise.all(blocks.map(async (block) => {
    const encodedSource = block.dataset.codeSource
    const encodedLanguage = block.dataset.codeLanguage
    if (!encodedSource || !encodedLanguage) return

    try {
      const html = await codeToHtml(decodeURIComponent(encodedSource), {
        lang: decodeURIComponent(encodedLanguage),
        theme,
      })
      if (sequence !== highlightSequence || !block.isConnected) return
      const template = document.createElement('template')
      template.innerHTML = html.trim()
      const highlighted = template.content.firstElementChild
      if (!(highlighted instanceof HTMLElement)) return
      highlighted.classList.add('lume-code-block', 'lume-code-block--highlighted')
      block.replaceWith(highlighted)
    } catch {
      // 未知语言或加载失败时保留 markdown-it 的安全纯文本回退。
      block.classList.add('lume-code-block--fallback')
      block.removeAttribute('data-code-source')
    }
  }))
}
