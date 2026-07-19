<script setup lang="ts">
/**
 * WysiwygPane - 所见即所得编辑区
 *
 * 使用 Milkdown 提供 Markdown-first 的所见即所得编辑体验。
 * 编辑器负责 Markdown 快捷输入、选区、撤销历史和输入法兼容，
 * 组件只负责与 useDocument 同步 Markdown 和光标状态。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Bold, Code, Copy, Italic, RemoveFormatting } from 'lucide-vue-next'
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from '@milkdown/kit/core'
import type { CmdKey } from '@milkdown/kit/core'
import {
  commonmark,
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
} from '@milkdown/kit/preset/commonmark'
import { history, redoCommand, undoCommand } from '@milkdown/kit/plugin/history'
import { AllSelection, Plugin, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { $prose, callCommand, replaceAll } from '@milkdown/kit/utils'
import { useDocument } from '@composables/useDocument'

const { content, updateCursor } = useDocument()

const editorRef = ref<HTMLDivElement | null>(null)
const contextMenu = ref<HTMLDivElement | null>(null)
const contextMenuOpen = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const selectionHasText = ref(false)
const bubbleToolbarOpen = ref(false)
const bubbleToolbarPosition = ref({ x: 0, y: 0 })
let editor: Editor | null = null
let editorMarkdown = content.value
let editorClipboardText = ''

function createParagraphAfterCodeBlock(state: EditorState) {
  const { $from } = state.selection
  const codeBlock = $from.parent
  if (codeBlock.type.name !== 'code_block' || !$from.parentOffset) return null
  if ($from.parentOffset !== codeBlock.content.size || !codeBlock.textContent.endsWith('\n')) return null

  const paragraph = state.schema.nodes.paragraph.create()
  const insertPos = $from.after()
  const tr = state.tr.insert(insertPos, paragraph)
  return tr
    .setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)))
    .scrollIntoView()
}

const codeBlockExitPlugin = $prose(() => new Plugin({
  appendTransaction(_transactions, _oldState, newState) {
    if (newState.doc.lastChild?.type.name !== 'code_block') return null

    return newState.tr.insert(newState.doc.content.size, newState.schema.nodes.paragraph.create())
  },
  props: {
    handleKeyDown(view, event) {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false

      const tr = createParagraphAfterCodeBlock(view.state)
      if (!tr) return false

      event.preventDefault()
      view.dispatch(tr)
      return true
    },
  },
}))

function closeContextMenu() {
  contextMenuOpen.value = false
}

function closeBubbleToolbar() {
  bubbleToolbarOpen.value = false
}

function updateBubbleToolbar(view: EditorView) {
  const { from, to } = view.state.selection
  const hasText = getSelectionHasText(view)
  if (!hasText || contextMenuOpen.value || !view.hasFocus()) {
    closeBubbleToolbar()
    return
  }

  const start = view.coordsAtPos(from)
  const end = view.coordsAtPos(to)
  const toolbarWidth = 184
  const toolbarHeight = 34
  const margin = 8
  const selectionLeft = Math.min(start.left, end.left)
  const selectionRight = Math.max(start.right, end.right)
  const x = selectionLeft + (selectionRight - selectionLeft) / 2 - toolbarWidth / 2
  const preferredY = Math.min(start.top, end.top) - toolbarHeight - margin
  const fallbackY = Math.max(start.bottom, end.bottom) + margin

  bubbleToolbarPosition.value = {
    x: Math.max(margin, Math.min(x, window.innerWidth - toolbarWidth - margin)),
    y: preferredY >= margin ? preferredY : Math.min(fallbackY, window.innerHeight - toolbarHeight - margin),
  }
  bubbleToolbarOpen.value = true
}

function getSelectionHasText(view: EditorView) {
  const { from, to, empty } = view.state.selection
  return !empty && view.state.doc.textBetween(from, to, '\n', '\n').trim().length > 0
}

async function openContextMenu(event: MouseEvent) {
  if (!editor) return
  const menuWidth = 192
  const menuHeight = 292
  const margin = 8

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })

    if (pos && view.state.selection.empty) {
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos.pos))))
    }

    view.focus()
    selectionHasText.value = getSelectionHasText(view)
  })

  contextMenuPosition.value = {
    x: Math.max(margin, Math.min(event.clientX, window.innerWidth - menuWidth - margin)),
    y: Math.max(margin, Math.min(event.clientY, window.innerHeight - menuHeight - margin)),
  }
  closeBubbleToolbar()
  contextMenuOpen.value = true
  await nextTick()
  contextMenu.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
}

function runCommand(command: CmdKey<unknown>, payload?: unknown) {
  closeContextMenu()
  editor?.action((ctx) => {
    ctx.get(editorViewCtx).focus()
    return callCommand(command, payload)(ctx)
  })
}

function runWithView(action: (view: EditorView) => void) {
  closeContextMenu()
  editor?.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    view.focus()
    action(view)
  })
}

function runNativeEditCommand(command: 'copy' | 'cut') {
  runWithView((view) => {
    const { from, to, empty } = view.state.selection
    if (empty) return

    editorClipboardText = view.state.doc.textBetween(from, to, '\n', '\n')
    document.execCommand(command)

    if (command === 'cut') {
      view.dispatch(view.state.tr.delete(from, to).scrollIntoView())
    }
  })
}

function pasteText() {
  runWithView((view) => {
    if (editorClipboardText) {
      view.dispatch(view.state.tr.insertText(editorClipboardText).scrollIntoView())
      return
    }

    document.execCommand('paste')
  })
}

function clearFormatting() {
  runWithView((view) => {
    const { state } = view
    const { from, to } = state.selection
    const tr = Object.values(state.schema.marks).reduce(
      (transaction, markType) => transaction.removeMark(from, to, markType),
      state.tr,
    )
    view.dispatch(tr.scrollIntoView())
  })
}

function selectAllContent() {
  runWithView((view) => {
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
  })
}

function handleContextMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeContextMenu()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

  const items = Array.from(
    contextMenu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
  )
  if (items.length === 0) return
  event.preventDefault()

  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Home') items[0].focus()
  else if (event.key === 'End') items[items.length - 1].focus()
  else {
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = (currentIndex + direction + items.length) % items.length
    items[nextIndex].focus()
  }
}

function handleWindowPointerDown() {
  closeContextMenu()
  closeBubbleToolbar()
}

function handleWindowResize() {
  closeContextMenu()
  closeBubbleToolbar()
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  closeContextMenu()
  closeBubbleToolbar()
}

onMounted(async () => {
  if (!editorRef.value) return

  editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, editorRef.value!)
      ctx.set(defaultValueCtx, content.value)

      ctx.get(listenerCtx)
        .markdownUpdated((_ctx, markdown) => {
          editorMarkdown = markdown
          if (content.value !== markdown) content.value = markdown
        })
        .selectionUpdated((ctx, selection) => {
          const before = selection.$from.doc.textBetween(0, selection.from, '\n', '\n')
          const lines = before.split('\n')
          updateCursor(lines.length, (lines.at(-1)?.length || 0) + 1)
          updateBubbleToolbar(ctx.get(editorViewCtx))
        })
    })
    .use(commonmark)
    .use(history)
    .use(codeBlockExitPlugin)
    .use(listener)
    .create()

  window.addEventListener('pointerdown', handleWindowPointerDown)
  window.addEventListener('blur', handleWindowResize)
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('keydown', handleWindowKeydown)
})

/** 打开文件或新建文档时，将外部 Markdown 更新到 Milkdown。 */
watch(content, (markdown) => {
  if (!editor || markdown === editorMarkdown) return
  editorMarkdown = markdown
  editor.action(replaceAll(markdown))
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleWindowPointerDown)
  window.removeEventListener('blur', handleWindowResize)
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('keydown', handleWindowKeydown)
  void editor?.destroy()
  editor = null
})
</script>

<template>
  <section class="lume-wysiwyg-pane">
    <div ref="editorRef" class="lume-wysiwyg-pane__content" @contextmenu.prevent="openContextMenu"></div>
  </section>

  <Teleport to="body">
    <div
      v-if="bubbleToolbarOpen"
      class="lume-wysiwyg-pane__bubble-toolbar"
      role="toolbar"
      aria-label="选中文本格式"
      :style="{ left: bubbleToolbarPosition.x + 'px', top: bubbleToolbarPosition.y + 'px' }"
      @pointerdown.stop.prevent
    >
      <button type="button" title="加粗" aria-label="加粗" @click="runCommand(toggleStrongCommand.key)">
        <Bold :size="15" :stroke-width="2.25" />
      </button>
      <button type="button" title="斜体" aria-label="斜体" @click="runCommand(toggleEmphasisCommand.key)">
        <Italic :size="15" :stroke-width="2.25" />
      </button>
      <button type="button" title="行内代码" aria-label="行内代码" @click="runCommand(toggleInlineCodeCommand.key)">
        <Code :size="15" :stroke-width="2.1" />
      </button>
      <div class="lume-wysiwyg-pane__bubble-separator" role="separator"></div>
      <button type="button" title="清除格式" aria-label="清除格式" @click="clearFormatting">
        <RemoveFormatting :size="15" :stroke-width="2.1" />
      </button>
      <button type="button" title="复制" aria-label="复制" @click="runNativeEditCommand('copy')">
        <Copy :size="15" :stroke-width="2.1" />
      </button>
    </div>

    <div
      v-if="contextMenuOpen"
      ref="contextMenu"
      class="lume-wysiwyg-pane__context-menu"
      role="menu"
      aria-label="编辑区操作"
      :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
      @contextmenu.prevent
      @keydown="handleContextMenuKeydown"
      @pointerdown.stop
    >
      <template v-if="selectionHasText">
        <button type="button" role="menuitem" @click="runNativeEditCommand('copy')">
          <span>复制</span>
        </button>
        <button type="button" role="menuitem" @click="runNativeEditCommand('cut')">
          <span>剪切</span>
        </button>
        <div class="lume-wysiwyg-pane__context-separator" role="separator"></div>
        <button type="button" role="menuitem" @click="runCommand(toggleStrongCommand.key)">
          <span>加粗</span>
        </button>
        <button type="button" role="menuitem" @click="runCommand(toggleEmphasisCommand.key)">
          <span>斜体</span>
        </button>
        <button type="button" role="menuitem" @click="runCommand(toggleInlineCodeCommand.key)">
          <span>行内代码</span>
        </button>
        <button type="button" role="menuitem" @click="clearFormatting">
          <span>清除格式</span>
        </button>
        <div class="lume-wysiwyg-pane__context-separator" role="separator"></div>
      </template>

      <button type="button" role="menuitem" @click="pasteText">
        <span>粘贴</span>
      </button>
      <button type="button" role="menuitem" @click="runCommand(insertHrCommand.key)">
        <span>插入分割线</span>
      </button>
      <button type="button" role="menuitem" @click="runCommand(createCodeBlockCommand.key)">
        <span>插入代码块</span>
      </button>
      <div class="lume-wysiwyg-pane__context-separator" role="separator"></div>
      <button type="button" role="menuitem" @click="runCommand(undoCommand.key)">
        <span>撤销</span>
      </button>
      <button type="button" role="menuitem" @click="runCommand(redoCommand.key)">
        <span>重做</span>
      </button>
      <button type="button" role="menuitem" @click="selectAllContent">
        <span>全选</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.lume-wysiwyg-pane {
  flex: 1;
  display: flex;
  background-color: var(--lume-bg-surface-raised);
  overflow-x: hidden;
  overflow-y: auto;
  min-width: 0;
  min-height: 0;
}

.lume-wysiwyg-pane__content {
  flex: 1;
  display: flex;
  width: 100%;
  min-height: 100%;
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-md);
  line-height: 1.8;
}

/* 滚动条 */
.lume-wysiwyg-pane::-webkit-scrollbar {
  width: 10px;
}

.lume-wysiwyg-pane::-webkit-scrollbar-track {
  background: transparent;
}

.lume-wysiwyg-pane::-webkit-scrollbar-thumb {
  background-color: var(--lume-border-default);
  border-radius: var(--lume-radius-full);
  border: 2px solid var(--lume-bg-surface-raised);
}

.lume-wysiwyg-pane::-webkit-scrollbar-thumb:hover {
  background-color: var(--lume-border-strong);
}

/* Milkdown 外层保持全宽，正文维持适合阅读的居中宽度。 */
.lume-wysiwyg-pane__content :deep(.milkdown) {
  box-sizing: border-box;
  flex: 1;
  display: flex;
  width: 100%;
  max-width: var(--lume-preview-max-width);
  min-height: 100%;
  margin: 0 auto;
  padding: var(--lume-space-8) var(--lume-space-10);
}

/* 移除 ProseMirror 默认焦点边框。 */
.lume-wysiwyg-pane__content :deep(.ProseMirror),
.lume-wysiwyg-pane__content :deep(.ProseMirror:focus),
.lume-wysiwyg-pane__content :deep(.ProseMirror-focused) {
  flex: 1;
  width: 100%;
  min-height: 100%;
  border: none;
  outline: none;
  box-shadow: none;
}
/* Markdown 元素样式 */
.lume-wysiwyg-pane__content :deep(h1) {
  font-size: 1.8em;
  font-weight: var(--lume-font-weight-bold);
  margin: var(--lume-space-8) 0 var(--lume-space-4);
  padding-bottom: var(--lume-space-2);
  border-bottom: 1px solid var(--lume-border-subtle);
}

.lume-wysiwyg-pane__content :deep(h2) {
  font-size: 1.4em;
  font-weight: var(--lume-font-weight-semibold);
  margin: var(--lume-space-7) 0 var(--lume-space-3);
  padding-bottom: var(--lume-space-1);
  border-bottom: 1px solid var(--lume-border-subtle);
}

.lume-wysiwyg-pane__content :deep(h3) {
  font-size: 1.2em;
  font-weight: var(--lume-font-weight-semibold);
  margin: var(--lume-space-6) 0 var(--lume-space-3);
}

.lume-wysiwyg-pane__content :deep(h4),
.lume-wysiwyg-pane__content :deep(h5),
.lume-wysiwyg-pane__content :deep(h6) {
  font-size: 1em;
  font-weight: var(--lume-font-weight-semibold);
  margin: var(--lume-space-5) 0 var(--lume-space-2);
}

.lume-wysiwyg-pane__content :deep(p) {
  margin: var(--lume-space-3) 0;
}

.lume-wysiwyg-pane__content :deep(a) {
  color: var(--lume-accent-default);
  text-decoration: none;
  transition: color var(--lume-transition-fast);
}

.lume-wysiwyg-pane__content :deep(a:hover) {
  color: var(--lume-accent-hover);
  text-decoration: underline;
}

.lume-wysiwyg-pane__content :deep(strong) {
  font-weight: var(--lume-font-weight-bold);
  color: var(--lume-text-primary);
}

.lume-wysiwyg-pane__content :deep(em) {
  font-style: italic;
}

.lume-wysiwyg-pane__content :deep(ul),
.lume-wysiwyg-pane__content :deep(ol) {
  padding-left: var(--lume-space-6);
  margin: var(--lume-space-3) 0;
}

.lume-wysiwyg-pane__content :deep(li) {
  margin: var(--lume-space-1) 0;
}

.lume-wysiwyg-pane__content :deep(blockquote) {
  margin: var(--lume-space-4) 0;
  padding: var(--lume-space-2) var(--lume-space-5);
  border-left: 3px solid var(--lume-accent-default);
  background-color: var(--lume-accent-subtle);
  border-radius: 0 var(--lume-radius-sm) var(--lume-radius-sm) 0;
  color: var(--lume-text-secondary);
}

.lume-wysiwyg-pane__content :deep(blockquote p) {
  margin: var(--lume-space-1) 0;
}

.lume-wysiwyg-pane__content :deep(code) {
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 0.875em;
  padding: var(--lume-space-1) var(--lume-space-2);
  background-color: var(--lume-code-bg);
  border: 1px solid var(--lume-code-border);
  border-radius: var(--lume-radius-sm);
}

.lume-wysiwyg-pane__content :deep(pre) {
  margin: var(--lume-space-4) 0;
  padding: var(--lume-space-4) var(--lume-space-5);
  background-color: var(--lume-code-bg);
  border: 1px solid var(--lume-code-border);
  border-radius: var(--lume-radius-md);
  overflow-x: auto;
}

.lume-wysiwyg-pane__content :deep(pre code) {
  padding: 0;
  background: none;
  border: none;
  font-size: 0.875em;
  line-height: 1.6;
}

.lume-wysiwyg-pane__content :deep(hr) {
  margin: var(--lume-space-6) 0;
  border: none;
  border-top: 1px solid var(--lume-border-subtle);
}

.lume-wysiwyg-pane__content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: var(--lume-space-4) 0;
  font-size: 0.875em;
}

.lume-wysiwyg-pane__content :deep(th),
.lume-wysiwyg-pane__content :deep(td) {
  padding: var(--lume-space-2) var(--lume-space-4);
  border: 1px solid var(--lume-border-default);
  text-align: left;
}

.lume-wysiwyg-pane__content :deep(th) {
  background-color: var(--lume-bg-surface);
  font-weight: var(--lume-font-weight-semibold);
}

.lume-wysiwyg-pane__content :deep(img) {
  max-width: 100%;
  border-radius: var(--lume-radius-md);
}

.lume-wysiwyg-pane__bubble-toolbar {
  position: fixed;
  z-index: var(--lume-z-tooltip);
  height: 34px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--lume-border-subtle) 78%, transparent);
  border-radius: 9px;
  background-color: color-mix(in srgb, var(--lume-bg-overlay) 88%, transparent);
  color: var(--lume-text-secondary);
  box-shadow: 0 8px 22px rgb(0 0 0 / 12%), 0 1px 2px rgb(0 0 0 / 10%);
  user-select: none;
  backdrop-filter: blur(20px) saturate(1.35);
}

.lume-wysiwyg-pane__bubble-toolbar button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  cursor: default;
}

.lume-wysiwyg-pane__bubble-toolbar button:hover,
.lume-wysiwyg-pane__bubble-toolbar button:focus-visible {
  outline: none;
  background-color: color-mix(in srgb, var(--lume-text-primary) 8%, transparent);
  color: var(--lume-text-primary);
}

.lume-wysiwyg-pane__bubble-toolbar svg {
  flex: none;
}

.lume-wysiwyg-pane__bubble-separator {
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background-color: color-mix(in srgb, var(--lume-border-subtle) 82%, transparent);
}

.lume-wysiwyg-pane__context-menu {
  position: fixed;
  z-index: var(--lume-z-tooltip);
  width: 192px;
  padding: var(--lume-space-2);
  border: 1px solid var(--lume-border-subtle);
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-overlay);
  color: var(--lume-text-secondary);
  box-shadow: var(--lume-shadow-md);
  user-select: none;
  backdrop-filter: blur(14px);
}

.lume-wysiwyg-pane__context-menu button {
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 var(--lume-space-3);
  border: 0;
  border-radius: var(--lume-radius-sm);
  background: transparent;
  color: inherit;
  font-size: var(--lume-font-size-sm);
  text-align: left;
  cursor: default;
}

.lume-wysiwyg-pane__context-menu button:hover,
.lume-wysiwyg-pane__context-menu button:focus-visible {
  outline: none;
  background-color: color-mix(in srgb, var(--lume-text-primary) 7%, transparent);
  color: var(--lume-text-primary);
}

.lume-wysiwyg-pane__context-separator {
  height: 1px;
  margin: var(--lume-space-2) var(--lume-space-3);
  background-color: var(--lume-border-subtle);
}
</style>