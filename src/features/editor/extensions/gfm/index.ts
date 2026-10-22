import { t } from '@/app/i18n'
import { type Editor } from '@milkdown/kit/core'
import {
  extendListItemSchemaForTask,
  gfm,
  remarkGFMPlugin,
  wrapInTaskListInputRule,
} from '@milkdown/preset-gfm'
import { bulletListSchema, orderedListSchema } from '@milkdown/kit/preset/commonmark'
import type MarkdownIt from 'markdown-it'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { splitListItem } from '@milkdown/kit/prose/schema-list'
import { Plugin } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { $inputRule, $prose, $useKeymap } from '@milkdown/kit/utils'
import { tableInputPlugin } from './tableInput'
import type { Node } from '@milkdown/kit/prose/model'

// remark expects a boolean; the string 'false' would otherwise turn a tight list into a loose one.
const normalizeListSpread = (node: Node) =>
  node.type.create(
    { ...node.attrs, spread: node.attrs.spread === true || node.attrs.spread === 'true' },
    node.content,
    node.marks,
  )

// Milkdown 列表解析器把 spread 写为字符串，兼容其序列化约定和命令创建的布尔值。
export const preservedBulletListSchema = bulletListSchema.extendSchema((previous) => (ctx) => {
  const schema = previous(ctx)
  return {
    ...schema,
    attrs: { ...schema.attrs, spread: { default: false, validate: 'boolean|string' } },
    toMarkdown: {
      ...schema.toMarkdown,
      runner: (state, node) => schema.toMarkdown.runner(state, normalizeListSpread(node)),
    },
  }
})
export const preservedOrderedListSchema = orderedListSchema.extendSchema((previous) => (ctx) => {
  const schema = previous(ctx)
  return {
    ...schema,
    attrs: { ...schema.attrs, spread: { default: false, validate: 'boolean|string' } },
    toMarkdown: {
      ...schema.toMarkdown,
      runner: (state, node) => schema.toMarkdown.runner(state, normalizeListSpread(node)),
    },
  }
})
export const taskListSchema = extendListItemSchemaForTask.extendSchema((previous) => (ctx) => {
  const schema = previous(ctx)
  return {
    ...schema,
    attrs: { ...schema.attrs, spread: { default: true, validate: 'boolean|string' } },
    toMarkdown: {
      ...schema.toMarkdown,
      runner: (state, node) => schema.toMarkdown.runner(state, normalizeListSpread(node)),
    },
  }
})

const taskListInputRule = $inputRule(
  () =>
    new InputRule(/^\[([ xX])\]\s$/, (state, match, start, end) => {
      const $start = state.doc.resolve(start)
      if (
        $start.depth < 2 ||
        $start.parent.type.name !== 'paragraph' ||
        $start.marks().some((mark) => mark.type.spec.code)
      )
        return null
      const item = $start.node(-1)
      if (item.type.name !== 'list_item' || $start.index(-1) !== 0 || item.attrs.checked != null)
        return null
      return state.tr
        .delete(start, end)
        .setNodeAttribute($start.before(-1), 'checked', match[1].toLowerCase() === 'x')
    }),
)

const taskListKeymap = $useKeymap('lumeTaskList', {
  NextTask: {
    shortcuts: 'Enter',
    priority: 60,
    command: () => (state, dispatch, view) => {
      const { $from, $to } = state.selection
      if (
        $from.depth < 2 ||
        !$from.sameParent($to) ||
        $from.parent.type.name !== 'paragraph' ||
        $from.parent.content.size === 0
      )
        return false
      const item = $from.node(-1)
      if (item.type.name !== 'list_item' || typeof item.attrs.checked !== 'boolean') return false
      return splitListItem(item.type)(
        state,
        dispatch &&
          ((tr) => {
            // 段尾和段中拆分均创建未完成任务，不继承原项的勾选状态。
            tr.setNodeAttribute(tr.selection.$from.before(-1), 'checked', false)
            dispatch(tr)
          }),
        view,
      )
    },
  },
})

const taskCheckboxes = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          const decorations: Decoration[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'list_item' || typeof node.attrs.checked !== 'boolean') return
            decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'lume-task-item' }))
            decorations.push(
              Decoration.widget(
                pos + 2,
                (view) => {
                  const input = document.createElement('input')
                  input.type = 'checkbox'
                  input.className = 'lume-task-checkbox'
                  input.checked = node.attrs.checked
                  input.disabled = !view.editable
                  input.contentEditable = 'false'
                  input.setAttribute('aria-label', t('切换任务完成状态'))
                  input.addEventListener('mousedown', (event) => event.preventDefault())
                  input.addEventListener('change', () => {
                    const item = view.state.doc.nodeAt(pos)
                    if (item?.type.name !== 'list_item' || typeof item.attrs.checked !== 'boolean')
                      return
                    if (!view.editable) {
                      input.checked = item.attrs.checked
                      return
                    }
                    view.dispatch(view.state.tr.setNodeAttribute(pos, 'checked', input.checked))
                  })
                  return input
                },
                { key: `task-${pos}-${node.attrs.checked}`, side: -1, stopEvent: () => true },
              ),
            )
          })
          return DecorationSet.create(state.doc, decorations)
        },
      },
    }),
)

/** 注册表格、任务列表和删除线等 GFM 编辑能力。 */
export function useGfmWysiwygExtension(editor: Editor) {
  return editor
    .config((ctx) => ctx.set(remarkGFMPlugin.options.key, { singleTilde: false }))
    .use(gfm.map((plugin) => (plugin === wrapInTaskListInputRule ? taskListInputRule : plugin)))
    .use(preservedBulletListSchema)
    .use(preservedOrderedListSchema)
    .use(taskListSchema)
    .use(taskListKeymap)
    .use(taskCheckboxes)
    .use(tableInputPlugin)
}

/** 显式启用 markdown-it 内置的 GFM 兼容预览规则。 */
export function useGfmPreviewExtension(markdown: MarkdownIt) {
  markdown.renderer.rules.lume_task_checkbox = (tokens, index) => tokens[index].content
  markdown.core.ruler.after('inline', 'lume-task-lists', (state) => {
    const tokens = state.tokens
    for (let index = 2; index < tokens.length; index += 1) {
      const token = tokens[index]
      const item = tokens[index - 2]
      if (
        token.type !== 'inline' ||
        tokens[index - 1].type !== 'paragraph_open' ||
        item.type !== 'list_item_open'
      )
        continue
      const first = token.children?.[0]
      if (first?.type !== 'text') continue
      const match = first.content.match(/^\[([ xX])\](?:\s+|$)/)
      if (!match) continue
      first.content = first.content.slice(match[0].length)
      const checkbox = new state.Token('lume_task_checkbox', '', 0)
      checkbox.content = `<input class="lume-task-checkbox" type="checkbox" disabled${match[1].toLowerCase() === 'x' ? ' checked' : ''} aria-label="${t('任务完成状态')}"> `
      token.children!.unshift(checkbox)
      item.attrJoin('class', 'lume-task-item')
    }
  })
  return markdown.enable(['table', 'strikethrough'])
}
