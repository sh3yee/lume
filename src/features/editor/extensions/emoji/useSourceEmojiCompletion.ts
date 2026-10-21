import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import type MarkdownIt from 'markdown-it'
import { markdownPreferences } from '@/app/preferences/useMarkdownPreference'
import { useDocument } from '@/features/documents/model/useDocument'
import { parseHtmlTag } from '../html/remark'
import { createEmojiCompletionPopup, type EmojiCompletionPopup } from './completion'
import { searchEmoji, type EmojiEntry } from './data'
import { getEmojiQuery } from './syntax'

interface CompletionRange {
  from: number
  to: number
  source: string
  documentId: string
}

const mirrorProperties = [
  'box-sizing',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-style',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-indent',
  'text-transform',
  'tab-size',
]

export const useSourceEmojiCompletion = (
  textarea: Ref<HTMLTextAreaElement | null>,
  onCursor: (element: HTMLTextAreaElement) => void,
  markdown: MarkdownIt,
) => {
  const { content, activeDocument, persistDocumentSession } = useDocument()
  let popup: EmojiCompletionPopup | null = null
  let mirror: HTMLDivElement | null = null
  let range: CompletionRange | null = null
  let items: EmojiEntry[] = []
  let selected = 0
  let composing = false
  let disposed = false
  let contextCache: { before: string; after: string; allowed: boolean } | null = null

  const close = () => {
    popup?.hide()
    range = null
    items = []
    selected = 0
  }
  const containsTextMarker = (source: string, marker: string) => {
    for (const block of markdown.parse(source, {})) {
      if (block.type !== 'inline' || !block.children) continue
      const htmlTags: string[] = []
      let automaticLink = false
      for (const token of block.children) {
        if (token.type === 'html_inline') {
          const tag = parseHtmlTag(token.content)
          if (tag?.closing && htmlTags.at(-1) === tag.name) htmlTags.pop()
          else if (tag && !tag.closing && !tag.void) htmlTags.push(tag.name)
        }
        if (token.type === 'link_open')
          automaticLink = token.info === 'auto' || token.markup === 'autolink'
        if (token.type === 'link_close') automaticLink = false
        if (token.type === 'text' && token.content.includes(marker))
          return !htmlTags.length && !automaticLink
      }
    }
    return false
  }
  const isTextContext = (source: string, from: number, to: number) => {
    const before = source.slice(0, from)
    const after = source.slice(to)
    if (contextCache?.before === before && contextCache.after === after) return contextCache.allowed

    let marker = 'lume_emoji_query_8a59f3'
    while (source.includes(marker)) marker += '_'
    let allowed = containsTextMarker(`${before}${marker}${after}`, marker)
    if (allowed) {
      const paragraphStart = before.lastIndexOf('\n\n')
      const paragraph = before.slice(paragraphStart < 0 ? 0 : paragraphStart + 2)
      const openTag = paragraph.slice(paragraph.lastIndexOf('<'))
      if (/^<\/?[a-z!]/i.test(openTag) && !openTag.includes('>')) allowed = false

      // 编辑中的未闭合语法仍是普通 text token，补上结束符再交给同一解析器判断。
      const endings = new Set<string>()
      for (const match of paragraph.matchAll(/`+/g)) endings.add(match[0])
      if (paragraph.includes('$')) {
        endings.add('$')
        endings.add('$$')
      }
      const linkStart = paragraph.lastIndexOf('](')
      if (linkStart >= 0) {
        const destination = paragraph.slice(linkStart + 1)
        const depth = [...destination].reduce(
          (count, character) => count + (character === '(' ? 1 : character === ')' ? -1 : 0),
          0,
        )
        const closeLink = ')'.repeat(Math.max(1, depth))
        for (const quote of ['', '"', "'", '>']) endings.add(`${quote}${closeLink}`)
      }
      for (const ending of endings) {
        if (!allowed) break
        allowed = containsTextMarker(`${before}${marker}${ending}${after}`, marker)
      }
    }
    contextCache = { before, after, allowed }
    return allowed
  }
  const getCaretPosition = (element: HTMLTextAreaElement) => {
    const ownerDocument = element.ownerDocument
    const view = ownerDocument.defaultView
    if (!view) return null
    const style = view.getComputedStyle(element)
    const bounds = element.getBoundingClientRect()
    if (!mirror) {
      mirror = ownerDocument.createElement('div')
      ownerDocument.body.append(mirror)
    }
    for (const property of mirrorProperties)
      mirror.style.setProperty(property, style.getPropertyValue(property))
    Object.assign(mirror.style, {
      position: 'fixed',
      visibility: 'hidden',
      pointerEvents: 'none',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word',
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      height: 'auto',
    })
    mirror.textContent = element.value.slice(0, element.selectionStart)
    const caret = ownerDocument.createElement('span')
    caret.textContent = '\u200b'
    mirror.append(caret)
    const caretBounds = caret.getBoundingClientRect()
    const lineHeight =
      Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.8
    const top = caretBounds.top - element.scrollTop
    if (top < bounds.top || top + lineHeight > bounds.bottom) return null
    return { left: caretBounds.left - element.scrollLeft, top: top + lineHeight }
  }
  const accept = (entry: EmojiEntry) => {
    const element = textarea.value
    const target = range
    if (
      !element ||
      !target ||
      composing ||
      !markdownPreferences.enabled.emoji ||
      activeDocument.value?.id !== target.documentId ||
      element.value !== target.source ||
      element.selectionStart !== target.to ||
      element.selectionEnd !== target.to
    ) {
      close()
      return
    }
    close()
    const to = target.to + (element.value[target.to] === ':' ? 1 : 0)
    const text = `:${entry.name}:`
    element.focus()
    element.setSelectionRange(target.from, to)
    let inserted = false
    try {
      inserted =
        typeof element.ownerDocument.execCommand === 'function' &&
        element.ownerDocument.execCommand('insertText', false, text)
    } catch {
      inserted = false
    }
    if (!inserted) element.setRangeText(text, target.from, to, 'end')
    content.value = element.value
    element.setSelectionRange(target.from + text.length, target.from + text.length)
    onCursor(element)
    persistDocumentSession()
  }
  const show = () => {
    const element = textarea.value
    if (!element || !range || !items.length) return close()
    const position = getCaretPosition(element)
    if (!position) return close()
    popup ??= createEmojiCompletionPopup({ ownerDocument: element.ownerDocument, onSelect: accept })
    popup.show({ items, selected, ...position })
  }
  const refresh = (manual = false) => {
    const element = textarea.value
    const documentId = activeDocument.value?.id
    if (
      disposed ||
      composing ||
      !element ||
      !documentId ||
      element.ownerDocument.activeElement !== element ||
      !markdownPreferences.enabled.emoji ||
      element.selectionStart !== element.selectionEnd ||
      (!manual && !range && markdownPreferences.emojiCompletion !== 'auto')
    )
      return close()

    const to = element.selectionStart
    const query = getEmojiQuery(element.value.slice(0, to))
    if (!query || !isTextContext(element.value, query.from, to)) return close()
    const nextItems = searchEmoji(query.query)
    if (!nextItems.length) return close()
    if (range?.from !== query.from || range.to !== to) selected = 0
    range = { from: query.from, to, source: element.value, documentId }
    items = nextItems
    show()
  }
  const handleInput = () => refresh()
  const handleSelectionChange = () => {
    const element = textarea.value
    if (!range || !element) return
    if (element.selectionStart !== range.to || element.selectionEnd !== range.to) return close()
    refresh()
  }
  const handleKeydown = (event: KeyboardEvent) => {
    if (composing || event.isComposing || event.keyCode === 229) return true
    if (!markdownPreferences.enabled.emoji) {
      close()
      return false
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return false
    if (event.key === 'Escape') {
      const wasOpen = Boolean(range)
      if (wasOpen) close()
      else refresh(true)
      if (!wasOpen && !range) return false
      event.preventDefault()
      event.stopPropagation()
      return true
    }
    if (!range || event.shiftKey) return false
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      selected = (selected + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
      show()
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const entry = items[selected]
      if (entry) accept(entry)
      return true
    }
    return false
  }
  const handleCompositionStart = () => {
    composing = true
    close()
  }
  const handleCompositionEnd = () => {
    composing = false
    void nextTick(() => {
      if (!disposed && markdownPreferences.emojiCompletion === 'auto') refresh()
    })
  }

  watch(
    () => [
      markdownPreferences.enabled.emoji,
      markdownPreferences.emojiCompletion,
      activeDocument.value?.id,
    ],
    close,
    { flush: 'sync' },
  )
  watch(content, (value) => {
    if (textarea.value?.value !== value) close()
  })
  onMounted(() => {
    const ownerDocument = textarea.value?.ownerDocument
    ownerDocument?.addEventListener('selectionchange', handleSelectionChange)
    ownerDocument?.defaultView?.addEventListener('resize', close)
  })
  onBeforeUnmount(() => {
    disposed = true
    const ownerDocument = textarea.value?.ownerDocument
    ownerDocument?.removeEventListener('selectionchange', handleSelectionChange)
    ownerDocument?.defaultView?.removeEventListener('resize', close)
    popup?.destroy()
    mirror?.remove()
  })
  return {
    handleInput,
    handleKeydown,
    handleSelectionChange,
    handleCompositionStart,
    handleCompositionEnd,
    close,
  }
}
