<script setup lang="ts">
/**
 * SideBar - 侧栏
 *
 * 提供文件列表与当前文档大纲，并支持在两种视图间快速切换。
 * 提供命令搜索入口和工作区文件操作。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  ListTree,
  Pencil,
  Plus,
  Search,
  Trash2,
  Move,
  X,
} from 'lucide-vue-next'
import { useDocument } from '@composables/useDocument'
import { useFileOps } from '@composables/useFileOps'
import { useDocumentOutline } from '@/features/editor/composables/useDocumentOutline'
import { useWorkspaceCommands } from '@/features/workspace/commands/useWorkspaceCommands'
import type { WorkspaceEntry } from '@/platform/tauri/workspace'

const emit = defineEmits<{
  'open-command-palette': []
}>()

const { activeDocument, documents } = useDocument()
const { openFile, openFilesFromPaths } = useFileOps()
const { outlineItems, navigateToHeading } = useDocumentOutline()
const {
  workspacePath,
  workspaceEntries,
  expandedPaths,
  workspaceLoading,
  workspaceError,
  workspaceName,
  visibleWorkspaceEntries,
  selectWorkspace,
  createWorkspaceEntry,
  renameWorkspaceEntry,
  moveWorkspaceEntry,
  deleteWorkspaceEntry,
  toggleDirectory,
  containsPath,
} = useWorkspaceCommands()
const activePanel = ref<'files' | 'outline'>('files')
const contextMenuOpen = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextDirectoryPath = ref<string | null>(null)
const contextEntry = ref<WorkspaceEntry | null>(null)
const createKind = ref<'file' | 'directory' | null>(null)
const createName = ref('')
const createInput = ref<HTMLInputElement | null>(null)

const standaloneFiles = computed(() =>
  documents.value.filter((item) => {
    if (!item.path) return false
    return !containsPath(item.path)
  }),
)

const hasFileContent = computed(
  () => Boolean(workspacePath.value) || standaloneFiles.value.length > 0,
)

async function selectFile() {
  await openFile()
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
  const name = window.prompt('输入新名称', entry.name)?.trim()
  if (name && name !== entry.name) await renameWorkspaceEntry(entry.path, name)
}

async function moveSelectedEntry() {
  const entry = contextEntry.value
  closeContextMenu()
  if (!entry || !workspacePath.value) return
  const directory = window.prompt('输入工作区内的目标目录完整路径', workspacePath.value)?.trim()
  if (directory) await moveWorkspaceEntry(entry.path, directory)
}

async function deleteSelectedEntry() {
  const entry = contextEntry.value
  closeContextMenu()
  if (!entry || !window.confirm(`确定删除“${entry.name}”吗？此操作无法撤销。`)) return
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

const handleCreateWorkspaceFile = () => {
  contextDirectoryPath.value = workspacePath.value
  void startCreate('file')
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

onMounted(() => {
  window.addEventListener('pointerdown', closeContextMenu)
  window.addEventListener('blur', closeContextMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', closeContextMenu)
  window.removeEventListener('blur', closeContextMenu)
})
</script>

<template>
  <aside class="lume-sidebar">
    <div class="lume-sidebar__search-area">
      <button
        class="lume-sidebar__search"
        type="button"
        title="搜索命令或动作 (Ctrl+P)"
        aria-label="搜索命令或动作，Ctrl+P"
        @click="emit('open-command-palette')"
      >
        <Search :size="15" :stroke-width="1.7" />
        <span>搜索命令或动作…</span>
        <kbd>Ctrl+P</kbd>
      </button>
    </div>

    <div class="lume-sidebar__tabs" role="tablist" aria-label="侧边栏视图">
      <button
        class="lume-sidebar__tab"
        :class="{ 'lume-sidebar__tab--active': activePanel === 'files' }"
        type="button"
        role="tab"
        :aria-selected="activePanel === 'files'"
        @click="activePanel = 'files'"
      >
        <FileText :size="15" :stroke-width="1.6" />
        文件
      </button>
      <button
        class="lume-sidebar__tab"
        :class="{ 'lume-sidebar__tab--active': activePanel === 'outline' }"
        type="button"
        role="tab"
        :aria-selected="activePanel === 'outline'"
        @click="activePanel = 'outline'"
      >
        <ListTree :size="15" :stroke-width="1.6" />
        大纲
      </button>
    </div>

    <template v-if="activePanel === 'files'">
      <div class="lume-sidebar__content" role="tabpanel" @contextmenu="openFileContextMenu">
        <template v-if="workspacePath">
          <div class="lume-sidebar__section-heading">
            <span class="lume-sidebar__section-label">工作区</span>
            <button
              class="lume-sidebar__section-action"
              type="button"
              title="新建文件"
              aria-label="在工作区新建文件"
              @click="handleCreateWorkspaceFile"
            >
              <Plus :size="15" :stroke-width="1.6" />
            </button>
          </div>
          <button
            class="lume-sidebar__workspace-root"
            type="button"
            :title="workspacePath"
            @click="selectWorkspace"
            @contextmenu.stop="openFileContextMenu($event)"
          >
            <FolderOpen :size="16" :stroke-width="1.6" />
            <span>{{ workspaceName }}</span>
          </button>

          <div v-if="workspaceLoading" class="lume-sidebar__placeholder">
            <p>正在读取工作区…</p>
          </div>
          <template v-else>
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
              @click="
                entry.isDirectory ? toggleDirectory(entry.path) : openWorkspaceFile(entry.path)
              "
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
              <p>没有 Markdown 文件</p>
            </div>
          </template>
        </template>

        <section v-if="standaloneFiles.length > 0" class="lume-sidebar__standalone">
          <div class="lume-sidebar__section-label">单独打开</div>
          <button
            v-for="item in standaloneFiles"
            :key="item.path!"
            class="lume-sidebar__file"
            :class="{ 'lume-sidebar__file--active': item.path === activeDocument?.path }"
            type="button"
            :title="item.path!"
            @click="openWorkspaceFile(item.path!)"
          >
            <FileText :size="16" :stroke-width="1.5" />
            <span class="lume-sidebar__file-name">{{ item.name }}</span>
            <span v-if="item.isDirty" class="lume-sidebar__dirty" aria-label="未保存">●</span>
          </button>
        </section>

        <div v-if="!hasFileContent" class="lume-sidebar__empty-state">
          <strong>打开文稿</strong>
          <p>打开文件或文件夹</p>
          <div class="lume-sidebar__empty-actions">
            <button class="lume-sidebar__primary-action" type="button" @click="selectFile">
              <FileText :size="15" />
              打开文件
            </button>
            <button class="lume-sidebar__secondary-action" type="button" @click="selectWorkspace">
              <FolderOpen :size="15" />
              打开文件夹
            </button>
          </div>
        </div>

        <div v-if="createKind" class="lume-sidebar__create-row">
          <FilePlus2 v-if="createKind === 'file'" :size="15" />
          <FolderPlus v-else :size="15" />
          <input
            ref="createInput"
            v-model="createName"
            :placeholder="createKind === 'file' ? '文件名.md' : '文件夹名称'"
            @keydown.enter.prevent="confirmCreate"
            @keydown.esc.prevent="cancelCreate"
            @blur="cancelCreate"
          />
          <button
            type="button"
            title="取消"
            aria-label="取消新建"
            @mousedown.prevent
            @click="cancelCreate"
          >
            <X :size="13" />
          </button>
        </div>
        <p v-if="workspaceError" class="lume-sidebar__error">{{ workspaceError }}</p>
      </div>
    </template>

    <div
      v-else
      class="lume-sidebar__content lume-sidebar__content--outline"
      role="tabpanel"
      @contextmenu.prevent
    >
      <button
        v-for="item in outlineItems"
        :key="`${item.index}-${item.text}`"
        class="lume-sidebar__outline-item"
        :style="{ paddingLeft: `${12 + (item.level - 1) * 14}px` }"
        type="button"
        :title="item.text"
        @click="navigateToHeading(item.index)"
      >
        {{ item.text }}
      </button>
      <div v-if="outlineItems.length === 0" class="lume-sidebar__placeholder">
        <p>暂无大纲</p>
        <p class="lume-sidebar__hint">添加 Markdown 标题后将在这里显示</p>
      </div>
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
          <span>新建文件</span>
        </button>
        <button type="button" role="menuitem" @click="startCreate('directory')">
          <FolderPlus :size="15" />
          <span>新建文件夹</span>
        </button>
        <template v-if="contextEntry">
          <button type="button" role="menuitem" @click="renameSelectedEntry">
            <Pencil :size="15" /><span>重命名</span>
          </button>
          <button type="button" role="menuitem" @click="moveSelectedEntry">
            <Move :size="15" /><span>移动到…</span>
          </button>
          <button
            class="lume-sidebar__danger-action"
            type="button"
            role="menuitem"
            @click="deleteSelectedEntry"
          >
            <Trash2 :size="15" /><span>删除</span>
          </button>
        </template>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.lume-sidebar {
  width: var(--lume-sidebar-width);
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--lume-chrome-bg, var(--lume-bg-surface));
  border-right: 1px solid var(--lume-panel-border, var(--lume-border-subtle));
  flex-shrink: 0;
  overflow: hidden;
}

.lume-sidebar__search-area {
  padding: 18px 12px 14px;
}

.lume-sidebar__search {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border: 1px solid var(--lume-panel-border, var(--lume-border-subtle));
  border-radius: 7px;
  background: color-mix(in srgb, var(--lume-pane-bg, var(--lume-bg-surface)) 60%, transparent);
  color: var(--lume-text-tertiary);
  cursor: pointer;
  transition:
    border-color var(--lume-transition-fast),
    background-color var(--lume-transition-fast);
}

.lume-sidebar__search span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 11px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lume-sidebar__search kbd {
  flex-shrink: 0;
  font-family: var(--lume-font-sans);
  font-size: 10px;
  white-space: nowrap;
}

.lume-sidebar__search:hover {
  border-color: var(--lume-border-default);
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
}

.lume-sidebar__tabs {
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 12px 18px;
  padding: 3px;
  border: 1px solid var(--lume-panel-border, var(--lume-border-subtle));
  border-radius: 8px;
  background: color-mix(in srgb, var(--lume-pane-bg, var(--lume-bg-surface)) 35%, transparent);
}

.lume-sidebar__tab {
  min-width: 0;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: 1;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--lume-text-tertiary);
  font-size: 12px;
  cursor: pointer;
  transition:
    background-color var(--lume-transition-fast),
    color var(--lume-transition-fast);
}

.lume-sidebar__tab:hover {
  color: var(--lume-text-primary);
}

.lume-sidebar__tab--active {
  background: var(--lume-pane-bg, var(--lume-bg-surface));
  color: var(--lume-text-primary);
  box-shadow: var(--lume-shadow-xs);
  font-weight: var(--lume-font-weight-medium);
}

.lume-sidebar__tab:focus-visible,
.lume-sidebar__search:focus-visible,
.lume-sidebar__workspace-root:focus-visible,
.lume-sidebar__section-action:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: -2px;
}

.lume-sidebar__content {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 14px;
  scrollbar-width: thin;
  scrollbar-color: var(--lume-border-default) transparent;
}

.lume-sidebar__content--outline {
  padding-top: 2px;
}

.lume-sidebar__file,
.lume-sidebar__outline-item,
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

.lume-sidebar svg {
  flex-shrink: 0;
}

.lume-sidebar__workspace-root {
  gap: 8px;
  margin-bottom: 5px;
  padding: 0 10px;
  color: var(--lume-text-primary);
  font-size: 12px;
  font-weight: var(--lume-font-weight-medium);
}

.lume-sidebar__workspace-root span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lume-sidebar__file:hover,
.lume-sidebar__workspace-root:hover,
.lume-sidebar__outline-item:hover {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-sidebar__file--active {
  background: var(--lume-accent-subtle);
  color: var(--lume-accent-default);
  font-weight: var(--lume-font-weight-medium);
}

.lume-sidebar__file-name,
.lume-sidebar__outline-item {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lume-sidebar__file-name {
  min-width: 0;
  flex: 1;
}

.lume-sidebar__dirty {
  color: var(--lume-accent-default);
  font-size: 9px;
}

.lume-sidebar__chevron {
  flex-shrink: 0;
  transition: transform var(--lume-transition-fast);
}

.lume-sidebar__chevron--expanded {
  transform: rotate(90deg);
}

.lume-sidebar__outline-item:focus-visible,
.lume-sidebar__file:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: -2px;
}

.lume-sidebar__placeholder,
.lume-sidebar__empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--lume-space-8) var(--lume-space-4);
  color: var(--lume-text-tertiary);
}

.lume-sidebar__standalone {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--lume-panel-border, var(--lume-border-subtle));
}

.lume-sidebar__section-heading {
  min-height: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  padding-right: 3px;
}

.lume-sidebar__section-label {
  padding: 0 10px 6px;
  color: var(--lume-text-tertiary);
  font-size: 11px;
  font-weight: var(--lume-font-weight-medium);
}

.lume-sidebar__section-heading .lume-sidebar__section-label {
  padding-bottom: 0;
}

.lume-sidebar__section-action {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--lume-text-tertiary);
  cursor: pointer;
}

.lume-sidebar__section-action:hover {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-sidebar__empty-state {
  min-height: 220px;
  justify-content: flex-start;
  padding: 40px var(--lume-space-5) var(--lume-space-6);
}

.lume-sidebar__empty-state strong {
  color: var(--lume-text-primary);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.15px;
}

.lume-sidebar__empty-state p {
  max-width: 205px;
  margin-top: 6px;
  font-size: var(--lume-font-size-xs);
  line-height: 1.55;
}

.lume-sidebar__empty-actions {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 22px;
}

.lume-sidebar__primary-action,
.lume-sidebar__secondary-action {
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 7px;
  font-size: var(--lume-font-size-xs);
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--lume-transition-fast),
    color var(--lume-transition-fast);
}

.lume-sidebar__primary-action {
  border: 1px solid var(--lume-accent-default);
  background: var(--lume-accent-default);
  color: var(--lume-accent-contrast);
}

.lume-sidebar__primary-action:hover {
  border-color: var(--lume-accent-hover);
  background: var(--lume-accent-hover);
}

.lume-sidebar__secondary-action {
  border: 1px solid var(--lume-border-subtle);
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
}

.lume-sidebar__secondary-action:hover {
  background: color-mix(in srgb, var(--lume-text-primary) 6%, var(--lume-bg-surface));
  color: var(--lume-text-primary);
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

.lume-sidebar__hint {
  font-size: var(--lume-font-size-xs);
  margin-top: var(--lume-space-2);
  color: var(--lume-text-tertiary);
}
</style>
