import { computed, nextTick } from 'vue'
import { useDocument } from '@/features/documents/model/useDocument'
import { createMarkdownPreview } from '../extensions'

export interface DocumentOutlineItem {
  level: number
  text: string
  index: number
  lineIndex: number
  previewId: string | null
}

const markdown = createMarkdownPreview()
const { activeDocument, updateCursor } = useDocument()

const outlineItems = computed<DocumentOutlineItem[]>(() => {
  const tokens = markdown.parse(activeDocument.value?.content ?? '', {})
  const items: DocumentOutlineItem[] = []

  tokens.forEach((token, tokenIndex) => {
    if (token.type !== 'heading_open' || !token.map) return
    const inline = tokens[tokenIndex + 1]
    const text =
      inline.children
        ?.map((child) => {
          if (['text', 'code_inline', 'image'].includes(child.type)) return child.content
          return child.type === 'softbreak' ? ' ' : ''
        })
        .join('') ?? inline.content

    items.push({
      level: Number(token.tag.slice(1)),
      text,
      index: items.length,
      lineIndex: token.map[0],
      previewId: token.attrGet('id'),
    })
  })

  return items
})

const normalizeHeadingText = (text: string) => text.replace(/\s+/g, ' ').trim()

const getRenderedHeadingText = (heading: HTMLElement) => {
  const content = heading.cloneNode(true) as HTMLElement
  content.querySelectorAll('.lume-image-resizer').forEach((image) => {
    image.replaceWith(image.querySelector('img')?.alt ?? '')
  })
  content.querySelectorAll('img').forEach((image) => image.replaceWith(image.alt))
  content
    .querySelectorAll('.lume-math, [data-type="footnote_reference"], .lume-html-atom')
    .forEach((element) => element.remove())
  return normalizeHeadingText(content.textContent ?? '')
}

const findWysiwygHeading = (root: Element, target: DocumentOutlineItem) => {
  const headings = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
    .filter((heading) => !heading.closest('.lume-html-block, .lume-html-atom'))
    .map((element) => ({
      element,
      level: Number(element.tagName.slice(1)),
      text: getRenderedHeadingText(element),
    }))
  // Preview 将脚注移到文末，所见即所得则保留源码顺序。
  const sourceItems = [...outlineItems.value].sort(
    (first, second) => first.lineIndex - second.lineIndex,
  )
  const matches = (heading: (typeof headings)[number], item: DocumentOutlineItem) =>
    heading.level === item.level && heading.text === normalizeHeadingText(item.text)
  const sameOrder =
    headings.length === sourceItems.length &&
    sourceItems.every((item, index) => matches(headings[index], item))
  if (sameOrder) return headings[sourceItems.indexOf(target)]?.element

  // 编辑器 Markdown 有防抖；大纲尚未同步时，只定位能唯一确认的标题。
  const candidates = headings.filter((heading) => matches(heading, target))
  return candidates.length === 1 ? candidates[0].element : undefined
}

/** 渲染视图中滚动到标题；源码视图用解析器行号区分重名和 Setext 标题。 */
const navigateToHeading = async (index: number) => {
  const target = outlineItems.value[index]
  const documentId = activeDocument.value?.id
  if (!target) return false

  await nextTick()
  if (activeDocument.value?.id !== documentId || outlineItems.value[index] !== target) return false

  const wysiwyg = document.querySelector('.lume-wysiwyg-pane__content .ProseMirror')
  const preview = document.querySelector('.lume-preview-pane__content')
  const heading = wysiwyg
    ? findWysiwygHeading(wysiwyg, target)
    : target.previewId
      ? preview?.querySelector<HTMLElement>(`#${target.previewId}`)
      : undefined
  if (heading) {
    heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return true
  }

  if (wysiwyg) return false

  const textarea = document.querySelector<HTMLTextAreaElement>(
    '.lume-source-editor__textarea, .lume-editor-pane__textarea',
  )
  if (!textarea) return false

  const position = textarea.value
    .split('\n')
    .slice(0, target.lineIndex)
    .reduce((total, line) => total + line.length + 1, 0)
  const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 28.8
  textarea.focus()
  textarea.setSelectionRange(position, position)
  textarea.scrollTop = Math.max(0, target.lineIndex * lineHeight - textarea.clientHeight / 3)
  updateCursor(target.lineIndex + 1, 1)
  return true
}

export const useDocumentOutline = () => ({ outlineItems, navigateToHeading })
