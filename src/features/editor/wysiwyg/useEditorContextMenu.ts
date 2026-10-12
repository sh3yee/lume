import { nextTick, shallowRef } from 'vue'
import { editorViewCtx, serializerCtx, type Editor } from '@milkdown/kit/core'
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { ContextMenuItem, PropertyForm } from '../overlays/contextMenuTypes'
import { insertBlock } from './blockCommands'
import { getContextMenuGroups } from './contextMenuItems'
import { resolveContextTarget, type EditorContext } from './contextTarget'
import type { createEditorCommands } from './editorCommands'

export const useEditorContextMenu = (options: {
  getEditor: () => Editor | null
  getCommands: () => ReturnType<typeof createEditorCommands>
  isActive: () => boolean
  onError: (message: string) => void
  onOpenLink: (href: string) => Promise<void>
}) => {
  const context = shallowRef<EditorContext | null>(null)
  const groups = shallowRef<ContextMenuItem[][]>([])
  const propertyForm = shallowRef<PropertyForm | null>(null)
  let propertyTarget: EditorContext | null = null
  let propertyAction = ''

  const close = () => {
    context.value = null
  }
  const closeProperties = () => {
    const target = propertyTarget
    propertyForm.value = null
    propertyTarget = null
    if (target)
      void nextTick(() => {
        options.getEditor()?.action((ctx) => {
          const view = ctx.get(editorViewCtx)
          if (restore(view, target)) view.focus()
        })
      })
  }
  const restore = (view: EditorView, target: EditorContext | null) => {
    if (!options.isActive() || !target || target.doc !== view.state.doc) return false
    view.dispatch(view.state.tr.setSelection(target.selection))
    return true
  }
  const prepareCommand = () => {
    const target = context.value
    if (!target) return options.isActive()
    let restored = false
    options.getEditor()?.action((ctx) => {
      restored = restore(ctx.get(editorViewCtx), target)
    })
    close()
    return restored
  }
  const open = (event: MouseEvent) => {
    closeProperties()
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      context.value = resolveContextTarget(view, event)
      groups.value = getContextMenuGroups(context.value, view.state)
    })
  }
  const invalidate = (view: EditorView) => {
    if (context.value && context.value.doc !== view.state.doc) close()
    if (propertyTarget && propertyTarget.doc !== view.state.doc) closeProperties()
  }
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      options.onError('无法写入系统剪贴板。')
    }
  }
  const openProperties = (id: string, target: EditorContext) => {
    const attrs = target.node?.node.attrs ?? {}
    const link = id === 'editLink' ? (target.link?.mark.attrs ?? {}) : {}
    const forms: Record<string, PropertyForm> = {
      editImage: {
        title: '编辑图片',
        fields: [
          { key: 'src', label: '图片地址', value: String(attrs.src ?? ''), required: true },
          { key: 'alt', label: '图片说明', value: String(attrs.alt ?? '') },
          { key: 'title', label: '标题', value: String(attrs.title ?? '') },
        ],
      },
      insertImage: {
        title: '插入图片',
        fields: [
          { key: 'src', label: '图片地址', value: '', required: true },
          { key: 'alt', label: '图片说明', value: '' },
          { key: 'title', label: '标题', value: '' },
        ],
      },
      editMath: {
        title: '编辑公式源码',
        fields: [
          {
            key: 'value',
            label: 'LaTeX',
            value: String(attrs.value ?? ''),
            multiline: true,
            required: true,
          },
        ],
      },
      editCodeLanguage: {
        title: '设置代码语言',
        fields: [{ key: 'language', label: '语言标记', value: String(attrs.language ?? '') }],
      },
      editLink: {
        title: '设置链接',
        fields: [
          { key: 'href', label: '链接地址', value: String(link.href ?? ''), required: true },
          { key: 'title', label: '标题', value: String(link.title ?? '') },
        ],
      },
    }
    if (id === 'setLink') forms.setLink = forms.editLink
    propertyTarget = target
    propertyAction = id
    propertyForm.value = forms[id]
  }
  const handleAction = (id: string) => {
    const target = context.value
    if (!target) return
    if (
      ['editImage', 'insertImage', 'editMath', 'editLink', 'setLink', 'editCodeLanguage'].includes(
        id,
      )
    ) {
      openProperties(id, target)
      close()
      return
    }
    const commands = options.getCommands()
    const standard: Record<string, () => void> = {
      copy: commands.copy,
      cut: commands.cut,
      paste: commands.paste,
      insertHr: commands.insertHorizontalRule,
      insertCode: commands.insertCodeBlock,
      insertTable: commands.insertTable,
    }
    if (standard[id]) {
      standard[id]()
      return
    }
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!restore(view, target)) {
        close()
        return
      }
      close()
      view.focus()
      const node = target.node
      if (id === 'copyLink') void copyText(String(target.link?.mark.attrs.href ?? ''))
      else if (id === 'openLink' && target.link)
        void options.onOpenLink(String(target.link.mark.attrs.href)).catch((error: unknown) => {
          if (options.isActive())
            options.onError(error instanceof Error ? error.message : '无法打开链接。')
        })
      else if (id === 'removeLink' && target.link)
        view.dispatch(view.state.tr.removeMark(target.link.from, target.link.to, target.link.mark))
      else if (id === 'copyImageAddress') void copyText(String(node?.node.attrs.src ?? ''))
      else if (id === 'copyImageMarkdown' && node) {
        const doc = view.state.schema.nodes.doc.create(
          null,
          view.state.schema.nodes.paragraph.create(null, node.node),
        )
        void copyText(ctx.get(serializerCtx)(doc))
      } else if (id === 'copyMath') void copyText(String(node?.node.attrs.value ?? ''))
      else if (id === 'copyCode') void copyText(node?.node.textContent ?? '')
      else if (id === 'deleteNode' && node)
        view.dispatch(
          view.state.tr.delete(node.pos, node.pos + node.node.nodeSize).scrollIntoView(),
        )
      else if (id.startsWith('image') && node) {
        const align = (
          { imageLeft: 'left', imageCenter: 'center', imageRight: 'right' } as Record<
            string,
            string
          >
        )[id]
        if (align) view.dispatch(view.state.tr.setNodeAttribute(node.pos, 'align', align))
      } else if (id === 'resetImageSize' && node)
        view.dispatch(view.state.tr.setNodeAttribute(node.pos, 'zoom', 100))
      else if (['paragraphBefore', 'paragraphAfter'].includes(id) && node) {
        const pos = id === 'paragraphBefore' ? node.pos : node.pos + node.node.nodeSize
        const tr = view.state.tr.insert(pos, view.state.schema.nodes.paragraph.create())
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView())
      } else if (id === 'selectAll' && target.target === 'code' && node) {
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.create(
              view.state.doc,
              node.pos + 1,
              node.pos + 1 + node.node.content.size,
            ),
          ),
        )
      } else if (id === 'selectAll') commands.selectAll()
      else commands.execute(id)
    })
  }
  const submitProperties = (values: Record<string, string>) => {
    const target = propertyTarget
    const action = propertyAction
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!restore(view, target) || !target) {
        closeProperties()
        return
      }
      const address = values.src ?? values.href
      const invalidProtocol =
        values.src !== undefined ? /^(?:javascript|vbscript):/i : /^(?:javascript|vbscript|data):/i
      if (address !== undefined && (!address.trim() || invalidProtocol.test(address.trim()))) {
        if (propertyForm.value)
          propertyForm.value = { ...propertyForm.value, error: '请输入有效的图片或链接地址。' }
        return
      }
      if (action === 'editCodeLanguage' && /\s/.test(values.language)) {
        if (propertyForm.value)
          propertyForm.value = { ...propertyForm.value, error: '语言标记不能包含空白。' }
        return
      }
      let tr = view.state.tr
      if (action === 'editLink' || action === 'setLink') {
        const from =
          action === 'editLink'
            ? (target.link?.from ?? target.selection.from)
            : target.selection.from
        const to =
          action === 'editLink' ? (target.link?.to ?? target.selection.to) : target.selection.to
        const mark = view.state.schema.marks.link.create({
          href: values.href.trim(),
          title: values.title,
        })
        tr =
          from === to
            ? tr.insertText(values.href, from, to).addMark(from, from + values.href.length, mark)
            : tr.addMark(from, to, mark)
      } else if (action === 'insertImage') {
        const image = view.state.schema.nodes.image.create({ ...values, src: values.src.trim() })
        const paragraph = view.state.schema.nodes.paragraph.create(null, image)
        tr = insertBlock(view.state, paragraph)
      } else if (target.node) {
        const node = target.node
        tr = tr.setNodeMarkup(node.pos, undefined, { ...node.node.attrs, ...values })
        if (target.selection instanceof NodeSelection)
          tr.setSelection(NodeSelection.create(tr.doc, node.pos))
      }
      closeProperties()
      view.dispatch(tr.scrollIntoView())
      void nextTick(() => {
        if (options.isActive() && !view.isDestroyed && view.state.doc === tr.doc) view.focus()
      })
    })
  }
  return {
    context,
    groups,
    propertyForm,
    close,
    closeProperties,
    prepareCommand,
    open,
    invalidate,
    handleAction,
    submitProperties,
  }
}
