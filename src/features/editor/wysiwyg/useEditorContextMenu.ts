import { shallowRef } from 'vue'
import { editorViewCtx, type Editor } from '@milkdown/kit/core'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { ContextMenuItem } from '../overlays/contextMenuTypes'
import { getContextMenuGroups } from './contextMenuItems'
import { resolveContextTarget, type EditorContext } from './contextTarget'
import { restoreEditorContext } from './selectionContext'
import { useEditorActions } from './useEditorActions'
import type { createEditorCommands } from './editorCommands'

export const useEditorContextMenu = (options: {
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
  const context = shallowRef<EditorContext | null>(null)
  const groups = shallowRef<ContextMenuItem[][]>([])
  const actions = useEditorActions(options)
  const close = () => {
    context.value = null
  }
  const prepareCommand = () => {
    const target = context.value
    if (!target) return options.isActive()
    let restored = false
    options.getEditor()?.action((ctx) => {
      restored = options.isActive() && restoreEditorContext(ctx.get(editorViewCtx), target)
    })
    close()
    return restored
  }
  const open = (event: MouseEvent) => {
    actions.closeProperties()
    options.getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      context.value = resolveContextTarget(view, event)
      groups.value = getContextMenuGroups(context.value, view.state, view.editable !== false)
    })
  }
  const handleAction = (id: string) => {
    const target = context.value
    close()
    if (target) actions.execute(id, target)
  }
  const invalidate = (view: EditorView) => {
    if (context.value && context.value.doc !== view.state.doc) close()
    actions.invalidate(view)
  }
  return {
    ...actions,
    context,
    groups,
    close,
    prepareCommand,
    open,
    invalidate,
    handleAction,
    actions,
  }
}
