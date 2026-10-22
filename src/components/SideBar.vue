<script setup lang="ts">
/** SideBar - 标签与工作区资源管理器。 */
import { t } from '@/app/i18n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useInterfacePreference } from '@/app/preferences/useInterfacePreference'
import { vLiquidGlass } from '@/ui/glass/directive'
import {
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
  Move,
  X,
} from 'lucide-vue-next'
import { useDocument } from '@composables/useDocument'
import { useFileOps } from '@composables/useFileOps'
import { useWorkspaceCommands } from '@/features/workspace/commands/useWorkspaceCommands'
import type { WorkspaceEntry } from '@/platform/tauri/workspace'

const { activeDocument, activeDocumentId, documents, activateDocument, requestCloseDocument } =
  useDocument()
const { openFile, openFilesFromPaths } = useFileOps()
const {
  workspacePath,
  workspaceEntries,
  expandedPaths,
  workspaceLoading,
  workspaceError,
  workspaceName,
  visibleWorkspaceEntries,
  selectWorkspace,
  closeWorkspace,
  createWorkspaceEntry,
  renameWorkspaceEntry,
  moveWorkspaceEntry,
  deleteWorkspaceEntry,
  toggleDirectory,
} = useWorkspaceCommands()
const contextMenuOpen = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextDirectoryPath = ref<string | null>(null)
const contextEntry = ref<WorkspaceEntry | null>(null)
const createKind = ref<'file' | 'directory' | null>(null)
const createName = ref('')
const createInput = ref<HTMLInputElement | null>(null)
const sidebarRef = ref<HTMLElement | null>(null)
const { interfaceFont, interfaceFontSize } = useInterfacePreference()
const manualWidth = ref<number | null>(null)
const measuredWidth = ref(228)
const viewportWidth = ref(window.innerWidth)
const resizing = ref(false)
const openEditorsExpanded = ref(true)
const workspaceExpanded = ref(true)
let resizeStartX = 0
let resizeStartWidth = 0

const maxWidth = computed(() => Math.max(200, Math.min(420, viewportWidth.value * 0.4)))
const panelWidth = computed(() =>
  Math.max(200, Math.min(manualWidth.value ?? measuredWidth.value, maxWidth.value)),
)

const measureSidebarWidth = () => {
  const rows = sidebarRef.value?.querySelectorAll<HTMLElement>(
    '.lume-sidebar__file, .lume-sidebar__editor-open, .lume-sidebar__workspace-root',
  )
  let width = 228
  rows?.forEach((row) => {
    const style = getComputedStyle(row)
    let contentWidth = 0
    for (const child of row.children) {
      if (child.tagName === 'SPAN') {
        const range = document.createRange()
        range.selectNodeContents(child)
        contentWidth += range.getBoundingClientRect().width
      } else contentWidth += child.getBoundingClientRect().width
    }
    // 包含层级缩进、图标间距、内容区留白和滚动条余量。
    width = Math.max(
      width,
      contentWidth +
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight) +
        (Number.parseFloat(style.columnGap) || 0) * Math.max(0, row.children.length - 1) +
        36,
    )
  })
  measuredWidth.value = Math.min(320, Math.ceil(width))
}

const handleViewportResize = () => {
  viewportWidth.value = window.innerWidth
}

const handleResizeStart = (event: PointerEvent) => {
  if (event.button !== 0 || !event.isPrimary) return
  resizeStartX = event.clientX
  resizeStartWidth = panelWidth.value
  resizing.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}

const handleResizeMove = (event: PointerEvent) => {
  if (!resizing.value) return
  manualWidth.value = Math.max(
    200,
    Math.min(maxWidth.value, resizeStartWidth + event.clientX - resizeStartX),
  )
}

const handleResizeEnd = (event: PointerEvent) => {
  resizing.value = false
  const handle = event.currentTarget as HTMLElement
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
}

const handleResizeKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Home' || event.key === 'Enter') manualWidth.value = null
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    manualWidth.value = Math.max(
      200,
      Math.min(maxWidth.value, panelWidth.value + (event.key === 'ArrowRight' ? 16 : -16)),
    )
  } else return
  event.preventDefault()
}

async function selectFile() {
  await openFile()
}

function handleCloseWorkspace() {
  cancelCreate()
  closeContextMenu()
  closeWorkspace()
}

async function openWorkspaceFile(path: string) {
  const result = await openFilesFromPaths([path])
  workspaceError.value = result.rejected[0]?.message ?? null
}

function getParentPath(path: string) {
  const separatorIndex = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return separatorIndex > 0 ? path.slice(0, separatorIndex) : path
}

function closeContextMenu() {
  contextMenuOpen.value = false
}

function openFileContextMenu(event: MouseEvent, entry?: WorkspaceEntry) {
  event.preventDefault()
  contextDirectoryPath.value = entry
    ? entry.isDirectory
      ? entry.path
      : getParentPath(entry.path)
    : workspacePath.value
  contextEntry.value = entry ?? null
  contextMenuPosition.value = {
    x: Math.min(event.clientX, window.innerWidth - 184),
    y: Math.min(event.clientY, window.innerHeight - (entry ? 204 : 92)),
  }
  contextMenuOpen.value = true
}

async function renameSelectedEntry() {
  const entry = contextEntry.value
  closeContextMenu()
  if (!entry) return
  const name = window.prompt(t('输入新名称'), entry.name)?.trim()
  if (name && name !== entry.name) await renameWorkspaceEntry(entry.path, name)
}

async function moveSelectedEntry() {
  const entry = contextEntry.value
  closeContextMenu()
  if (!entry || !workspacePath.value) return
  const directory = window.prompt(t('输入工作区内的目标目录完整路径'), workspacePath.value)?.trim()
  if (directory) await moveWorkspaceEntry(entry.path, directory)
}

async function deleteSelectedEntry() {
  const entry = contextEntry.value
  closeContextMenu()
  if (!entry || !window.confirm(t('确定删除“{0}”吗？此操作无法撤销。', entry.name))) return
  await deleteWorkspaceEntry(entry.path)
}

async function startCreate(kind: 'file' | 'directory') {
  if (!contextDirectoryPath.value) {
    closeContextMenu()
    await selectWorkspace()
    return
  }
  createKind.value = kind
  createName.value = ''
  closeContextMenu()
  await nextTick()
  createInput.value?.focus()
}

function cancelCreate() {
  createKind.value = null
  createName.value = ''
}

async function confirmCreate() {
  const directory = contextDirectoryPath.value
  let name = createName.value.trim()
  if (!directory || !name || !createKind.value) return
  if (createKind.value === 'file' && !/\.(md|markdown)$/i.test(name)) name += '.md'

  const kind = createKind.value
  const path = await createWorkspaceEntry(directory, name, kind === 'directory')
  if (!path) {
    createInput.value?.focus()
    return
  }
  cancelCreate()
  if (kind === 'file') await openWorkspaceFile(path)
}

watch(
  [
    visibleWorkspaceEntries,
    () => documents.value.map((item) => item.name),
    workspaceName,
    interfaceFont,
    interfaceFontSize,
  ],
  measureSidebarWidth,
  { flush: 'post' },
)

onMounted(() => {
  measureSidebarWidth()
  window.addEventListener('resize', handleViewportResize)
  document.fonts.addEventListener('loadingdone', measureSidebarWidth)
  void document.fonts.ready.then(measureSidebarWidth)
  window.addEventListener('pointerdown', closeContextMenu)
  window.addEventListener('blur', closeContextMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleViewportResize)
  document.fonts.removeEventListener('loadingdone', measureSidebarWidth)
  window.removeEventListener('pointerdown', closeContextMenu)
  window.removeEventListener('blur', closeContextMenu)
})
</script>

<template>
  <aside
    ref="sidebarRef"
    v-liquid-glass
    class="lume-sidebar lume-side-glass"
    :style="{ width: `${panelWidth}px` }"
    :aria-label="t('文件')"
  >
    <div
      class="lume-sidebar__resize"
      :class="{ 'lume-sidebar__resize--active': resizing }"
      role="separator"
      aria-orientation="vertical"
      :aria-label="t('调整文件栏宽度')"
      :aria-valuenow="panelWidth"
      :aria-valuemin="200"
      :aria-valuemax="maxWidth"
      tabindex="0"
      :title="t('拖动调整宽度，双击恢复自适应')"
      @pointerdown="handleResizeStart"
      @pointermove="handleResizeMove"
      @pointerup="handleResizeEnd"
      @pointercancel="handleResizeEnd"
      @lostpointercapture="resizing = false"
      @dblclick="manualWidth = null"
      @keydown="handleResizeKeydown"
    ></div>
    <div class="lume-sidebar__toolbar">
      <span>{{ t('资源管理器') }}</span>
      <div class="lume-sidebar__toolbar-actions">
        <button
          type="button"
          :title="t('打开文件')"
          :aria-label="t('打开文件')"
          @click="selectFile"
        >
          <FileText :size="16" :stroke-width="1.6" />
        </button>
        <button
          type="button"
          :title="t('打开文件夹')"
          :aria-label="t('打开文件夹')"
          @click="selectWorkspace"
        >
          <FolderOpen :size="16" :stroke-width="1.6" />
        </button>
      </div>
    </div>
    <div class="lume-sidebar__content" @contextmenu="openFileContextMenu">
      <section v-if="documents.length > 0" class="lume-sidebar__section" @contextmenu.stop.prevent>
        <button
          class="lume-sidebar__section-heading"
          type="button"
          :aria-expanded="openEditorsExpanded"
          @click="openEditorsExpanded = !openEditorsExpanded"
        >
          <ChevronRight
            class="lume-sidebar__section-chevron"
            :class="{ 'lume-sidebar__section-chevron--expanded': openEditorsExpanded }"
            :size="14"
            :stroke-width="1.7"
          />
          <span>{{ t('标签') }}</span>
        </button>
        <div v-if="openEditorsExpanded" class="lume-sidebar__editor-list">
          <div
            v-for="item in documents"
            :key="item.id"
            class="lume-sidebar__editor-row"
            :class="{ 'lume-sidebar__file--active': item.id === activeDocumentId }"
          >
            <button
              class="lume-sidebar__editor-open"
              type="button"
              :title="item.path ?? item.name"
              @click="activateDocument(item.id)"
            >
              <FileText :size="16" :stroke-width="1.5" />
              <span class="lume-sidebar__file-name">{{ item.name }}</span>
              <span
                v-if="item.isDirty"
                class="lume-sidebar__dirty"
                :aria-label="t('未保存')"
              ></span>
            </button>
            <button
              class="lume-sidebar__editor-close"
              type="button"
              :title="t('关闭 {0}', item.name)"
              :aria-label="t('关闭 {0}', item.name)"
              @click="requestCloseDocument(item.id)"
            >
              <X :size="14" :stroke-width="1.7" />
            </button>
          </div>
        </div>
      </section>

      <div
        v-if="documents.length > 0"
        class="lume-sidebar__workspace-divider"
        aria-hidden="true"
      ></div>
      <template v-if="workspacePath">
        <div class="lume-sidebar__workspace-header" @contextmenu.stop="openFileContextMenu($event)">
          <button
            class="lume-sidebar__workspace-root"
            type="button"
            :title="workspacePath"
            :aria-expanded="workspaceExpanded"
            @click="workspaceExpanded = !workspaceExpanded"
            @contextmenu.stop="openFileContextMenu($event)"
          >
            <ChevronRight
              class="lume-sidebar__section-chevron"
              :class="{ 'lume-sidebar__section-chevron--expanded': workspaceExpanded }"
              :size="14"
              :stroke-width="1.7"
            />
            <FolderOpen :size="16" :stroke-width="1.6" />
            <span>{{ workspaceName }}</span>
          </button>
          <button
            class="lume-sidebar__workspace-close"
            type="button"
            :title="t('关闭工作区')"
            :aria-label="t('关闭工作区')"
            @click="handleCloseWorkspace"
          >
            <X :size="14" :stroke-width="1.7" />
          </button>
        </div>

        <div v-if="workspaceExpanded && workspaceLoading" class="lume-sidebar__placeholder">
          <p>{{ t('正在读取工作区…') }}</p>
        </div>
        <template v-else-if="workspaceExpanded">
          <button
            v-for="entry in visibleWorkspaceEntries"
            :key="entry.path"
            class="lume-sidebar__file"
            :class="{
              'lume-sidebar__file--active':
                !entry.isDirectory && entry.path === activeDocument?.path,
            }"
            :style="{ paddingLeft: `${12 + entry.depth * 14}px` }"
            type="button"
            :title="entry.path"
            @click="entry.isDirectory ? toggleDirectory(entry.path) : openWorkspaceFile(entry.path)"
            @contextmenu.stop="openFileContextMenu($event, entry)"
          >
            <ChevronRight
              v-if="entry.isDirectory"
              class="lume-sidebar__chevron"
              :class="{ 'lume-sidebar__chevron--expanded': expandedPaths.has(entry.path) }"
              :size="14"
              :stroke-width="1.7"
            />
            <Folder v-if="entry.isDirectory" :size="16" :stroke-width="1.5" />
            <FileText v-else :size="16" :stroke-width="1.5" />
            <span class="lume-sidebar__file-name">{{ entry.name }}</span>
          </button>
          <div
            v-if="workspaceEntries.length === 0 && !workspaceError"
            class="lume-sidebar__placeholder"
          >
            <p>{{ t('没有 Markdown 文件') }}</p>
          </div>
        </template>
      </template>

      <button
        v-if="!workspacePath"
        class="lume-sidebar__open-folder"
        type="button"
        :title="t('打开文件夹')"
        :aria-label="t('打开文件夹')"
        @click="selectWorkspace"
      >
        <FolderOpen :size="18" :stroke-width="1.5" aria-hidden="true" />
        <span>{{ t('打开文件夹') }}</span>
      </button>

      <div v-if="workspacePath && workspaceExpanded && createKind" class="lume-sidebar__create-row">
        <FilePlus2 v-if="createKind === 'file'" :size="15" />
        <FolderPlus v-else :size="15" />
        <input
          ref="createInput"
          v-model="createName"
          :placeholder="createKind === 'file' ? t('文件名.md') : t('文件夹名称')"
          @keydown.enter.prevent="confirmCreate"
          @keydown.esc.prevent="cancelCreate"
          @blur="cancelCreate"
        />
        <button
          type="button"
          :title="t('取消')"
          :aria-label="t('取消新建')"
          @mousedown.prevent
          @click="cancelCreate"
        >
          <X :size="13" />
        </button>
      </div>
      <p v-if="workspaceError" class="lume-sidebar__error">{{ workspaceError }}</p>
    </div>
    <Teleport to="body">
      <div
        v-if="contextMenuOpen"
        class="lume-sidebar__context-menu"
        role="menu"
        :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }"
        @pointerdown.stop
        @contextmenu.prevent
      >
        <button type="button" role="menuitem" @click="startCreate('file')">
          <FilePlus2 :size="15" />
          <span>{{ t('新建文件') }}</span>
        </button>
        <button type="button" role="menuitem" @click="startCreate('directory')">
          <FolderPlus :size="15" />
          <span>{{ t('新建文件夹') }}</span>
        </button>
        <template v-if="contextEntry">
          <button type="button" role="menuitem" @click="renameSelectedEntry">
            <Pencil :size="15" /><span>{{ t('重命名') }}</span>
          </button>
          <button type="button" role="menuitem" @click="moveSelectedEntry">
            <Move :size="15" /><span>{{ t('移动到…') }}</span>
          </button>
          <button
            class="lume-sidebar__danger-action"
            type="button"
            role="menuitem"
            @click="deleteSelectedEntry"
          >
            <Trash2 :size="15" /><span>{{ t('删除') }}</span>
          </button>
        </template>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.lume-sidebar {
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--lume-chrome-bg, var(--lume-bg-surface));
  border-right: 0;
  flex-shrink: 0;
  overflow: hidden;
}

.lume-sidebar__resize {
  position: absolute;
  z-index: 2;
  inset: 0 0 0 auto;
  width: 6px;
  cursor: col-resize;
  touch-action: none;
}

.lume-sidebar__resize:hover,
.lume-sidebar__resize:focus-visible,
.lume-sidebar__resize--active {
  background: var(--lume-accent-subtle);
  box-shadow: inset -2px 0 var(--lume-accent-default);
  outline: none;
}

.lume-sidebar__workspace-root:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: -2px;
}

.lume-sidebar__content {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px 14px;
  scrollbar-width: thin;
  scrollbar-color: var(--lume-border-default) transparent;
}

.lume-sidebar__toolbar {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 20px;
  border-bottom: 1px solid var(--lume-panel-border, var(--lume-border-subtle));
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-xs);
  font-weight: var(--lume-font-weight-medium);
}

.lume-sidebar__toolbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.lume-sidebar__toolbar-actions button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--lume-text-secondary);
  cursor: pointer;
}

.lume-sidebar__toolbar-actions button:hover {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-sidebar__toolbar-actions button:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 1px;
}

.lume-sidebar__file,
.lume-sidebar__editor-open,
.lume-sidebar__workspace-root {
  width: 100%;
  min-height: 32px;
  display: flex;
  align-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--lume-text-secondary);
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--lume-transition-fast),
    color var(--lume-transition-fast);
}

.lume-sidebar__file {
  gap: 8px;
  margin: 2px 0;
  padding: 0 10px;
}

.lume-sidebar__section {
  margin-bottom: 8px;
}

.lume-sidebar__workspace-divider {
  margin: 8px 0;
  border-top: 1px solid var(--lume-panel-border, var(--lume-border-subtle));
}

.lume-sidebar__section-heading {
  width: 100%;
  min-height: 30px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--lume-text-secondary);
  text-align: left;
  font-size: var(--lume-font-size-xs);
  font-weight: var(--lume-font-weight-medium);
  cursor: pointer;
}

.lume-sidebar__section-heading:hover {
  color: var(--lume-text-primary);
}

.lume-sidebar__section-heading:focus-visible,
.lume-sidebar__editor-open:focus-visible,
.lume-sidebar__editor-close:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: -2px;
}

.lume-sidebar__section-chevron {
  flex: 0 0 auto;
  color: var(--lume-text-tertiary);
  transition: transform var(--lume-transition-fast);
}

.lume-sidebar__section-chevron--expanded {
  transform: rotate(90deg);
}

.lume-sidebar__editor-list {
  display: flex;
  flex-direction: column;
}

.lume-sidebar__editor-row {
  min-width: 0;
  min-height: 32px;
  display: flex;
  align-items: center;
  border-radius: 6px;
  color: var(--lume-text-secondary);
}

.lume-sidebar__editor-row:hover,
.lume-sidebar__editor-row:focus-within {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-sidebar__editor-row.lume-sidebar__file--active {
  background: var(--lume-accent-subtle);
  color: var(--lume-accent-default);
}

.lume-sidebar__editor-open {
  min-width: 0;
  min-height: 32px;
  flex: 1;
  gap: 8px;
  padding: 0 6px 0 10px;
  border-radius: 6px 0 0 6px;
  color: inherit;
  font: inherit;
}

.lume-sidebar__editor-close {
  width: 26px;
  height: 26px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  margin-right: 3px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--lume-text-tertiary);
  opacity: 0;
  cursor: pointer;
}

.lume-sidebar__editor-row:hover .lume-sidebar__editor-close,
.lume-sidebar__editor-row:focus-within .lume-sidebar__editor-close,
.lume-sidebar__editor-row.lume-sidebar__file--active .lume-sidebar__editor-close {
  opacity: 1;
}

.lume-sidebar__editor-close:hover {
  background: color-mix(in srgb, var(--lume-text-primary) 8%, transparent);
  color: var(--lume-text-primary);
}

.lume-sidebar svg {
  flex-shrink: 0;
}

.lume-sidebar__workspace-root {
  width: 100%;
  min-width: 0;
  flex: 1;
  gap: 8px;
  padding: 0 10px;
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-sm);
  font-weight: var(--lume-font-weight-medium);
}

.lume-sidebar__workspace-header {
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 4px 0 2px;
}

.lume-sidebar__workspace-close {
  width: 28px;
  height: 28px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--lume-text-tertiary);
  cursor: pointer;
}

.lume-sidebar__workspace-close:hover {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-sidebar__workspace-close:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 1px;
}

.lume-sidebar__workspace-root span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lume-sidebar__file:hover,
.lume-sidebar__workspace-root:hover {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-sidebar__file--active {
  background: var(--lume-accent-subtle);
  color: var(--lume-accent-default);
  font-weight: var(--lume-font-weight-medium);
}

.lume-sidebar__file-name {
  overflow: hidden;
  font-size: var(--lume-font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lume-sidebar__file-name {
  min-width: 0;
  flex: 1;
}

.lume-sidebar__dirty {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: var(--lume-radius-full);
  background-color: var(--lume-accent-default);
}

.lume-sidebar__chevron {
  flex-shrink: 0;
  transition: transform var(--lume-transition-fast);
}

.lume-sidebar__chevron--expanded {
  transform: rotate(90deg);
}

.lume-sidebar__file:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: -2px;
}

.lume-sidebar__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--lume-space-8) var(--lume-space-4);
  color: var(--lume-text-tertiary);
}

.lume-sidebar__open-folder {
  display: grid;
  place-items: center;
  gap: 8px;
  margin: 6px auto 0;
  padding: 8px 12px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  cursor: pointer;
}

.lume-sidebar__open-folder:hover {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-sidebar__open-folder:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 1px;
}

.lume-sidebar__create-row {
  height: 34px;
  display: flex;
  align-items: center;
  gap: var(--lume-space-2);
  margin-top: var(--lume-space-2);
  padding: 0 var(--lume-space-2);
  border: 1px solid var(--lume-accent-default);
  border-radius: var(--lume-radius-sm);
  color: var(--lume-accent-default);
}

.lume-sidebar__create-row input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-sm);
}

.lume-sidebar__create-row button {
  display: grid;
  place-items: center;
  padding: 2px;
  border: 0;
  background: transparent;
  color: var(--lume-text-tertiary);
  cursor: pointer;
}

.lume-sidebar__context-menu {
  position: fixed;
  z-index: var(--lume-z-overlay);
  width: 176px;
  padding: var(--lume-space-2);
  border: 1px solid var(--lume-border-subtle);
  border-radius: var(--lume-radius-md);
  background: var(--lume-bg-overlay);
  box-shadow: var(--lume-shadow-md);
  backdrop-filter: blur(14px);
}

.lume-sidebar__context-menu button {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  gap: var(--lume-space-3);
  padding: 0 var(--lume-space-3);
  border: 0;
  border-radius: var(--lume-radius-sm);
  background: transparent;
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  cursor: pointer;
}

.lume-sidebar__context-menu button:hover {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}
.lume-sidebar__context-menu .lume-sidebar__danger-action {
  color: var(--lume-color-danger);
}

.lume-sidebar__error {
  margin: var(--lume-space-3);
  color: var(--lume-danger, #c42b1c);
  font-size: var(--lume-font-size-xs);
  line-height: 1.5;
}
</style>
