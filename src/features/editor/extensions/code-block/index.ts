import { type Editor } from '@milkdown/kit/core'
import { CodeMirrorBlock, codeBlockConfig } from '@milkdown/components/code-block'
import { defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { LanguageDescription, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import type MarkdownIt from 'markdown-it'
import { codeBlockSchema } from '@milkdown/kit/preset/commonmark'
import { $view } from '@milkdown/kit/utils'
import { codeBlockInteractionPlugin } from '../../wysiwyg/codeBlock'

let highlightSequence = 0

const codeLanguages = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['javascript', 'js', 'jsx'],
    extensions: ['js', 'jsx', 'mjs', 'cjs'],
    load: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true }),
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['typescript', 'ts', 'tsx'],
    extensions: ['ts', 'tsx', 'mts', 'cts'],
    load: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true }),
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['html', 'htm'],
    extensions: ['html', 'htm'],
    load: async () => (await import('@codemirror/lang-html')).html(),
  }),
  LanguageDescription.of({
    name: 'CSS',
    alias: ['css'],
    extensions: ['css'],
    load: async () => (await import('@codemirror/lang-css')).css(),
  }),
  LanguageDescription.of({
    name: 'JSON',
    alias: ['json', 'jsonc'],
    extensions: ['json', 'jsonc'],
    load: async () => (await import('@codemirror/lang-json')).json(),
  }),
  LanguageDescription.of({
    name: 'Markdown',
    alias: ['markdown', 'md'],
    extensions: ['md', 'markdown'],
    load: async () => (await import('@codemirror/lang-markdown')).markdown(),
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['python', 'py'],
    extensions: ['py'],
    load: async () => (await import('@codemirror/lang-python')).python(),
  }),
  LanguageDescription.of({
    name: 'Rust',
    alias: ['rust', 'rs'],
    extensions: ['rs'],
    load: async () => (await import('@codemirror/lang-rust')).rust(),
  }),
  LanguageDescription.of({
    name: 'Java',
    alias: ['java'],
    extensions: ['java'],
    load: async () => (await import('@codemirror/lang-java')).java(),
  }),
  LanguageDescription.of({
    name: 'C++',
    alias: ['c', 'cpp', 'c++', 'cc', 'cxx'],
    extensions: ['c', 'h', 'cpp', 'hpp', 'cc', 'cxx'],
    load: async () => (await import('@codemirror/lang-cpp')).cpp(),
  }),
  LanguageDescription.of({
    name: 'Go',
    alias: ['go', 'golang'],
    extensions: ['go'],
    load: async () => (await import('@codemirror/lang-go')).go(),
  }),
  LanguageDescription.of({
    name: 'SQL',
    alias: ['sql'],
    extensions: ['sql'],
    load: async () => (await import('@codemirror/lang-sql')).sql(),
  }),
]

const eagerCodeBlockView = $view(codeBlockSchema.node, (ctx) => {
  const config = ctx.get(codeBlockConfig.key)
  const languageLoader = {
    getAll: () => codeLanguages.map((language) => ({
      name: language.name,
      alias: language.alias,
    })),
    load: (languageName: string) => {
      const language = codeLanguages.find((item) =>
        item.alias.includes(languageName.toLowerCase()),
      )
      if (!language) return Promise.resolve(undefined)
      if (language.support) return Promise.resolve(language.support)
      return language.load()
    },
  } as unknown as ConstructorParameters<typeof CodeMirrorBlock>[3]
  return (node, view, getPos) => {
    const block = new CodeMirrorBlock(
      node,
      view,
      getPos,
      languageLoader,
      config,
    )

    // 官方 NodeView 默认等待视口观察；嵌套滚动容器中可能无法及时触发，主动初始化避免长期显示纯文本占位符。
    queueMicrotask(() => {
      const eagerBlock = block as unknown as { initializeCodeMirror: () => void }
      eagerBlock.initializeCodeMirror()
    })
    return block
  }
})

/** 注册代码块退出和空代码块转换交互。 */
export function useCodeBlockWysiwygExtension(editor: Editor) {
  return editor
    .config((ctx) => {
      ctx.set(codeBlockConfig.key, {
        ...ctx.get(codeBlockConfig.key),
        languages: codeLanguages,
        extensions: [
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        ],
        expandIcon: '',
        searchIcon: '⌕',
        clearSearchIcon: '×',
        searchPlaceholder: '搜索语言',
        noResultText: '没有匹配的语言',
        copyText: '复制代码',
        copyIcon: '',
        onCopy: () => {
          const button = document.activeElement
          if (!(button instanceof HTMLButtonElement) || !button.classList.contains('copy-button')) return

          button.textContent = '已复制'
          button.dataset.copied = 'true'
          window.setTimeout(() => {
            button.textContent = '复制代码'
            delete button.dataset.copied
          }, 1800)
        },
        renderLanguage: (language) => language,
      })
    })
    .use(codeBlockConfig)
    .use(eagerCodeBlockView)
    .use(codeBlockInteractionPlugin)
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
