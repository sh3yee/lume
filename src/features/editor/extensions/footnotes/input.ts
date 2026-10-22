import { InputRule } from '@milkdown/kit/prose/inputrules'
import { isHistoryTransaction } from '@milkdown/kit/prose/history'
import { Fragment, type Node } from '@milkdown/kit/prose/model'
import { insertInlineSource } from '../base/inlineSourceEditing'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@milkdown/kit/prose/state'
import { Mapping } from '@milkdown/kit/prose/transform'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $inputRule, $prose } from '@milkdown/kit/utils'
import { getFootnoteDefinitions, normalizeFootnoteLabel } from './references'

interface TextRange {
  from: number
  to: number
}

interface FootnoteReferenceRange extends TextRange {
  label: string
}

const footnoteInputKey = new PluginKey('lumeFootnoteInput')

const isEscaped = (source: string, index: number) => {
  let escapes = 0
  while (source[index - escapes - 1] === '\\') escapes += 1
  return escapes % 2 === 1
}

// Milkdown 的自定义输入规则不检查 inCodeMark，需在规则内保护代码文字。
const hasCodeMarks = (state: EditorState, from: number, to: number) => {
  if (from < 0 || from > to || to > state.doc.content.size) return true
  let code = state.doc
    .resolve(from)
    .marks()
    .some((mark) => mark.type.spec.code)
  state.doc.nodesBetween(from, to, (node) => {
    if (node.marks.some((mark) => mark.type.spec.code)) code = true
  })
  return code
}

const collectReferences = (
  doc: Node,
  labels: ReadonlySet<string>,
  ranges?: readonly TextRange[],
) => {
  const references: FootnoteReferenceRange[] = []
  doc.descendants((node, pos) => {
    if (ranges && !ranges.some(({ from, to }) => from <= pos + node.nodeSize && pos <= to))
      return false
    if (node.type.spec.code) return false
    if (!node.isTextblock) return
    const source = node.textBetween(0, node.content.size, '\n', '\ufffc')
    for (const match of source.matchAll(/\[\^([^\]\s]+)\]/g)) {
      const index = match.index
      if (!labels.has(normalizeFootnoteLabel(match[1])) || isEscaped(source, index)) continue
      if (/^ {0,3}$/.test(source.slice(0, index)) && source[index + match[0].length] === ':')
        continue
      let textOnly = true
      node.nodesBetween(index, index + match[0].length, (child) => {
        if (!child.isText || child.marks.some((mark) => mark.type.spec.code)) textOnly = false
      })
      if (textOnly)
        references.push({
          from: pos + 1 + index,
          to: pos + 1 + index + match[0].length,
          label: match[1],
        })
    }
    return false
  })
  return references
}

const getChangedRanges = (mapping: Mapping) => {
  const ranges: TextRange[] = []
  mapping.maps.forEach((step, index) => {
    const remaining = mapping.slice(index + 1)
    step.forEach((_oldFrom, _oldTo, from, to) => {
      ranges.push({ from: remaining.map(from, -1), to: remaining.map(to, 1) })
    })
  })
  return ranges
}

export const footnoteReferenceInputRule = $inputRule(
  () =>
    new InputRule(
      /\[\^([^\]\s]+)\]$(?![\s\S])/,
      (state, match, start, end) => {
        if (hasCodeMarks(state, start, end)) return null
        const $start = state.doc.resolve(start)
        const before = $start.parent.textBetween(0, $start.parentOffset, undefined, '\ufffc')
        if (isEscaped(before, before.length)) return null
        const reference = state.schema.nodes.footnote_reference.create(
          { label: match[1] },
          null,
          $start.marks(),
        )
        return insertInlineSource(state.tr, start, end, match[0], Fragment.from(reference))
      },
      { inCodeMark: false },
    ),
)

export const footnoteDefinitionInputRule = $inputRule(
  () =>
    new InputRule(
      /^ {0,3}(?:\[\^([^\]\s]+)\]|\ufffc):[ \t]$/,
      (state, match, start, end) => {
        if (hasCodeMarks(state, start, end)) return null
        const $start = state.doc.resolve(start)
        if ($start.parent.type.name !== 'paragraph') return null
        for (let depth = 1; depth < $start.depth; depth += 1) {
          if ($start.node(depth).type.name === 'footnote_definition') return null
        }
        // 已存在同名定义时，段首的 [^id] 可能已经转换成引用节点。
        const prefix = $start.parent.nodeAt(match[0].search(/\S/))
        const label =
          match[1] ?? (prefix?.type.name === 'footnote_reference' ? prefix.attrs.label : null)
        if (!label) return null
        const type = state.schema.nodes.footnote_definition
        const index = $start.index(-1)
        if (!$start.node(-1).canReplaceWith(index, index + 1, type)) return null
        const paragraph = $start.parent.cut(end - start)
        const from = $start.before()
        const tr = state.tr.replaceWith(from, $start.after(), type.create({ label }, paragraph))
        return tr.setSelection(TextSelection.create(tr.doc, from + 2)).scrollIntoView()
      },
      { inCodeMark: false },
    ),
)

export const footnoteInputPlugin = $prose(() => {
  let editorView: EditorView | null = null
  let compositionTimer: ReturnType<typeof setTimeout> | undefined
  return new Plugin({
    key: footnoteInputKey,
    view(view) {
      editorView = view
      return {
        destroy: () => {
          editorView = null
          clearTimeout(compositionTimer)
        },
      }
    },
    props: {
      handleDOMEvents: {
        compositionend(view, event) {
          const length = event.data.length
          clearTimeout(compositionTimer)
          compositionTimer = setTimeout(() => {
            if (!view.isDestroyed && !view.composing && view.editable)
              view.dispatch(view.state.tr.setMeta(footnoteInputKey, length))
          }, 0)
          return false
        },
      },
    },
    appendTransaction(transactions, oldState, state) {
      if (
        transactions.some((tr) => isHistoryTransaction(tr) || tr.getMeta(footnoteInputKey) === -1)
      )
        return null
      const compositionEnd = transactions.find((tr) => {
        const value = tr.getMeta(footnoteInputKey)
        return typeof value === 'number' && value >= 0
      })
      if (!transactions.some((tr) => tr.docChanged) && !compositionEnd) return null
      const previous = getFootnoteDefinitions(oldState.doc)
      const defined = new Set(getFootnoteDefinitions(state.doc).keys())
      const added = new Set([...defined].filter((label) => !previous.has(label)))

      const mapping = new Mapping()
      transactions.forEach((tr) => mapping.appendMapping(tr.mapping))
      const references = new Map<number, FootnoteReferenceRange>()
      // 只处理原来已有的文字，粘贴内容中的转义与代码由 Markdown 解析器判断。
      if (added.size) {
        for (const reference of collectReferences(oldState.doc, added)) {
          const from = mapping.map(reference.from, 1)
          const to = mapping.map(reference.to, -1)
          if (
            from < to &&
            !hasCodeMarks(state, from, to) &&
            state.doc.textBetween(from, to, '\n', '\ufffc') ===
              oldState.doc.textBetween(reference.from, reference.to, '\n', '\ufffc')
          )
            references.set(from, { from, to, label: reference.label })
        }
      }
      // 浏览器 DOM 更新、批量输入和修改标识也可能绕过逐字输入规则。
      let restoringReference = false
      if (
        oldState.plugins.some((plugin) => plugin.spec.isInputRules && plugin.getState(oldState))
      ) {
        const firstChange = transactions.find((tr) => tr.docChanged)?.mapping.maps[0]
        firstChange?.forEach((from, to) => {
          if (from === to) return
          oldState.doc.nodesBetween(from, to, (node) => {
            if (node.type.name === 'footnote_reference') restoringReference = true
          })
        })
      }
      const skipInput =
        editorView?.composing ||
        transactions.some(
          (tr) =>
            ['paste', 'drop'].includes(tr.getMeta('uiEvent')) ||
            tr.getMeta('composition') !== undefined ||
            tr.getMeta('addToHistory') === false,
        ) ||
        restoringReference
      if (defined.size && (!skipInput || compositionEnd)) {
        const ranges = getChangedRanges(mapping)
        if (compositionEnd) {
          const { $from } = state.selection
          ranges.push({
            from: Math.max(
              $from.start(),
              $from.pos - Math.max(1, compositionEnd.getMeta(footnoteInputKey)),
            ),
            to: $from.pos,
          })
        }
        for (const reference of collectReferences(state.doc, defined, ranges)) {
          if (
            ranges.some(({ from, to }) =>
              from === to
                ? reference.from < from && from < reference.to
                : reference.from < to && from < reference.to,
            )
          )
            references.set(reference.from, reference)
        }
      }
      if (!references.size) return null
      const tr = state.tr
      for (const { from, to, label } of [...references.values()].sort((a, b) => b.from - a.from)) {
        const reference = state.schema.nodes.footnote_reference.create(
          { label },
          null,
          state.doc.resolve(from).marks(),
        )
        tr.replaceWith(from, to, reference)
      }
      return tr.setMeta(footnoteInputKey, -1)
    },
  })
})
