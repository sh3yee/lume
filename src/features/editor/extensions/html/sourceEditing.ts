import { Fragment, Slice, type Node } from '@milkdown/kit/prose/model'
import { PluginKey, TextSelection, type Transaction } from '@milkdown/kit/prose/state'
import { ReplaceAroundStep } from '@milkdown/kit/prose/transform'

export interface HtmlSourceEntry {
  pos: number
  atEnd: boolean
}

export const htmlEditingKey = new PluginKey<HtmlSourceEntry | null>('lumeHtmlEditing')

export const serializeHtmlInline = (node: Node, serialize: (doc: Node) => string) => {
  const { schema } = node.type
  return serialize(
    schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, node)),
  ).replace(/\n$/, '')
}

const hasPlainContent = (node: Node) => {
  let plain = true
  node.forEach((child) => {
    if (!child.isText || child.marks.length) plain = false
  })
  return plain
}

export const expandHtmlSource = (
  tr: Transaction,
  pos: number,
  node: Node,
  serialize: (doc: Node) => string,
  cursor = pos + 1,
) => {
  const source = serializeHtmlInline(node, serialize)
  const { schema } = node.type
  const open = String(node.attrs.open)
  const close = String(node.attrs.close)
  const attrs = { original: source }
  const relative = Math.max(0, Math.min(node.content.size, cursor - pos - 1))
  const prefix = serializeHtmlInline(node.copy(node.content.cut(0, relative)), serialize)
  const offset = Math.max(open.length, prefix.length - close.length)
  if (hasPlainContent(node) && source === open + node.textContent + close) {
    // 保留正文位置映射，展开源码不能吞掉此前输入文字的撤销记录。
    const wrapper = schema.nodes.html_source.create(attrs, schema.text(open + close))
    tr.step(
      new ReplaceAroundStep(
        pos,
        pos + node.nodeSize,
        pos + 1,
        pos + node.nodeSize - 1,
        new Slice(Fragment.from(wrapper), 0, 0),
        1 + open.length,
      ),
    )
  } else {
    tr.replaceWith(
      pos,
      pos + node.nodeSize,
      schema.nodes.html_source.create(attrs, schema.text(source)),
    )
  }
  tr.setSelection(TextSelection.create(tr.doc, pos + 1 + Math.min(source.length, offset)))
  tr.setStoredMarks([])
  return tr.setMeta(htmlEditingKey, true).setMeta('addToHistory', false)
}

export const collapseHtmlSource = (tr: Transaction, pos: number, node: Node, content: Fragment) => {
  const rendered = content.childCount === 1 ? content.firstChild : null
  if (
    rendered?.type.name === 'html_inline' &&
    hasPlainContent(rendered) &&
    node.textContent === rendered.attrs.open + rendered.textContent + rendered.attrs.close
  ) {
    tr.step(
      new ReplaceAroundStep(
        pos,
        pos + node.nodeSize,
        pos + 1 + String(rendered.attrs.open).length,
        pos + node.nodeSize - 1 - String(rendered.attrs.close).length,
        new Slice(Fragment.from(rendered.copy(Fragment.empty)), 0, 0),
        1,
      ),
    )
  } else tr.replaceWith(pos, pos + node.nodeSize, content)
  return tr.setMeta(htmlEditingKey, true)
}
