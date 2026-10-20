import { nextTick, shallowRef } from 'vue'
import { editorViewCtx, remarkCtx, serializerCtx, type Editor } from '@milkdown/kit/core'
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state'
import { closeHistory } from '@milkdown/kit/prose/history'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { PropertyForm } from '../overlays/contextMenuTypes'
import { deleteMathBlock } from '../extensions/math/commands'
import { goToFootnoteDefinition } from '../extensions/footnotes/commands'
import { getActionState } from './actionState'
import { insertBlock } from './blockCommands'
import { pasteCodeClipboard, cutCodeSelection } from './codeClipboard'
import { restoreEditorContext, type EditorContext } from './selectionContext'
import type { createEditorCommands } from './editorCommands'
import { isImageFileOperation } from '@/features/images/services/imageFileOperations'
import { useImageFileOperations } from '@/features/images/editor/useImageFileOperations'
import { useDocument } from '@/features/documents/model/useDocument'

export const useEditorActions = (options: {
  getEditor: () => Editor | null
  getCommands: () => ReturnType<typeof createEditorCommands>
  isActive: () => boolean
  onError: (message: string) => void
  onSuccess?: (message: string) => void
  onOpenLink: (href: string) => Promise<void>
  onEditSource?: () => void
  onAfterAction?: (view: EditorView) => void
  replaceImageSources: (replacements: ReadonlyMap<string, string>) => void
}) => {
  const propertyForm = shallowRef<PropertyForm | null>(null)
  let propertyTarget: EditorContext | null = null
  let propertyAction = ''
  const { activeDocument } = useDocument()
  const imageFiles = useImageFileOperations(() =>
    options.isActive() && options.getEditor()
      ? { replaceImageSources: options.replaceImageSources }
      : null,
  )

  const closeProperties = () => {
    const target = propertyTarget
    propertyForm.value = null
    propertyTarget = null
    if (target)
      void nextTick(() => {
        options.getEditor()?.action((ctx) => {
          const view = ctx.get(editorViewCtx)
          if (restore(view, target)) focusTarget(view, target)
        })
      })
  }
  const restore = (view: EditorView, target: EditorContext | null) =>
    Boolean(options.isActive() && target && restoreEditorContext(view, target))
  const focusTarget = (view: EditorView, target: EditorContext) => {
    if (target.nativeCode) target.nativeCode.view.focus()
    else view.focus()
  }
  const invalidate = (view: EditorView) => {
    if (propertyTarget && propertyTarget.doc !== view.state.doc) closeProperties()
  }
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      options.onError('无法写入系统剪贴板。')
      return false
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
  const execute = (id: string, target: EditorContext) => {
    let allowed = false
    let targetMarkdown = ''
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      allowed =
        restore(view, target) &&
        !getActionState(view.state, target, id, view.editable !== false).disabled
      if (allowed && isImageFileOperation(id))
        targetMarkdown = ctx.get(serializerCtx)(view.state.doc)
    })
    if (!allowed) return
    if (isImageFileOperation(id) && target.node) {
      const document = activeDocument.value
      if (!document) return
      const snapshot = {
        id: document.id,
        path: document.path,
        content: targetMarkdown || document.content,
      }
      void imageFiles
        .execute(id, [String(target.node.node.attrs.src ?? '')], snapshot)
        .then((updated) => {
          if (updated && options.isActive())
            options.onSuccess?.(id === 'deleteImageFile' ? '图片及原文件已删除' : '图片路径已更新')
        })
        .catch((error: unknown) =>
          options.onError(error instanceof Error ? error.message : String(error)),
        )
      return
    }
    if (id === 'copyMath' && target.node) {
      void copyText(String(target.node.node.attrs.value ?? '')).then((copied) => {
        if (copied && options.isActive()) options.onSuccess?.('公式源码已复制')
      })
      return
    }
    if (id === 'editMath' && target.node?.node.type.name === 'math_block') {
      options.getEditor()?.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const dom = view.nodeDOM(target.node!.pos)
        if (!(dom instanceof HTMLElement)) return
        dom.dispatchEvent(new Event('lume-edit-math'))
      })
      return
    }
    if (['editImage', 'editMath', 'editLink', 'setLink', 'editCodeLanguage'].includes(id)) {
      openProperties(id, target)
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
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (!restore(view, target)) return
      focusTarget(view, target)
      if (id === 'insertImage' || id === 'insertImageAfter') {
        const image = view.state.schema.nodes.image.create({
          src: '',
          alt:
            id === 'insertImage'
              ? target.doc.textBetween(target.selection.from, target.selection.to, ' ', '')
              : '',
        })
        const tr =
          id === 'insertImageAfter'
            ? insertBlock(view.state, view.state.schema.nodes.paragraph.create(null, image))
            : view.state.tr.replaceSelectionWith(image, false)
        const pos =
          tr.selection.$from.nodeBefore?.type === image.type
            ? tr.selection.from - image.nodeSize
            : tr.selection.from
        tr.setSelection(NodeSelection.create(tr.doc, pos))
        view.dispatch(closeHistory(tr).scrollIntoView())
        const dom = view.nodeDOM(pos)
        if (dom instanceof HTMLElement)
          dom.querySelector<HTMLInputElement>('.lume-image-path__input')?.focus()
        options.onAfterAction?.(view)
        return
      }
      if (
        target.target === 'code' &&
        target.kind === 'node' &&
        target.node &&
        ['copy', 'cut'].includes(id)
      ) {
        const node = target.node
        const doc = view.state.schema.nodes.doc.create(null, node.node)
        void copyText(ctx.get(serializerCtx)(doc)).then((copied) => {
          if (
            id !== 'cut' ||
            !copied ||
            !options.isActive() ||
            view.isDestroyed ||
            view.state.doc !== target.doc ||
            view.editable === false
          )
            return
          view.dispatch(
            view.state.tr.delete(node.pos, node.pos + node.node.nodeSize).scrollIntoView(),
          )
          options.onAfterAction?.(view)
        })
        return
      }
      if (target.nativeCode && ['copy', 'cut', 'paste', 'selectAll'].includes(id)) {
        const code = target.nativeCode
        if (id === 'copy')
          void copyText(
            code.state.selection.ranges
              .filter((range) => !range.empty)
              .map((range) => code.state.sliceDoc(range.from, range.to))
              .join('\n'),
          )
        else if (id === 'cut')
          void cutCodeSelection(view, target, options.isActive, options.onError)
        else if (id === 'paste')
          void pasteCodeClipboard(view, target, options.isActive, options.onError)
        else code.view.dispatch({ selection: { anchor: 0, head: code.state.doc.length } })
        options.onAfterAction?.(view)
        return
      }
      if (standard[id]) {
        standard[id]()
        options.onAfterAction?.(view)
        return
      }
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
      } else if (id === 'copyCode') void copyText(node?.node.textContent ?? '')
      else if (id === 'copySource' && node) {
        const content = node.node.isInline
          ? view.state.schema.nodes.paragraph.create(null, node.node)
          : node.node
        void copyText(ctx.get(serializerCtx)(view.state.schema.nodes.doc.create(null, content)))
      } else if (id === 'editSource') options.onEditSource?.()
      else if (id === 'gotoFootnote' && node) {
        if (
          !goToFootnoteDefinition(String(node.node.attrs.label))(view.state, (tr) =>
            view.dispatch(tr),
          )
        )
          options.onError('找不到对应的脚注定义。')
      } else if (id === 'deleteNode' && node) {
        const tr =
          node.node.type.name === 'math_block'
            ? deleteMathBlock(view.state, node.pos)
            : view.state.tr.delete(node.pos, node.pos + node.node.nodeSize)
        if (tr) view.dispatch(tr.scrollIntoView())
      } else if (/^imageZoom\d+$/.test(id) && node) {
        view.dispatch(view.state.tr.setNodeAttribute(node.pos, 'zoom', Number(id.slice(9))))
      } else if (id.startsWith('image') && node) {
        const align = (
          { imageLeft: 'left', imageCenter: 'center', imageRight: 'right' } as Record<
            string,
            string
          >
        )[id]
        if (align && node.node.attrs.align !== align)
          view.dispatch(view.state.tr.setNodeAttribute(node.pos, 'align', align))
      } else if (id === 'resetImageSize' && node)
        view.dispatch(
          view.state.tr.setNodeMarkup(node.pos, undefined, {
            ...node.node.attrs,
            zoom: 100,
            width: '',
            height: '',
          }),
        )
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
      options.onAfterAction?.(view)
    })
  }
  const submitProperties = (values: Record<string, string>) => {
    const target = propertyTarget
    const action = propertyAction
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      if (
        !restore(view, target) ||
        !target ||
        getActionState(view.state, target, action, view.editable !== false).disabled
      ) {
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
        const referenceId = action === 'editLink' ? target.link?.mark.attrs.referenceId : ''
        if (referenceId) {
          let updated = false
          view.state.doc.descendants((node, pos) => {
            if (
              updated ||
              node.type.name !== 'link_definition' ||
              node.attrs.identifier !== referenceId
            )
              return
            const source = ctx
              .get(remarkCtx)
              .stringify({
                type: 'root',
                children: [
                  {
                    type: 'definition',
                    identifier: referenceId,
                    label: node.attrs.label,
                    url: values.href.trim(),
                    title: values.title || null,
                  },
                ],
              })
              .trimEnd()
            tr.insertText(source, pos + 1, pos + 1 + node.content.size)
            updated = true
            return false
          })
          if (!updated) return
          closeProperties()
          view.dispatch(tr.scrollIntoView())
          return
        }
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
      } else if (target.node) {
        const node = target.node
        tr = tr.setNodeMarkup(node.pos, undefined, { ...node.node.attrs, ...values })
        if (target.selection instanceof NodeSelection)
          tr.setSelection(NodeSelection.create(tr.doc, node.pos))
      }
      closeProperties()
      view.dispatch(tr.scrollIntoView())
      void nextTick(() => {
        if (!options.isActive() || view.isDestroyed || view.state.doc !== tr.doc) return
        if (target.nativeCode && target.nativeCode.view.state.doc === target.nativeCode.state.doc) {
          target.nativeCode.view.dispatch({ selection: target.nativeCode.state.selection })
          target.nativeCode.view.focus()
        } else view.focus()
      })
    })
  }
  return { propertyForm, closeProperties, invalidate, execute, submitProperties }
}
