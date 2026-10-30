import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection, NodeSelection } from '@milkdown/kit/prose/state'
import { history, undo, redo, closeHistory } from '@milkdown/kit/prose/history'
import * as core from '@milkdown/kit/core'
import * as commonmark from '@milkdown/kit/preset/commonmark'
import * as gfm from '@milkdown/preset-gfm'
import { ParserState, SerializerState } from '@milkdown/transformer'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

const server = await createServer({ server: { middlewareMode: true } })
// The i18n module updates only the document language during these model-only tests.
try {
  const load = (path) => server.ssrLoadModule(`/src/features/editor/${path}`)
  const source = await load('extensions/base/inlineSourceEditing.ts')
  const { inlineSourceInputRule } = await load('extensions/base/inlineSourceInput.ts')
  const { inlineFormattingSchemas } = await load('extensions/inline-formatting/schema.ts')
  const { remarkInlineFormatting } = await load('extensions/inline-formatting/syntax.ts')
  globalThis.document = { compatMode: 'CSS1Compat', documentElement: { lang: '' } }
  const { inlineMathSchema, blockMathSchema, mathInputPlugin } = await load(
    'extensions/math/index.ts',
  )
  const { imageSourceInputRule } = await load('wysiwyg/imageInputRule.ts')
  const { sizedImageSchema } = await load('wysiwyg/imageSchema.ts')
  const { footnoteReferenceInputRule } = await load('extensions/footnotes/input.ts')
  const { editableFootnoteReferenceSchema } = await load('extensions/footnotes/schema.ts')
  const links = await load('extensions/base/linkEditing.ts')
  const { inlineLinkInputRule } = await load('extensions/base/linkInput.ts')
  const { htmlInputPlugin } = await load('extensions/html/input.ts')
  const { htmlInteraction } = await load('extensions/html/interaction.ts')
  const htmlSchemas = await load('extensions/html/schema.ts')
  const { remarkHtml } = await load('extensions/html/remark.ts')
  const values = new Map()
  const ctx = {
    inject(key) {
      if (!values.has(key)) values.set(key, key._defaultValue)
    },
    get(key) {
      return values.has(key) ? values.get(key) : key._defaultValue
    },
    set(key, value) {
      values.set(key, value)
    },
    update(key, fn) {
      values.set(key, fn(this.get(key)))
    },
    wait: async () => {},
  }
  for (const plugin of [
    ...commonmark.schema,
    ...gfm.schema,
    ...inlineFormattingSchemas.flat(),
    ...inlineMathSchema,
    ...blockMathSchema,
    ...sizedImageSchema,
    ...editableFootnoteReferenceSchema,
    ...source.inlineSourceSchema,
    ...links.linkSourceSchema,
    ...htmlSchemas.htmlInlineSchema,
    ...htmlSchemas.htmlSourceSchema,
    ...htmlSchemas.htmlBlockSchema,
    ...htmlSchemas.preservedHtmlSchema,
  ])
    await plugin(ctx)()
  const schema = new Schema({
    nodes: Object.fromEntries(ctx.get(core.nodesCtx)),
    marks: Object.fromEntries(ctx.get(core.marksCtx)),
  })
  const processor = remark()
    .use(remarkGfm, { singleTilde: false })
    .use(remarkMath)
    .use(remarkInlineFormatting)
    .use(remarkHtml)
  const parse = ParserState.create(schema, processor)
  const serialize = SerializerState.create(schema, processor)
  ctx.set(core.schemaCtx, schema)
  ctx.set(core.remarkCtx, processor)
  ctx.set(core.parserCtx, parse)
  ctx.set(core.serializerCtx, serialize)
  ctx.set(core.editorViewCtx, {})
  for (const plugin of [
    source.inlineSourceEditingPlugin,
    inlineSourceInputRule,
    imageSourceInputRule,
    footnoteReferenceInputRule,
    mathInputPlugin,
    links.linkEditingPlugin,
    inlineLinkInputRule,
    htmlInputPlugin,
    htmlInteraction,
  ])
    await plugin(ctx)()
  const editing = source.inlineSourceEditingPlugin.plugin()
  let state
  const view = {
    editable: true,
    composing: false,
    hasFocus: () => true,
    get state() {
      return state
    },
    dispatch(tr) {
      state = state.applyTransaction(tr).state
    },
  }
  const lifecycle = editing.spec.view(view)
  const linkLifecycle = links.linkEditingPlugin.plugin().spec.view(view)
  const htmlLifecycle = htmlInteraction.plugin().spec.view(view)
  const start = (text, definitions = '') => {
    const paragraph = schema.nodes.paragraph.create(null, text ? schema.text(text) : null)
    const blocks = [paragraph]
    if (definitions) parse(definitions).forEach((node) => blocks.push(node))
    state = EditorState.create({
      schema,
      doc: schema.nodes.doc.create(null, blocks),
      plugins: [editing, links.linkEditingPlugin.plugin(), htmlInteraction.plugin(), history()],
    })
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1 + text.length)))
  }
  const type = (text, rule) => {
    const { from, to } = state.selection
    if (editing.props.handleTextInput(view, from, to, text)) return
    if (rule) {
      const $from = state.selection.$from
      const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc') + text
      const match = rule.match.exec(before)
      if (match) {
        const tr = rule.handler(state, match, from - (match[0].length - text.length), to)
        if (tr) {
          view.dispatch(tr)
          return
        }
      }
    }
    view.dispatch(state.tr.insertText(text, from, to))
  }
  const formats = [
    '*hello*',
    '_hello_',
    '**hello**',
    '__hello__',
    '***hello***',
    '~~hello~~',
    '==hello==',
    '~hello~',
    '^hello^',
    '`hello`',
    '``a`b``',
    '**one *two* three**',
    '*one **two** three*',
    '==one **two** three==',
    '~a\\ b~',
    '==a &amp; b==',
  ]
  for (const raw of formats) {
    start('')
    // Sequential input catches premature conversion of triple or doubled delimiters.
    for (const char of raw) type(char, inlineSourceInputRule.inputRule)
    assert.equal(state.selection.$from.parent.type.name, 'inline_source', raw)
    assert.equal(state.doc.textContent, raw)
    assert.ok(
      parse(serialize(state.doc)).eq(parse(raw)),
      `save during edit: ${raw}: ${serialize(state.doc)}`,
    )
    type(' ')
    assert.equal(state.selection.$from.parent.type.name, 'paragraph', raw)
    assert.equal(state.doc.firstChild.lastChild.text, ' ')
    assert.equal(state.doc.firstChild.lastChild.marks.length, 0)
    const rendered = state.doc
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, 3)))
    assert.equal(state.selection.$from.parent.type.name, 'inline_source', `reopen: ${raw}`)
    view.dispatch(
      state.tr.setSelection(TextSelection.create(state.doc, state.selection.$from.after())),
    )
    assert.ok(state.doc.eq(rendered), `round trip: ${raw}`)
  }
  for (const [raw, rule, kind, definitions] of [
    ['![alt](image.png)', imageSourceInputRule.inputRule, 'image', ''],
    ['[^note]', footnoteReferenceInputRule.inputRule, 'footnote_reference', '[^note]: a note'],
  ]) {
    start(raw.slice(0, -1), definitions)
    type(raw.at(-1), rule)
    assert.equal(state.selection.$from.parent.type.name, 'inline_source', raw)
    assert.ok(
      parse(serialize(state.doc)).eq(parse(raw + (definitions ? '\n\n' + definitions : ''))),
    )
    type('x')
    assert.equal(state.doc.firstChild.firstChild.type.name, kind)
    assert.equal(state.doc.firstChild.lastChild.text, 'x')
    const doc = state.doc
    const node = doc.firstChild.firstChild
    const handled = editing.props.handleClickOn(view, 1, node, 1, { button: 0 }, true)
    if (kind === 'image') {
      // 图片由专用交互处理，点击和节点选中均不能变成通用源码节点。
      assert.equal(handled, false)
      view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, 1)))
      assert.ok(state.selection instanceof NodeSelection)
      assert.equal(state.selection.node.type.name, 'image')
    } else {
      assert.equal(handled, true)
      assert.equal(state.selection.$from.parent.type.name, 'inline_source')
    }
    view.dispatch(state.tr.setMeta(editing.spec.key, 'blur'))
    assert.ok(state.doc.eq(doc))
  }
  start('$x+y')
  assert.equal(
    mathInputPlugin
      .plugin()
      .props.handleTextInput(view, state.selection.from, state.selection.to, '$'),
    true,
  )
  assert.equal(state.selection.$from.parent.type.name, 'inline_source')
  type('。')
  assert.equal(state.doc.firstChild.firstChild.type.name, 'math_inline')
  assert.equal(state.doc.firstChild.lastChild.text, '。')
  // A one-character superscript can be reopened by clicking either edge.
  start('')
  for (const char of '^2^') type(char, inlineSourceInputRule.inputRule)
  type(' ')
  assert.equal(editing.props.handleClick(view, 1, { button: 0 }), true)
  assert.equal(state.selection.$from.parent.type.name, 'inline_source')
  // Image presentation data survives an unchanged source edit.
  const image = schema.nodes.image.create({
    src: 'a.png',
    alt: 'alt',
    width: '240',
    height: '120',
    zoom: 75,
  })
  start('')
  view.dispatch(state.tr.insert(1, image))
  view.dispatch(
    source.openInlineSource(state.tr, 1, 2, () => '<img src="a.png" width="240" height="120" />'),
  )
  view.dispatch(state.tr.setMeta(editing.spec.key, 'blur'))
  assert.ok(state.doc.firstChild.firstChild.eq(image))
  start('[^missing')
  type(']', footnoteReferenceInputRule.inputRule)
  assert.equal(state.selection.$from.parent.type.name, 'inline_source')
  assert.ok(serialize(state.doc).includes('[^missing]'))
  type(' ')
  assert.equal(state.selection.$from.parent.type.name, 'paragraph')
  // Keyboard entry also works for atoms and one-character formatted text.
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1)))
  const arrow = { key: 'ArrowRight', preventDefault() {} }
  assert.equal(editing.props.handleDOMEvents.keydown(view, arrow), true)
  assert.equal(state.selection.$from.parent.type.name, 'inline_source')
  // Formatting syntax inside code and escaped delimiters must remain literal.
  for (const raw of ['\\*hello*', '* hello *', '**unfinished', '~~unfinished']) {
    start('')
    for (const char of raw) type(char, inlineSourceInputRule.inputRule)
    assert.equal(state.doc.firstChild.firstChild.type.name, 'text', raw)
  }
  start('')
  for (const char of '**hello**') type(char, inlineSourceInputRule.inputRule)
  type(' ')
  view.dispatch(closeHistory(state.tr))
  type('tail')
  assert.equal(undo(state, view.dispatch), true)
  assert.equal(state.doc.textContent, 'hello ')
  assert.equal(redo(state, view.dispatch), true)
  assert.equal(state.doc.textContent, 'hello tail')
  start('')
  for (const char of '**hello**') type(char, inlineSourceInputRule.inputRule)
  type(' ')
  assert.equal(undo(state, view.dispatch), true)
  assert.equal(state.doc.textContent, '', 'undo creation must not leave delimiter fragments')
  assert.equal(redo(state, view.dispatch), true)
  assert.equal(state.doc.textContent, 'hello ')
  const beforeEditing = parse(serialize(state.doc))
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, 3)))
  view.dispatch(closeHistory(state.tr))
  type('X')
  view.dispatch(
    state.tr.setSelection(TextSelection.create(state.doc, state.selection.$from.after())),
  )
  assert.equal(undo(state, view.dispatch), true)
  assert.ok(
    parse(serialize(state.doc)).eq(beforeEditing),
    `undo source edit preserves content: ${serialize(state.doc)}`,
  )
  // Composition and paste may bypass handleTextInput; appended text must still leave the source.
  start('')
  for (const char of '**hello**') type(char, inlineSourceInputRule.inputRule)
  view.dispatch(state.tr.insertText(' pasted'))
  assert.equal(state.doc.textContent, 'hello pasted')
  assert.equal(state.selection.$from.parent.type.name, 'paragraph')
  start('')
  for (const char of '==hello==') type(char, inlineSourceInputRule.inputRule)
  editing.props.handleDOMEvents.compositionstart(view)
  view.composing = true
  view.dispatch(state.tr.insertText('中文'))
  view.composing = false
  editing.props.handleDOMEvents.compositionend(view)
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(state.doc.textContent, 'hello中文')
  assert.equal(state.selection.$from.parent.type.name, 'paragraph')
  start('[hello](https://example.com')
  type(')', inlineLinkInputRule.inputRule)
  assert.equal(state.selection.$from.parent.type.name, 'link_source')
  assert.equal(
    links.linkEditingPlugin
      .plugin()
      .props.handleTextInput(view, state.selection.from, state.selection.to, ' '),
    true,
  )
  assert.equal(state.doc.firstChild.firstChild.marks[0].type.name, 'link')
  assert.equal(state.doc.firstChild.lastChild.text, ' ')
  for (const raw of ['<span>hello</span>', '<i>hello</i>', '<span><b>hello</b></span>', '<br>']) {
    start(raw.slice(0, -1))
    assert.equal(
      htmlInputPlugin
        .plugin()
        .props.handleTextInput(view, state.selection.from, state.selection.to, '>'),
      true,
    )
    assert.equal(state.selection.$from.parent.type.name, 'html_source', raw)
    assert.equal(state.doc.textContent, raw)
    assert.equal(
      htmlInteraction
        .plugin()
        .props.handleTextInput(view, state.selection.from, state.selection.to, ' '),
      true,
      raw,
    )
    assert.equal(state.selection.$from.parent.type.name, 'paragraph', raw)
    assert.equal(state.doc.firstChild.lastChild.text, ' ')
  }
  lifecycle.destroy()
  linkLifecycle.destroy()
  htmlLifecycle.destroy()
  console.log('PASS: inline formats, atoms, save/reopen, boundary typing, escaping and undo/redo')
} finally {
  await server.close()
}
