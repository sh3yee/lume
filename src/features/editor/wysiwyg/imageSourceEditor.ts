import { t } from '@/app/i18n'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { parseMarkdownImageAt } from '@/utils/imageMarkdown'

export const createImageSourceEditor = (choose: HTMLButtonElement) => {
  const dom = document.createElement('span')
  const prefix = document.createElement('span')
  const path = document.createElement('span')
  const suffix = document.createElement('span')

  dom.className = 'lume-image-path__source'
  dom.dir = 'ltr'
  dom.setAttribute('role', 'textbox')
  dom.setAttribute('aria-label', t('图片 Markdown'))
  dom.spellcheck = false
  path.className = 'lume-image-path__input'
  path.dataset.placeholder = t('输入图片路径')
  choose.contentEditable = 'false'
  dom.append(prefix, path, choose, suffix)

  const getSelection = () => {
    const selection = dom.ownerDocument.getSelection()
    if (!selection?.anchorNode || !selection.focusNode) return null
    if (!dom.contains(selection.anchorNode) || !dom.contains(selection.focusNode)) return null
    const offsetAt = (node: Node, offset: number) => {
      const range = dom.ownerDocument.createRange()
      range.selectNodeContents(dom)
      range.setEnd(node, offset)
      return range.toString().length
    }
    return {
      anchor: offsetAt(selection.anchorNode, selection.anchorOffset),
      head: offsetAt(selection.focusNode, selection.focusOffset),
    }
  }
  const setSelection = (anchor: number, head = anchor) => {
    const pointAt = (offset: number): [Node, number] => {
      let remaining = Math.max(0, offset)
      const walker = dom.ownerDocument.createTreeWalker(dom, NodeFilter.SHOW_TEXT)
      let text = walker.nextNode()
      while (text) {
        const length = text.textContent?.length ?? 0
        if (remaining <= length) return [text, remaining]
        remaining -= length
        text = walker.nextNode()
      }
      return [dom, dom.childNodes.length]
    }
    dom.ownerDocument.getSelection()?.setBaseAndExtent(...pointAt(anchor), ...pointAt(head))
  }
  const update = (node: ProseNode) => {
    const escape = (value: unknown) => String(value ?? '').replace(/[\\[\]()<>]/g, '\\$&')
    const start = `![${escape(node.attrs.alt)}](`
    const destination = escape(node.attrs.src)
    const title = String(node.attrs.title ?? '').replace(/[\\"]/g, '\\$&')
    const end = title ? ` "${title}")` : ')'
    const value = dom.textContent ?? ''
    const image = parseMarkdownImageAt(value, 0, { allowEmpty: true })
    const matches =
      image?.end === value.length &&
      (['src', 'alt', 'title'] as const).every(
        (attribute) => image[attribute] === (node.attrs[attribute] ?? ''),
      )
    if (
      !matches ||
      dom.childNodes.length !== 4 ||
      prefix.parentNode !== dom ||
      path.parentNode !== dom ||
      choose.parentNode !== dom ||
      suffix.parentNode !== dom
    ) {
      const selection = getSelection()
      prefix.textContent = start
      path.textContent = destination
      suffix.textContent = end
      dom.replaceChildren(prefix, path, choose, suffix)
      if (selection) setSelection(selection.anchor, selection.head)
    }
    path.style.width = `${Math.max(14, Math.min(28, (path.textContent?.length ?? 0) + 1))}ch`
  }

  return {
    dom,
    path,
    update,
    getSelection,
    setSelection,
    getValue: () => dom.textContent ?? '',
    setEditable: (editable: boolean) => {
      dom.contentEditable = editable ? 'plaintext-only' : 'false'
      dom.tabIndex = editable ? 0 : -1
      dom.setAttribute('aria-readonly', String(!editable))
    },
    focusPath() {
      dom.focus()
      const selection = dom.ownerDocument.getSelection()
      selection?.setBaseAndExtent(path, 0, path, 0)
    },
  }
}
