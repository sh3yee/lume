import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Clock, Container, Ctx } from '@milkdown/kit/ctx'
import {
  nodesCtx,
  marksCtx,
  schemaCtx,
  remarkStringifyOptionsCtx,
  editorViewCtx,
} from '@milkdown/kit/core'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection, NodeSelection } from '@milkdown/kit/prose/state'
import { CellSelection } from '@milkdown/kit/prose/tables'
import { history, undo, redo } from '@milkdown/kit/prose/history'
import { ParserState, SerializerState } from '@milkdown/kit/transformer'
import * as commonmark from '@milkdown/kit/preset/commonmark'
import * as gfm from '@milkdown/preset-gfm'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkGfm from 'remark-gfm'
import MarkdownIt from 'markdown-it'
import {
  convertHeading,
  convertList,
  convertBlockquote,
  convertParagraph,
  insertBlock,
  toggleTask,
} from '../src/features/editor/wysiwyg/blockCommands'
import { tableCommands } from '../src/features/editor/wysiwyg/tableCommands'
import { preservedCodeSchema } from '../src/features/editor/wysiwyg/codeSchema'
import {
  linkDefinitionSchema,
  resolveReferences,
} from '../src/features/editor/extensions/base/linkDefinitions'
import { sizedImageSchema } from '../src/features/editor/wysiwyg/imageSchema'
import {
  useGfmPreviewExtension,
  taskListSchema,
  preservedBulletListSchema,
  preservedOrderedListSchema,
} from '../src/features/editor/extensions/gfm'
import { useImagesPreviewExtension } from '../src/features/editor/extensions/images'
import { selectionContainsPosition } from '../src/features/editor/wysiwyg/contextTarget'
import { getContextMenuGroups } from '../src/features/editor/wysiwyg/contextMenuItems'
import { pasteClipboard } from '../src/features/editor/wysiwyg/clipboard'
import { createEditorCommands } from '../src/features/editor/wysiwyg/editorCommands'
import { useEditorContextMenu } from '../src/features/editor/wysiwyg/useEditorContextMenu'
import { canOpenEditorLink } from '../src/features/editor/wysiwyg/editorLinks'

// 使用安装的 Milkdown schema 与真实解析器；这些用例不模拟浏览器 DOM 验收。
const context = new Ctx(new Container(), new Clock())
context.inject(nodesCtx, []).inject(marksCtx, []).inject(remarkStringifyOptionsCtx)
for (const value of [...Object.values(commonmark), ...Object.values(gfm)]) {
  if (typeof value?.key?.create === 'function') context.inject(value.key)
}
await commonmark.docSchema(context)()
await commonmark.textSchema(context)()
for (const value of [
  ...Object.values(commonmark),
  ...Object.values(gfm),
  preservedCodeSchema,
  linkDefinitionSchema,
  sizedImageSchema,
  taskListSchema,
  preservedBulletListSchema,
  preservedOrderedListSchema,
]) {
  if (!value?.key || (!value.node && !value.mark)) continue
  value.ctx(context)
  await (value.node ?? value.mark)(context)()
}
const schema = new Schema({
  nodes: Object.fromEntries(context.get(nodesCtx)),
  marks: Object.fromEntries(context.get(marksCtx)),
})
context.inject(schemaCtx, schema)
const remark = unified()
  .use(remarkParse)
  .use(remarkStringify)
  .use(remarkGfm)
  .use(() => resolveReferences)
const parse = ParserState.create(schema, remark)
context.inject(editorViewCtx)
const serializer = SerializerState.create(schema, remark)
const serialize = (doc) => {
  context.set(editorViewCtx, { state: { doc } })
  return serializer(doc)
}
const stateFor = (source: string) =>
  EditorState.create({ schema, doc: parse(source), plugins: [history()] })
const selectAllText = (state) =>
  state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, state.doc.content.size - 1)))
const run = (state, command) => {
  let next = state
  assert.equal(
    command(state, (tr) => {
      next = state.apply(tr)
    }),
    true,
  )
  next.doc.check()
  return next
}

test('标题、引用和多项列表转换保留粗体、链接、图片和段落', () => {
  const state = selectAllText(
    stateFor('**粗体** [链接](https://example.com) ![图片](logo.png)\n\n第二段'),
  )
  const expected = state.doc.toJSON().content.map((node) => node.content)
  const heading = run(state, convertHeading(2))
  assert.deepEqual(
    heading.doc.toJSON().content.map((node) => node.content),
    expected,
  )
  const quote = run(state, convertBlockquote)
  assert.deepEqual(quote.doc.firstChild.content.toJSON(), state.doc.content.toJSON())
  const unquoted = run(quote, convertParagraph)
  assert.deepEqual(unquoted.doc.toJSON(), state.doc.toJSON())
  const list = run(state, convertList(false))
  assert.equal(list.doc.firstChild.childCount, 2)
  assert.deepEqual(
    list.doc.firstChild.toJSON().content.map((item) => item.content[0].content),
    expected,
  )
})

test('列表类型转换保留任务状态和嵌套结构，并支持撤销重做', () => {
  let state = stateFor('- [x] **第一项**\n  - 子项\n- [ ] [第二项](https://example.com)')
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)))
  const original = state.doc
  const ordered = run(state, convertList(true))
  assert.equal(ordered.doc.firstChild.type.name, 'ordered_list')
  assert.equal(ordered.doc.firstChild.firstChild.attrs.checked, true)
  assert.equal(ordered.doc.firstChild.firstChild.child(1).type.name, 'bullet_list')
  const toggled = run(ordered, toggleTask)
  assert.equal(toggled.doc.firstChild.firstChild.attrs.checked, false)
  const undone = run(toggled, undo)
  assert.deepEqual(undone.doc.toJSON(), ordered.doc.toJSON())
  assert.deepEqual(run(undone, undo).doc.toJSON(), original.toJSON())
  assert.deepEqual(run(undone, redo).doc.toJSON(), toggled.doc.toJSON())
})

test('新增代码块不会替换所选正文', () => {
  const state = selectAllText(stateFor('**保留** [链接](https://example.com)'))
  const next = state.apply(insertBlock(state, schema.nodes.code_block.create({ language: 'ts' })))
  next.doc.check()
  assert.deepEqual(next.doc.firstChild.toJSON(), state.doc.firstChild.toJSON())
  assert.equal(next.doc.child(1).type.name, 'code_block')
})

test('代码围栏元数据和未引用链接定义在编辑、保存、重开后保留', () => {
  const source =
    '正文\n\n```js title="保真" {1}\nconsole.log(1)\n```\n\n[开发][dev]\n\n[dev]: https://example.com "说明"\n[unused]: ./unused.md "未引用"'
  let state = stateFor(source)
  state = state.apply(state.tr.insertText('编辑', 1))
  const saved = serialize(state.doc)
  assert.match(saved, /js title="保真" \{1\}/)
  assert.match(saved, /\[unused\]: \.\/unused.md "未引用"/)
  assert.equal(parse(saved).child(1).attrs.meta, 'title="保真" {1}')
  assert.equal(parse(saved).lastChild.attrs.identifier, 'unused')
})

test('预览任务列表支持大小写和嵌套，图片 HTML 扩展不会转义复选框', () => {
  const markdown = useGfmPreviewExtension(new MarkdownIt({ html: true }))
  useImagesPreviewExtension(markdown, () => undefined)
  const html = markdown.render(
    '- [ ] 待办\n- [X] 完成\n  - [x] 嵌套\n\n普通 [x] 正文\n\n- `[x]` 代码',
  )
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 3)
  assert.equal((html.match(/disabled checked/g) ?? []).length, 2)
  assert.match(html, /普通 \[x\] 正文/)
})

test('表格增删行列、整列对齐保持 GFM 结构与序列化属性', () => {
  let state = stateFor('| 左 | 右 |\n| --- | --- |\n| **A** | B |\n| C | D |')
  const cells: number[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'table_cell') cells.push(pos)
  })
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cells[0] + 2)))
  state = run(state, tableCommands.alignColumnRight)
  assert.match(serialize(state.doc), /-+:/)
  assert.equal(state.doc.firstChild.firstChild.firstChild.attrs.alignment, 'right')
  state = run(state, tableCommands.rowAfter)
  assert.equal(state.doc.firstChild.childCount, 4)
  state = run(state, tableCommands.deleteRow)
  assert.equal(state.doc.firstChild.childCount, 3)
  state = run(state, tableCommands.colAfter)
  assert.equal(state.doc.firstChild.firstChild.childCount, 3)
  state = run(state, tableCommands.deleteColumn)
  assert.equal(state.doc.firstChild.firstChild.childCount, 2)
})

test('选区归属区分文本、节点和多单元格；代码菜单不含富文本动作', () => {
  const state = stateFor('第一段\n\n第二段')
  const text = TextSelection.create(state.doc, 1, 3)
  assert.equal(selectionContainsPosition(text, 2), true)
  assert.equal(selectionContainsPosition(text, 7), false)
  const imageDoc = parse('![图片](logo.png)')
  assert.equal(selectionContainsPosition(NodeSelection.create(imageDoc, 1), 1), true)
  const tableDoc = parse('| A | B |\n| --- | --- |\n| C | D |')
  const cells: number[] = []
  tableDoc.descendants((node, pos) => {
    if (node.type.name === 'table_cell') cells.push(pos)
  })
  const selection = CellSelection.create(tableDoc, cells[0], cells[1])
  assert.equal(selectionContainsPosition(selection, cells[1] + 2), true)
  assert.equal(selectionContainsPosition(selection, 1), false)
  const code = stateFor('```ts\nhello\n```')
  const groups = getContextMenuGroups(
    {
      doc: code.doc,
      selection: code.selection,
      containers: ['code_block'],
      target: 'code',
      node: { pos: 0, node: code.doc.firstChild },
      link: null,
    },
    code,
  )
  const ids = groups.flat().map((item) => item.id)
  assert.ok(ids.includes('copyCode'))
  assert.ok(!ids.includes('insert'))
  assert.ok(!ids.includes('bold'))
  assert.equal(groups.flat().find((item) => item.id === 'undo')?.disabled, true)
})

test('右键粘贴读取最新系统内容并保留 HTML；异步读取后的旧文档不会被修改', async () => {
  const globals = ['navigator', 'document', 'DataTransfer', 'ClipboardEvent']
  const originals = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key))
  const setGlobal = (key, value) =>
    Object.defineProperty(globalThis, key, { configurable: true, value })
  class Transfer {
    values = new Map()
    items = { add() {} }
    setData(type, value) {
      this.values.set(type, value)
    }
    getData(type) {
      return this.values.get(type) ?? ''
    }
  }
  class PasteEvent {
    clipboardData
    constructor(_type, options) {
      this.clipboardData = options.clipboardData
    }
  }
  const events = []
  let active = true
  let systemText = 'A'
  let onRead = () => {}
  setGlobal('document', { execCommand: () => false })
  setGlobal('DataTransfer', Transfer)
  setGlobal('ClipboardEvent', PasteEvent)
  setGlobal('navigator', {
    clipboard: {
      read: async () => {
        onRead()
        return [
          {
            types: ['text/plain', 'text/html'],
            getType: async (type) =>
              new Blob([type === 'text/plain' ? systemText : '<strong>B</strong>']),
          },
        ]
      },
    },
  })
  const state = stateFor('目标')
  const view = {
    state,
    isDestroyed: false,
    focus() {},
    dispatch(tr) {
      this.state = this.state.apply(tr)
    },
    dom: {
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent(event) {
        events.push(event)
      },
    },
  }
  try {
    await pasteClipboard(view, () => active, assert.fail)
    systemText = 'B'
    await pasteClipboard(view, () => active, assert.fail)
    assert.equal(events.at(-1).clipboardData.getData('text/plain'), 'B')
    assert.equal(events.at(-1).clipboardData.getData('text/html'), '<strong>B</strong>')
    onRead = () => {
      active = false
    }
    await pasteClipboard(view, () => active, assert.fail)
    assert.equal(events.length, 2)
    active = true
    onRead = () => {
      view.state = stateFor('新文档')
    }
    await pasteClipboard(view, () => active, assert.fail)
    assert.equal(events.length, 2)
    view.state = stateFor('```ts\n代码\n```')
    onRead = () => {}
    await pasteClipboard(view, () => active, assert.fail)
    assert.equal(events.at(-1).clipboardData.getData('text/html'), '')
  } finally {
    globals.forEach((key, index) => {
      if (originals[index]) Object.defineProperty(globalThis, key, originals[index])
      else delete globalThis[key]
    })
  }
})

test('菜单命令恢复捕获选区；旧文档的命令和属性面板不能修改新文档', () => {
  const first = stateFor('第一段\n\n第二段')
  const view = {
    state: first,
    focus() {},
    dispatch: (tr) => {
      view.state = view.state.apply(tr)
    },
  }
  const editor = {
    action(callback) {
      return callback({ get: () => view })
    },
  }
  const menu = useEditorContextMenu({
    getEditor: () => editor,
    getCommands: () => commands,
    isActive: () => true,
    onError: assert.fail,
    onOpenLink: async () => {},
  })
  const commands = createEditorCommands({
    getEditor: () => editor,
    onBeforeCommand: menu.prepareCommand,
    onCopy() {},
    onError: assert.fail,
    isActive: () => true,
    onImageAlign() {},
  })
  const target = {
    doc: first.doc,
    selection: TextSelection.create(first.doc, 1),
    target: 'block',
    containers: ['paragraph'],
    node: null,
    link: null,
  }
  menu.context.value = target
  view.state = first.apply(first.tr.setSelection(TextSelection.create(first.doc, 6)))
  commands.execute('heading2')
  assert.equal(view.state.doc.firstChild.type.name, 'heading')
  assert.equal(view.state.doc.child(1).type.name, 'paragraph')
  menu.context.value = target
  view.state = stateFor('新文档')
  commands.execute('heading2')
  assert.equal(view.state.doc.firstChild.type.name, 'paragraph')
  assert.equal(menu.context.value, null)
  view.state = stateFor('![图片](old.png)')
  menu.context.value = {
    ...target,
    doc: view.state.doc,
    selection: NodeSelection.create(view.state.doc, 1),
    target: 'image',
    node: { pos: 1, node: view.state.doc.nodeAt(1) },
  }
  menu.handleAction('editImage')
  assert.ok(menu.propertyForm.value)
  view.state = stateFor('新文档')
  menu.submitProperties({ src: 'new.png', alt: '说明', title: '' })
  assert.equal(view.state.doc.textContent, '新文档')
  assert.equal(menu.propertyForm.value, null)
})

test('链接菜单支持 HTTP(S)、文档锚点和本地 Markdown，限制无处理器的协议', () => {
  for (const href of [
    'https://example.com',
    '#heading',
    './development.md',
    '../中文文件.md#标题',
    'C:\\docs\\note.md',
  ])
    assert.equal(canOpenEditorLink(href), true)
  for (const href of [
    'javascript:alert(1)',
    'data:text/html,hello',
    'mailto:user@example.com',
    'custom:note.md',
  ])
    assert.equal(canOpenEditorLink(href), false)
})
