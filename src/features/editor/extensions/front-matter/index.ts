import type { Editor } from '@milkdown/kit/core'
import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import remarkFrontmatter from 'remark-frontmatter'
import type MarkdownIt from 'markdown-it'

// Milkdown defaults remark options to {}; frontmatter requires an explicit matter definition.
export const frontMatterRemark = $remark('lumeFrontMatter', () => remarkFrontmatter, {
  type: 'yaml',
  marker: '-',
})
export const frontMatterSchema = $nodeSchema('front_matter', () => ({
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  isolating: true,
  parseDOM: [{ tag: 'pre[data-front-matter]', preserveWhitespace: 'full' }],
  toDOM: () => [
    'pre',
    { 'data-front-matter': '', class: 'lume-front-matter', 'aria-label': 'YAML Front Matter' },
    ['code', 0],
  ],
  parseMarkdown: {
    match: (node) => node.type === 'yaml',
    runner: (state, node, type) => {
      state.openNode(type)
      if (node.value) state.addText(String(node.value))
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'front_matter',
    runner: (state, node) => state.addNode('yaml', undefined, node.textContent),
  },
}))

export const useFrontMatterWysiwygExtension = (editor: Editor) =>
  editor.use(frontMatterRemark).use(frontMatterSchema)

export function useFrontMatterPreviewExtension(markdown: MarkdownIt) {
  markdown.block.ruler.before('hr', 'front_matter', (state, start, end, silent) => {
    if (start !== 0 || state.parentType !== 'root') return false
    const line = (n: number) => state.src.slice(state.bMarks[n], state.eMarks[n])
    if (!/^\uFEFF?---[ \t]*$/.test(line(0))) return false
    let close = 1
    while (close < end && !/^---[ \t]*$/.test(line(close))) close++
    if (close === end) return false
    if (silent) return true
    const token = state.push('front_matter', '', 0)
    token.content = state.getLines(1, close, 0, false).replace(/\n$/, '')
    token.map = [0, close + 1]
    token.block = true
    state.line = close + 1
    return true
  })
  markdown.renderer.rules.front_matter = (tokens, index) =>
    `<pre class="lume-front-matter" data-front-matter=""><code>${markdown.utils.escapeHtml(tokens[index].content)}</code></pre>\n`
  return markdown
}
