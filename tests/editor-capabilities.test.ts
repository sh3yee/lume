import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Clock, Container, Ctx } from '@milkdown/kit/ctx'
import {
  nodesCtx,
  marksCtx,
  schemaCtx,
  remarkStringifyOptionsCtx,
  editorViewCtx,
  serializerCtx,
} from '@milkdown/kit/core'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection, NodeSelection, AllSelection } from '@milkdown/kit/prose/state'
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
import {
  selectionContainsPosition,
  resolveContextTarget,
} from '../src/features/editor/wysiwyg/contextTarget'
import {
  resolveSelectionContext,
  restoreEditorContext,
} from '../src/features/editor/wysiwyg/selectionContext'
import { getSelectionToolbarModel } from '../src/features/editor/wysiwyg/selectionToolbarItems'
import { getActionState } from '../src/features/editor/wysiwyg/actionState'
import { getEditorCommand } from '../src/features/editor/wysiwyg/editorCommands'
import {
  clipSelectionBounds,
  pickSelectionAnchor,
} from '../src/features/editor/wysiwyg/selectionGeometry'
import { cutCodeSelection, pasteCodeClipboard } from '../src/features/editor/wysiwyg/codeClipboard'
import { getPendingEditorMarkdown } from '../src/features/editor/wysiwyg/editorLifecycle'
import {
  getShortcutCommand,
  createEditorInteractionPlugin,
} from '../src/features/editor/wysiwyg/editorInteraction'
import { EditorState as CodeState, EditorSelection } from '@codemirror/state'
import { inlineMathSchema, blockMathSchema } from '../src/features/editor/extensions/math'
import remarkMath from 'remark-math'
import { getContextMenuGroups } from '../src/features/editor/wysiwyg/contextMenuItems'
import { arePreviewRangesEqual } from '../src/features/editor/preview/usePreviewInteractions'
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
  inlineMathSchema,
  blockMathSchema,
]) {
  if (!value?.key || (!value.node && !value.mark)) continue
  value.ctx(context)
  await (value.node ?? value.mark)(context)()
}
const nodeEntries = context.get(nodesCtx)
const schema = new Schema({
  // 与生产 commonmark 保持一致：默认段落排在引用节点前，不能按模块导出字母序填充空文档。
  nodes: Object.fromEntries([
    ...nodeEntries.filter(([name]) => name === 'paragraph'),
    ...nodeEntries.filter(([name]) => name !== 'paragraph'),
  ]),
  marks: Object.fromEntries(context.get(marksCtx)),
})
context.inject(schemaCtx, schema)
const remark = unified()
  .use(remarkParse)
  .use(remarkStringify)
  .use(remarkGfm)
  .use(remarkMath)
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

test('混合格式显示 mixed，点击统一应用，再点击统一移除且保留选区', () => {
  const initial = selectAllText(stateFor('**粗体** 普通文字'))
  const context = resolveSelectionContext(initial)
  assert.equal(context.target, 'text')
  assert.equal(context.marks.strong, 'mixed')
  const model = getSelectionToolbarModel(context, initial)
  assert.equal(model.items.find((item) => item.id === 'bold').active, 'mixed')
  let state = run(initial, getEditorCommand(initial, 'bold'))
  assert.equal(resolveSelectionContext(state).marks.strong, 'on')
  assert.equal(state.selection.from, initial.selection.from)
  assert.equal(state.selection.to, initial.selection.to)
  state = run(state, getEditorCommand(state, 'bold'))
  assert.equal(resolveSelectionContext(state).marks.strong, 'off')
  assert.equal(state.doc.textContent, initial.doc.textContent)
})

test('行内代码与跨对象、跨代码、全选范围不提供普通格式命令', () => {
  const inline = selectAllText(stateFor('`hello`'))
  const context = resolveSelectionContext(inline)
  assert.equal(context.target, 'inlineCode')
  assert.deepEqual(
    getSelectionToolbarModel(context, inline).items.map((item) => item.id),
    ['copy', 'inlineCode'],
  )
  assert.equal(getEditorCommand(inline, 'bold')(inline), false)
  assert.equal(
    resolveSelectionContext(run(inline, getEditorCommand(inline, 'inlineCode'))).target,
    'text',
  )
  for (const source of [
    '文字 `代码`',
    '文字 ![图片](a.png)',
    '文字 $E=mc^2$',
    '文字\n\n```ts\ncode\n```\n\n正文',
  ]) {
    const state = selectAllText(stateFor(source))
    const context = resolveSelectionContext(state)
    assert.equal(context.target, 'mixed', source)
    assert.deepEqual(
      getSelectionToolbarModel(context, state).items.map((item) => item.id),
      ['copy', 'cut'],
    )
    assert.equal(getEditorCommand(state, 'bold')(state), false)
    assert.equal(getEditorCommand(state, 'heading2')(state), false)
  }
  const document = stateFor('正文')
  const all = document.apply(document.tr.setSelection(new AllSelection(document.doc)))
  assert.equal(resolveSelectionContext(all).target, 'all')
  assert.equal(getEditorCommand(all, 'bold')(all), false)
})

test('链接范围完整识别，跨多个链接不猜测编辑目标；普通光标不出现格式栏', () => {
  const state = stateFor(
    '普通 [链接**粗体**](https://example.com) 其他 [另一个](https://example.com)',
  )
  let linkPos = -1
  let lastPos = -1
  state.doc.descendants((node, pos) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === 'link')) {
      if (linkPos === -1) linkPos = pos
      lastPos = pos
    }
  })
  const caret = state.apply(state.tr.setSelection(TextSelection.create(state.doc, linkPos + 1)))
  const context = resolveSelectionContext(caret)
  assert.equal(context.link.from, linkPos)
  assert.equal(context.link.to - context.link.from, 4)
  assert.equal(getSelectionToolbarModel(context, caret).title, '链接')
  const range = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, linkPos, lastPos + 1)),
  )
  assert.equal(resolveSelectionContext(range).link, null)
  const plain = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))
  assert.equal(getSelectionToolbarModel(resolveSelectionContext(plain), plain), null)
})

test('图片、公式、脚注、源码和分割线使用对象控件；代码光标和代码选区不同', () => {
  const cases = [
    ['![图片](a.png)', 'image', 'editImage'],
    ['$E=mc^2$', 'math', 'editMath'],
    ['<span>源代码</span>', 'source', 'copySource'],
    ['[dev]: ./development.md', 'source', 'editSource'],
    ['---', 'rule', 'paragraphAfter'],
    ['正文[^a]\n\n[^a]: 定义', 'footnote', 'gotoFootnote'],
  ]
  for (const [source, expected, action] of cases) {
    let state = stateFor(source)
    let position = -1
    state.doc.descendants((node, pos) => {
      if (position === -1 && node.isAtom && !node.isText && node.type.name !== 'hardbreak')
        position = pos
    })
    assert.ok(position >= 0, source)
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, position)))
    const context = resolveSelectionContext(state)
    assert.equal(context.target, expected, source)
    const model = getSelectionToolbarModel(context, state)
    assert.ok(
      model.items.some((item) => item.id === action),
      source,
    )
    assert.ok(!model.items.some((item) => item.id === 'bold'), source)
  }
  const code = stateFor('```ts\nhello\n```')
  assert.equal(getSelectionToolbarModel(resolveSelectionContext(code), code), null)
  const selected = code.apply(code.tr.setSelection(TextSelection.create(code.doc, 1, 4)))
  assert.deepEqual(
    getSelectionToolbarModel(resolveSelectionContext(selected), selected).items.map(
      (item) => item.id,
    ),
    ['copy'],
  )
})

test('单元格文字与多单元格具有不同动作，列对齐反映混合状态和 GFM 删除限制', () => {
  let state = stateFor('| 左 | 右 |\n| :--- | ---: |\n| AB | CD |')
  const cells = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'table_cell') cells.push(pos)
  })
  const text = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, cells[0] + 2, cells[0] + 3)),
  )
  assert.equal(resolveSelectionContext(text).target, 'text')
  assert.ok(
    getSelectionToolbarModel(resolveSelectionContext(text), text).items.some(
      (item) => item.id === 'bold',
    ),
  )
  state = state.apply(state.tr.setSelection(CellSelection.create(state.doc, cells[0], cells[1])))
  const context = resolveSelectionContext(state)
  assert.equal(context.target, 'cells')
  assert.ok(!getSelectionToolbarModel(context, state).items.some((item) => item.id === 'bold'))
  assert.equal(getActionState(state, context, 'alignColumnLeft').active, 'mixed')
  assert.equal(getActionState(state, context, 'deleteRow').disabled, true)
  assert.match(getActionState(state, context, 'deleteRow').reason, /至少一行/)
  state = run(state, getEditorCommand(state, 'alignColumnCenter'))
  assert.equal(
    getActionState(state, resolveSelectionContext(state), 'alignColumnCenter').active,
    true,
  )
})

test('只读能力及共享执行入口拒绝修改，快捷键映射与菜单一致', () => {
  const state = selectAllText(stateFor('文字'))
  const target = resolveSelectionContext(state)
  const model = getSelectionToolbarModel(target, state, false)
  assert.deepEqual(
    model.items.map((item) => item.id),
    ['copy'],
  )
  assert.equal(getActionState(state, target, 'bold', false).disabled, true)
  const view = {
    state,
    editable: false,
    dispatch: (tr) => {
      view.state = view.state.apply(tr)
    },
    focus() {},
  }
  const editor = { action: (callback) => callback({ get: () => view }) }
  const actions = useEditorContextMenu({
    getEditor: () => editor,
    getCommands: () => commands,
    isActive: () => true,
    onError: assert.fail,
    onOpenLink: async () => {},
  }).actions
  const commands = createEditorCommands({
    getEditor: () => editor,
    onBeforeCommand: () => true,
    onCopy() {},
    onError: assert.fail,
    isActive: () => true,
    onImageAlign() {},
  })
  actions.execute('bold', target)
  assert.equal(view.state.doc, state.doc)
  assert.equal(
    getShortcutCommand({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, key: 'b' }),
    'bold',
  )
  assert.equal(
    getShortcutCommand({ ctrlKey: true, metaKey: false, altKey: true, shiftKey: false, key: 'c' }),
    'insertCode',
  )
  assert.equal(
    getShortcutCommand({
      ctrlKey: true,
      metaKey: false,
      altKey: true,
      shiftKey: false,
      key: '8',
      getModifierState: () => true,
    }),
    null,
  )
})

test('可见选区定位按活动端选择矩形，裁剪滚出视口的范围', () => {
  const viewport = { top: 100, bottom: 300, left: 50, right: 450 }
  const rects = [
    { top: 10, bottom: 30, left: 60, right: 160 },
    { top: 90, bottom: 120, left: 30, right: 160 },
    { top: 200, bottom: 230, left: 60, right: 160 },
    { top: 500, bottom: 530, left: 60, right: 160 },
  ]
  assert.deepEqual(pickSelectionAnchor(rects, viewport, true), {
    top: 100,
    bottom: 120,
    left: 50,
    right: 160,
  })
  assert.deepEqual(pickSelectionAnchor(rects, viewport, false), rects[2])
  assert.equal(clipSelectionBounds(rects[0], viewport), null)
  assert.equal(pickSelectionAnchor([rects[3]], viewport, false), null)
})

test('代码多范围剪切与粘贴保留各范围，异步期间切换文档拒绝剪切', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const native = CodeState.create({
    doc: 'ab12cd34ef',
    extensions: [CodeState.allowMultipleSelections.of(true)],
    selection: EditorSelection.create(
      [EditorSelection.range(2, 4), EditorSelection.range(6, 8)],
      0,
    ),
  })
  let codeEvent = ''
  const code = {
    state: native,
    dispatch: (spec) => {
      codeEvent = spec.userEvent ?? codeEvent
      code.state = code.state.update(spec).state
    },
    focus() {},
    contentDOM: { addEventListener() {}, removeEventListener() {} },
  }
  const outer = stateFor('```ts\nab12cd34ef\n```')
  const view = { state: outer, isDestroyed: false, dispatch() {} }
  const target = { ...resolveSelectionContext(outer), nativeCode: { view: code, state: native } }
  let copied = ''
  let clipboardText = 'X'
  let beforeWrite = () => {}
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text) => {
          copied = text
          beforeWrite()
        },
        readText: async () => clipboardText,
      },
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { execCommand: () => false },
  })
  try {
    await cutCodeSelection(view, target, () => true, assert.fail)
    assert.equal(copied, '12\n34')
    assert.equal(code.state.doc.toString(), 'abcdef')
    assert.equal(codeEvent, 'delete.cut')
    code.state = native
    await pasteCodeClipboard(view, target, () => true, assert.fail)
    assert.equal(code.state.doc.toString(), 'abXcdXef')
    assert.equal(codeEvent, 'input.paste')
    code.state = native
    clipboardText = 'X\r\nY'
    await pasteCodeClipboard(view, target, () => true, assert.fail)
    assert.equal(code.state.doc.toString(), 'abXcdYef')
    assert.deepEqual(
      code.state.selection.ranges.map((range) => [range.anchor, range.head]),
      [
        [3, 3],
        [6, 6],
      ],
    )
    code.state = native
    clipboardText = 'X\nY\nZ'
    await pasteCodeClipboard(view, target, () => true, assert.fail)
    assert.equal(code.state.doc.toString(), 'abX\nY\nZcdX\nY\nZef')
    code.state = native
    beforeWrite = () => {
      view.state = stateFor('另一个文档')
    }
    await cutCodeSelection(view, target, () => true, assert.fail)
    assert.equal(code.state.doc.toString(), native.doc.toString())
    assert.equal(restoreEditorContext(view, target), false)
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else delete globalThis.document
  }
})

test('模式切换只补齐未同步编辑，纯选区变化不格式化未编辑的文件', () => {
  const original = stateFor('正文\n\n```js title="保留"\ncode\n```')
  const view = { state: original }
  const editor = {
    action: (callback) =>
      callback({
        get: (key) =>
          key === editorViewCtx ? view : key === serializerCtx ? serialize : undefined,
      }),
  }
  assert.equal(getPendingEditorMarkdown(editor, original.doc), null)
  view.state = original.apply(original.tr.setSelection(TextSelection.create(original.doc, 2)))
  assert.equal(getPendingEditorMarkdown(editor, original.doc), null)
  const selected = selectAllText(stateFor('**恢复原样**'))
  view.state = run(
    run(selected, getEditorCommand(selected, 'bold')),
    getEditorCommand(selected, 'bold'),
  )
  assert.notEqual(view.state.doc, selected.doc)
  assert.equal(view.state.doc.eq(selected.doc), true)
  assert.equal(getPendingEditorMarkdown(editor, selected.doc), null)
  view.state = original
  view.state = view.state.apply(view.state.tr.insertText('编辑', 1))
  const source = getPendingEditorMarkdown(editor, original.doc)
  assert.match(source, /编辑正文/)
  assert.match(source, /js title="保留"/)
})

test('整块代码的通用复制保留围栏元数据，剪贴板失败不删除块', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let state = stateFor('```ts title="保持"\nconst value = 1\n```')
  state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 0)))
  const view = {
    state,
    editable: true,
    focus() {},
    dispatch: (tr) => {
      view.state = view.state.apply(tr)
    },
  }
  const editor = {
    action: (callback) => callback({ get: (key) => (key === editorViewCtx ? view : serialize) }),
  }
  let copied = ''
  let fail = false
  const errors = []
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text) => {
          if (fail) throw new Error('denied')
          copied = text
        },
      },
    },
  })
  const actions = useEditorContextMenu({
    getEditor: () => editor,
    getCommands: () => commands,
    isActive: () => true,
    onError: (message) => errors.push(message),
    onOpenLink: async () => {},
  }).actions
  const commands = createEditorCommands({
    getEditor: () => editor,
    onBeforeCommand: () => true,
    onCopy() {},
    onError: assert.fail,
    isActive: () => true,
    onImageAlign() {},
  })
  try {
    actions.execute('copy', resolveSelectionContext(state))
    await new Promise((resolve) => setImmediate(resolve))
    assert.match(copied, /ts title="保持"/)
    assert.match(copied, /const value = 1/)
    fail = true
    actions.execute('cut', resolveSelectionContext(state))
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(view.state.doc, state.doc)
    assert.equal(errors.length, 1)
    fail = false
    actions.execute('cut', resolveSelectionContext(state))
    await new Promise((resolve) => setImmediate(resolve))
    view.state.doc.check()
    assert.equal(view.state.doc.firstChild.type.name, 'paragraph')
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else delete globalThis.navigator
  }
})

test('代码块内右键保留文档全选、整块选区及跨块文字范围', () => {
  const originals = ['Element', 'HTMLElement'].map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  )
  class TestElement {
    contains(element) {
      return element === this
    }
    closest() {
      return null
    }
  }
  for (const key of ['Element', 'HTMLElement'])
    Object.defineProperty(globalThis, key, { configurable: true, value: TestElement })
  try {
    const initial = stateFor('前段\n\n```ts\ncode\n```\n\n后段')
    let codePosition = 0
    initial.doc.descendants((node, pos) => {
      if (node.type.name === 'code_block') codePosition = pos
    })
    const element = new TestElement()
    const view = {
      state: initial,
      nodeDOM: (pos) => (pos === codePosition ? element : null),
      posAtCoords: () => ({ pos: codePosition + 2 }),
      dispatch: (tr) => {
        view.state = view.state.apply(tr)
      },
    }
    const event = { target: element, clientX: 0, clientY: 0 }
    for (const selection of [
      new AllSelection(initial.doc),
      NodeSelection.create(initial.doc, codePosition),
      TextSelection.create(initial.doc, 1, initial.doc.content.size - 1),
    ]) {
      view.state = initial.apply(initial.tr.setSelection(selection))
      const before = view.state
      const target = resolveContextTarget(view, event)
      assert.equal(view.state, before)
      assert.equal(target.selection.eq(selection), true)
    }
    view.state = initial
    const target = resolveContextTarget(view, event)
    assert.equal(target.target, 'code')
    assert.equal(target.kind, 'node')
  } finally {
    for (const [index, key] of ['Element', 'HTMLElement'].entries()) {
      if (originals[index]) Object.defineProperty(globalThis, key, originals[index])
      else delete globalThis[key]
    }
  }
})

test('格式快捷键通过共享动作更新当前选区状态，并拦截只读修改', async () => {
  const original = selectAllText(stateFor('普通 **粗体**'))
  const view = {
    state: original,
    editable: true,
    focus() {},
    dispatch: (tr) => {
      view.state = view.state.apply(tr)
    },
  }
  const editor = {
    action: (callback) => callback({ get: () => view }),
  }
  const commands = createEditorCommands({
    getEditor: () => editor,
    onBeforeCommand: () => true,
    onCopy() {},
    onError: assert.fail,
    isActive: () => true,
    onImageAlign() {},
  })
  const actions = useEditorContextMenu({
    getEditor: () => editor,
    getCommands: () => commands,
    isActive: () => true,
    onError: assert.fail,
    onOpenLink: async () => {},
  }).actions
  const received = []
  const interaction = createEditorInteractionPlugin({
    onAction: (id, target) => {
      received.push(id)
      actions.execute(id, target)
    },
  })
  await interaction({ wait: async () => {}, update() {} })()
  const handle = interaction.plugin().props.handleDOMEvents.keydown
  let prevented = 0
  const event = {
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    key: 'b',
    isComposing: false,
    preventDefault: () => prevented++,
  }
  assert.equal(handle(view, event), true)
  assert.deepEqual(received, ['bold'])
  assert.equal(resolveSelectionContext(view.state).marks.strong, 'on')
  assert.equal(view.state.selection.eq(original.selection), true)
  assert.equal(
    getSelectionToolbarModel(resolveSelectionContext(view.state), view.state).items.find(
      (item) => item.id === 'bold',
    ).active,
    true,
  )
  const before = view.state
  view.editable = false
  assert.equal(handle(view, event), true)
  assert.equal(view.state, before)
  assert.deepEqual(received, ['bold'])
  assert.equal(prevented, 2)
  event.isComposing = true
  assert.equal(handle(view, event), false)
  assert.equal(prevented, 2)
})

test('预览复制目标必须匹配当前节点与范围，同样的文字不代表同一选区', () => {
  // 验证快照边界；浏览器 Selection 事件和焦点仍需桌面验收。
  const firstParagraph = { textContent: '重复内容' }
  const secondParagraph = { textContent: '重复内容' }
  const range = (node, from = 0, to = 4) => ({
    startContainer: node,
    startOffset: from,
    endContainer: node,
    endOffset: to,
  })
  const selected = [range(firstParagraph)]
  assert.equal(arePreviewRangesEqual(selected, [range(firstParagraph)]), true)
  assert.equal(arePreviewRangesEqual(selected, [range(secondParagraph)]), false)
  assert.equal(arePreviewRangesEqual(selected, [range(firstParagraph, 1, 4)]), false)
  assert.equal(arePreviewRangesEqual(selected, [range(firstParagraph, 4, 4)]), false)
  assert.equal(arePreviewRangesEqual(selected, []), false)
  const multiple = [range(firstParagraph), range(secondParagraph)]
  assert.equal(arePreviewRangesEqual(multiple, [...multiple].reverse()), false)
})
