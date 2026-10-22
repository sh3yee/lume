import { language, t } from '@/app/i18n'
import { type Editor } from '@milkdown/kit/core'
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { NodeSelection } from '@milkdown/kit/prose/state'
import { Plugin, Selection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { $nodeSchema, $prose, $remark } from '@milkdown/kit/utils'
import markdownItKatex from '@vscode/markdown-it-katex'
import katex from 'katex'
import type MarkdownIt from 'markdown-it'
import remarkMath from 'remark-math'
import { watch } from 'vue'
import { markdownPreferences } from '@/app/preferences/useMarkdownPreference'
import { deleteMathBlock } from './commands'
import { Fragment } from '@milkdown/kit/prose/model'
import { insertInlineSource } from '../base/inlineSourceEditing'

const mathRemarkPlugin = $remark('lumeMath', () => remarkMath)

function createBlockMathNodeView(
  node: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  const dom = document.createElement('div')
  dom.className = 'lume-math lume-math--block'
  dom.contentEditable = 'false'
  let currentNode = node
  let editing = false
  let source: HTMLTextAreaElement | null = null
  let preview: HTMLDivElement | null = null
  let composing = false

  const renderPreview = (target: HTMLElement, value: string) => {
    dom.dataset.math = value
    dom.classList.toggle('lume-math--empty', !value.trim())
    if (!value.trim()) {
      const placeholder = document.createElement('span')
      placeholder.className = 'lume-math__placeholder'
      placeholder.textContent = editing ? t('公式预览') : t('数学公式 · 点击编辑')
      target.replaceChildren(placeholder)
      return
    }
    katex.render(value, target, {
      displayMode: true,
      output: 'htmlAndMathml',
      strict: 'ignore',
      throwOnError: false,
    })
  }

  const resizeSource = () => {
    if (!source) return
    source.style.height = 'auto'
    source.style.height = `${source.scrollHeight}px`
  }

  const render = () => {
    dom.replaceChildren()
    dom.contentEditable = 'false'
    dom.className = 'lume-math lume-math--block'
    renderPreview(dom, String(currentNode.attrs.value ?? ''))
  }

  const finish = (direction?: number) => {
    if (!editing || !source) return
    const value = source.value
    editing = false
    source = null
    preview = null
    const pos = getPos()
    if (pos == null || view.isDestroyed) return
    const tr = view.state.tr
    if (value !== currentNode.attrs.value)
      tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, value })
    if (direction) {
      const edge = direction < 0 ? pos : pos + currentNode.nodeSize
      const $edge = tr.doc.resolve(edge)
      const next = Selection.findFrom($edge, direction, true)
      if (next) tr.setSelection(next)
      else {
        const paragraph = view.state.schema.nodes.paragraph.createAndFill()
        const index = $edge.index()
        if (paragraph && $edge.parent.canReplaceWith(index, index, paragraph.type)) {
          tr.insert(edge, paragraph)
          tr.setSelection(TextSelection.create(tr.doc, edge + 1))
        }
      }
    }
    render()
    if (tr.docChanged || tr.selectionSet) view.dispatch(tr.scrollIntoView())
    if (direction) view.focus()
  }

  const start = () => {
    if (editing || !view.editable) return
    editing = true
    source = document.createElement('textarea')
    source.className = 'lume-math__source'
    source.value = String(currentNode.attrs.value ?? '')
    source.setAttribute('aria-label', t('公式源码'))
    source.placeholder = t('在此输入 LaTeX 公式')
    source.rows = 1
    source.spellcheck = false
    preview = document.createElement('div')
    preview.className = 'lume-math__preview'
    renderPreview(preview, source.value)
    source.addEventListener('compositionstart', () => {
      composing = true
    })
    source.addEventListener('compositionend', () => {
      composing = false
    })
    source.addEventListener('keydown', (event) => {
      if (event.isComposing || composing || !source || !view.editable) return
      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (source.value.length) return
        const pos = getPos()
        if (pos == null || view.isDestroyed) return
        const tr = deleteMathBlock(view.state, pos)
        if (!tr) return
        event.preventDefault()
        editing = false
        source = null
        preview = null
        view.dispatch(tr.scrollIntoView())
        view.focus()
        return
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        finish(1)
      } else if (
        event.key === 'ArrowUp' &&
        !composing &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !source?.value.slice(0, source.selectionStart).includes('\n')
      ) {
        event.preventDefault()
        finish(-1)
      } else if (
        event.key === 'ArrowDown' &&
        !composing &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !source?.value.slice(source.selectionEnd).includes('\n')
      ) {
        event.preventDefault()
        finish(1)
      }
    })
    source.addEventListener('input', () => {
      if (!preview || !source) return
      resizeSource()
      renderPreview(preview, source.value)
      const pos = getPos()
      if (pos != null && source.value !== currentNode.attrs.value)
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, {
            ...currentNode.attrs,
            value: source.value,
          }),
        )
    })
    source.addEventListener('blur', () => finish(), { once: true })
    const controls = document.createElement('div')
    controls.className = 'lume-math__controls'
    const label = document.createElement('span')
    label.textContent = 'LaTeX'
    const done = document.createElement('button')
    done.type = 'button'
    done.className = 'lume-math__done'
    done.setAttribute('aria-label', t('完成公式编辑'))
    done.title = t('完成编辑（Ctrl/⌘ + Enter）')
    const check = document.createElement('span')
    check.className = 'lume-math__check'
    check.setAttribute('aria-hidden', 'true')
    done.append(check)
    done.addEventListener('mousedown', (event) => event.preventDefault())
    done.addEventListener('click', () => finish(1))
    controls.append(label, done)
    const editor = document.createElement('div')
    editor.className = 'lume-math__editor'
    editor.append(source, controls)
    dom.replaceChildren(editor, preview)
    dom.classList.add('lume-math--editing')
    requestAnimationFrame(() => {
      resizeSource()
      source?.focus()
    })
  }

  const edit = () => {
    start()
    source?.focus()
  }
  dom.addEventListener('lume-edit-math', edit)
  dom.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('textarea, button')) return
    if (view.state.selection instanceof NodeSelection && view.state.selection.from === getPos())
      edit()
  })
  render()

  const stopLanguageWatch = watch(language, () => {
    if (!editing) render()
    if (source && preview) {
      source.setAttribute('aria-label', t('公式源码'))
      source.placeholder = t('在此输入 LaTeX 公式')
      renderPreview(preview, source.value)
    }
    const done = dom.querySelector<HTMLButtonElement>('.lume-math__done')
    if (done) {
      done.setAttribute('aria-label', t('完成公式编辑'))
      done.title = t('完成编辑（Ctrl/⌘ + Enter）')
    }
  })

  return {
    dom,
    update(updated) {
      if (updated.type !== node.type) return false
      currentNode = updated
      if (!editing) render()
      else if (source && preview && source.value !== updated.attrs.value) {
        source.value = String(updated.attrs.value ?? '')
        renderPreview(preview, source.value)
        resizeSource()
      }
      return true
    },
    stopEvent(event) {
      return (
        editing &&
        event.target instanceof Element &&
        Boolean(event.target.closest('textarea, button'))
      )
    },
    ignoreMutation() {
      return true
    },
    destroy() {
      stopLanguageWatch()
      source = null
      preview = null
    },
    selectNode: start,
    deselectNode: () => finish(),
  }
}

function renderMath(value: string, displayMode: boolean) {
  const element = document.createElement(displayMode ? 'div' : 'span')
  element.className = displayMode ? 'lume-math lume-math--block' : 'lume-math lume-math--inline'
  element.dataset.math = value
  katex.render(value, element, {
    displayMode,
    output: 'htmlAndMathml',
    strict: 'ignore',
    throwOnError: false,
  })
  return element
}

export const inlineMathSchema = $nodeSchema('math_inline', () => ({
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  attrs: { value: { default: '', validate: 'string' } },
  leafText: (node) => `$${String(node.attrs.value ?? '')}$`,
  parseDOM: [
    {
      tag: 'span[data-math]',
      getAttrs: (dom) => ({ value: dom instanceof HTMLElement ? (dom.dataset.math ?? '') : '' }),
    },
  ],
  toDOM: (node) => {
    const value = String(node.attrs.value ?? '')
    return markdownPreferences.enabled.inlineMath
      ? renderMath(value, false)
      : ['span', { 'data-math': value, class: 'lume-math lume-math--source' }, `$${value}$`]
  },
  parseMarkdown: {
    match: (node) => node.type === 'inlineMath',
    runner: (state, node, type) => state.addNode(type, { value: String(node.value ?? '') }),
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_inline',
    runner: (state, node) => state.addNode('inlineMath', undefined, String(node.attrs.value ?? '')),
  },
}))

const createInlineMathNodeView = (node: ProseMirrorNode): NodeView => {
  const dom = document.createElement('span')
  dom.className = 'lume-math lume-math--inline'
  dom.contentEditable = 'false'
  let currentNode = node
  const render = () => {
    const value = String(currentNode.attrs.value ?? '')
    dom.dataset.math = value
    dom.classList.toggle('lume-math--source', !markdownPreferences.enabled.inlineMath)
    if (markdownPreferences.enabled.inlineMath)
      dom.replaceChildren(...renderMath(value, false).childNodes)
    else {
      dom.textContent = `$${value}$`
    }
  }
  // 设置只改变公式的显示方式，保留原有文档、光标和撤销记录。
  const stop = watch(() => markdownPreferences.enabled.inlineMath, render, {
    immediate: true,
    flush: 'sync',
  })
  return {
    dom,
    update(updated) {
      if (updated.type !== node.type) return false
      currentNode = updated
      render()
      return true
    },
    ignoreMutation: () => true,
    destroy: stop,
  }
}

export const blockMathSchema = $nodeSchema('math_block', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  attrs: { value: { default: '', validate: 'string' } },
  parseDOM: [
    {
      tag: 'div[data-math]',
      getAttrs: (dom) => ({ value: dom instanceof HTMLElement ? (dom.dataset.math ?? '') : '' }),
    },
  ],
  toDOM: (node) => renderMath(String(node.attrs.value ?? ''), true),
  parseMarkdown: {
    match: (node) => node.type === 'math',
    runner: (state, node, type) => state.addNode(type, { value: String(node.value ?? '') }),
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => state.addNode('math', undefined, String(node.attrs.value ?? '')),
  },
}))

export const mathInputPlugin = $prose(
  (ctx) =>
    new Plugin({
      props: {
        handleKeyDown(view, event) {
          if (
            event.key !== 'Enter' ||
            event.isComposing ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.shiftKey ||
            !view.editable
          )
            return false
          const { $from, empty } = view.state.selection
          if (
            !empty ||
            $from.parent.type.name !== 'paragraph' ||
            $from.parentOffset !== $from.parent.content.size ||
            $from.parent.textContent !== '$$'
          )
            return false
          const pos = $from.before()
          const tr = view.state.tr.replaceWith(
            pos,
            $from.after(),
            blockMathSchema.type(ctx).create(),
          )
          view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)).scrollIntoView())
          return true
        },
        handlePaste(view, event) {
          if (view.state.selection.$from.parent.type.spec.code) return false
          const source = event.clipboardData?.getData('text/plain').trim() ?? ''
          const blockMatch = source.match(/^\$\$\s*([\s\S]*?\S)\s*\$\$$/)
          if (blockMatch?.[1]) {
            const { $from, empty } = view.state.selection
            if (!empty || !$from.parent.isTextblock || $from.parent.content.size > 0) return false

            event.preventDefault()
            const blockPosition = $from.before()
            const mathNode = blockMathSchema.type(ctx).create({ value: blockMatch[1] })
            const tr = view.state.tr.replaceWith(blockPosition, $from.after(), mathNode)
            view.dispatch(
              tr.setSelection(NodeSelection.create(tr.doc, blockPosition)).scrollIntoView(),
            )
            return true
          }

          const inlineMatch = source.match(/^\$(?!\$|\s)([\s\S]*?\S)\$$/)
          if (!inlineMatch?.[1]) return false

          event.preventDefault()
          const mathNode = inlineMathSchema.type(ctx).create({ value: inlineMatch[1] })
          view.dispatch(view.state.tr.replaceSelectionWith(mathNode).scrollIntoView())
          return true
        },
        handleTextInput(view, from, to, text) {
          if (text !== '$') return false

          const { state } = view
          const { $from } = state.selection
          if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false

          const textBeforeCursor =
            $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc') + text
          const blockMatch = textBeforeCursor.match(/^\$\$(?!\s)([\s\S]*?\S)\$\$$/)
          if (blockMatch?.[1] && $from.parentOffset === $from.parent.content.size) {
            const blockPosition = $from.before()
            const mathNode = blockMathSchema.type(ctx).create({ value: blockMatch[1] })
            const tr = state.tr.replaceWith(blockPosition, $from.after(), mathNode)
            view.dispatch(
              tr.setSelection(NodeSelection.create(tr.doc, blockPosition)).scrollIntoView(),
            )
            return true
          }

          const inlineMatch = textBeforeCursor.match(/(^|[^\\$])\$(?!\s)([^$\n]*?\S)\$$/)
          if (!inlineMatch?.[2]) return false

          const delimiterLength = inlineMatch[0].length - inlineMatch[1].length
          const mathNode = inlineMathSchema.type(ctx).create({ value: inlineMatch[2] })
          view.dispatch(
            insertInlineSource(
              state.tr,
              from - delimiterLength + 1,
              to,
              `$${inlineMatch[2]}$`,
              Fragment.from(mathNode),
            ).scrollIntoView(),
          )
          return true
        },
      },
    }),
)

/** 注册数学 Markdown 解析、节点 Schema 和 KaTeX 渲染。 */
export function useMathWysiwygExtension(editor: Editor) {
  return editor
    .use(mathRemarkPlugin)
    .use(inlineMathSchema)
    .use(blockMathSchema)
    .use(
      $prose(
        () =>
          new Plugin({
            props: {
              nodeViews: {
                math_block: createBlockMathNodeView,
                math_inline: createInlineMathNodeView,
              },
            },
          }),
      ),
    )
    .use(mathInputPlugin)
}

/** 注册与 WYSIWYG 相同分隔符规则的 KaTeX Preview 渲染。 */
export function useMathPreviewExtension(markdown: MarkdownIt) {
  markdown.use(markdownItKatex, {
    katex,
    throwOnError: false,
  })
  const renderInlineMath = markdown.renderer.rules.math_inline!
  markdown.renderer.rules.math_inline = (tokens, index, options, env, renderer) =>
    markdownPreferences.enabled.inlineMath
      ? renderInlineMath(tokens, index, options, env, renderer)
      : markdown.utils.escapeHtml(`$${tokens[index].content}$`)
  return markdown
}
