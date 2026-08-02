<script setup lang="ts">
/**
 * SideBar - 侧栏
 *
 * 提供文件列表与当前文档大纲，并支持在两种视图间快速切换。
 * 文件工具栏提供新建、打开和保存操作。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronRight, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, X } from 'lucide-vue-next'
import { useDocument } from '@composables/useDocument'
import { useFileOps } from '@composables/useFileOps'
import { isTauri } from '@/platform/tauri/client'
import { createWorkspaceEntry, readWorkspace, selectWorkspaceDirectory, type WorkspaceEntry } from '@/platform/tauri/workspace'

const WORKSPACE_STORAGE_KEY = 'lume-workspace-path'

const { activeDocument, documents } = useDocument()
const { openFile, openFilesFromPaths } = useFileOps()
const activePanel = ref<'files' | 'outline'>('files')
const workspacePath = ref(localStorage.getItem(WORKSPACE_STORAGE_KEY))
const workspaceEntries = ref<WorkspaceEntry[]>([])
const expandedPaths = ref(new Set<string>())
const workspaceLoading = ref(false)
const workspaceError = ref<string | null>(null)
const contextMenuOpen = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextDirectoryPath = ref<string | null>(null)
const createKind = ref<'file' | 'directory' | null>(null)
const createName = ref('')
const createInput = ref<HTMLInputElement | null>(null)

const workspaceName = computed(() =>
  workspacePath.value?.split(/[\\/]/).filter(Boolean).at(-1) ?? '工作区',
)

const standaloneFiles = computed(() => documents.value.filter((item) => {
  if (!item.path) return false
  if (!workspacePath.value) return true
  const root = workspacePath.value.replace(/[\\/]+$/, '').toLocaleLowerCase()
  const path = item.path.toLocaleLowerCase()
  return path !== root && !path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)
}))

const hasFileContent = computed(() => Boolean(workspacePath.value) || standaloneFiles.value.length > 0)

const visibleWorkspaceEntries = computed(() => {
  const visible: Array<WorkspaceEntry & { depth: number }> = []

  function append(entries: WorkspaceEntry[], depth: number) {
    for (const entry of entries) {
      visible.push({ ...entry, depth })
      if (entry.isDirectory && expandedPaths.value.has(entry.path)) {
        append(entry.children, depth + 1)
      }
    }
  }

  append(workspaceEntries.value, 0)
  return visible
})

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return '无法读取工作区'
}

async function loadWorkspace(path: string) {
  workspaceLoading.value = true
  workspaceError.value = null
  try {
    workspaceEntries.value = await readWorkspace(path)
    workspacePath.value = path
    localStorage.setItem(WORKSPACE_STORAGE_KEY, path)
  } catch (error) {
    workspaceEntries.value = []
    workspaceError.value = getErrorMessage(error)
  } finally {
    workspaceLoading.value = false
  }
}

async function selectWorkspace() {
  if (!isTauri()) {
    workspaceError.value = '工作区目录仅在桌面应用中可用'
    return
  }

  const selected = await selectWorkspaceDirectory()
  if (selected) {
    expandedPaths.value = new Set()
    await loadWorkspace(selected)
  }
}

async function selectFile() {
  await openFile()
}

function toggleDirectory(path: string) {
  const next = new Set(expandedPaths.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expandedPaths.value = next
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
    ? entry.isDirectory ? entry.path : getParentPath(entry.path)
    : workspacePath.value
  contextMenuPosition.value = {
    x: Math.min(event.clientX, window.innerWidth - 184),
    y: Math.min(event.clientY, window.innerHeight - 92),
  }
  contextMenuOpen.value = true
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

  try {
    const path = await createWorkspaceEntry(directory, name, createKind.value === 'directory')
    const kind = createKind.value
    cancelCreate()
    if (workspacePath.value) await loadWorkspace(workspacePath.value)
    if (directory !== workspacePath.value) {
      expandedPaths.value = new Set(expandedPaths.value).add(directory)
    }
    if (kind === 'file') await openWorkspaceFile(path)
  } catch (error) {
    workspaceError.value = getErrorMessage(error)
    createInput.value?.focus()
  }
}

/** 从当前 Markdown 中提取 ATX 标题，忽略代码块内的井号。 */
const outlineItems = computed(() => {
  const items: Array<{ level: number; text: string; index: number }> = []
  let inFence = false

  for (const line of activeDocument.value?.content.split('\n') ?? []) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) continue
    items.push({
      level: match[1].length,
      text: match[2].trim(),
      index: items.length,
    })
  }

  return items
})

/** 优先定位渲染后的标题；源码模式下回退到对应文本行。 */
function navigateToHeading(index: number) {
  const renderedHeadings = document.querySelectorAll<HTMLElement>(
    '.lume-wysiwyg-pane__content .ProseMirror h1, .lume-wysiwyg-pane__content .ProseMirror h2, .lume-wysiwyg-pane__content .ProseMirror h3, .lume-wysiwyg-pane__content .ProseMirror h4, .lume-wysiwyg-pane__content .ProseMirror h5, .lume-wysiwyg-pane__content .ProseMirror h6, .lume-preview-pane__content h1, .lume-preview-pane__content h2, .lume-preview-pane__content h3, .lume-preview-pane__content h4, .lume-preview-pane__content h5, .lume-preview-pane__content h6',
  )
  const heading = renderedHeadings[index]
  if (heading) {
    heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }

  const target = outlineItems.value[index]
  const textarea = document.querySelector<HTMLTextAreaElement>('.lume-editor-pane__textarea')
  if (!target || !textarea) return
  const lineIndex = textarea.value.split('\n').findIndex((line) =>
    line.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\s*#*\s*$/, '').trim() === target.text,
  )
  if (lineIndex < 0) return

  const position = textarea.value.split('\n').slice(0, lineIndex).reduce((total, line) => total + line.length + 1, 0)
  textarea.focus()
  textarea.setSelectionRange(position, position)
  textarea.scrollTop = Math.max(0, lineIndex * 28.8 - textarea.clientHeight / 3)
}

onMounted(() => {
  if (workspacePath.value && isTauri()) void loadWorkspace(workspacePath.value)
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
   <div class="lume-sidebar__tabs" role="tablist" aria-label="侧边栏视图">
      <button class="lume-sidebar__tab" :class="{ 'lume-sidebar__tab--active': activePanel === 'files' }" type="button"
        role="tab" :aria-selected="activePanel === 'files'" @click="activePanel = 'files'">
        文件
      </button>
      <button class="lume-sidebar__tab" :class="{ 'lume-sidebar__tab--active': activePanel === 'outline' }"
        type="button" role="tab" :aria-selected="activePanel === 'outline'" @click="activePanel = 'outline'">
        大纲
      </button>
    </div>

    <template v-if="activePanel === 'files'">
      <div class="lume-sidebar__content" role="tabpanel" @contextmenu="openFileContextMenu">
        <template v-if="workspacePath">
          <button class="lume-sidebar__workspace-root" type="button" :title="workspacePath" @click="selectWorkspace"
            @contextmenu.stop="openFileContextMenu($event)">
            <FolderOpen :size="16" :stroke-width="1.6" />
            <span>{{ workspaceName }}</span>
          </button>

        <div v-if="workspaceLoading" class="lume-sidebar__placeholder">
            <p>正在读取工作区…</p>
          </div>
          <template v-else>
            <button v-for="entry in visibleWorkspaceEntries" :key="entry.path" class="lume-sidebar__file"
              :class="{ 'lume-sidebar__file--active': !entry.isDirectory && entry.path === activeDocument?.path }"
              :style="{ paddingLeft: `${12 + entry.depth * 14}px` }" type="button" :title="entry.path"
              @click="entry.isDirectory ? toggleDirectory(entry.path) : openWorkspaceFile(entry.path)"
              @contextmenu.stop="openFileContextMenu($event, entry)">
              <ChevronRight v-if="entry.isDirectory" class="lume-sidebar__chevron"
                :class="{ 'lume-sidebar__chevron--expanded': expandedPaths.has(entry.path) }" :size="14"
                :stroke-width="1.7" />
              <Folder v-if="entry.isDirectory" :size="16" :stroke-width="1.5" />
              <FileText v-else :size="16" :stroke-width="1.5" />
              <span class="lume-sidebar__file-name">{{ entry.name }}</span>
            </button>
           <div v-if="workspaceEntries.length === 0 && !workspaceError" class="lume-sidebar__placeholder">
              <p>没有 Markdown 文件</p>
            </div>
          </template>
        </template>

      <section v-if="standaloneFiles.length > 0" class="lume-sidebar__standalone">
          <div class="lume-sidebar__section-label">单独打开</div>
          <button v-for="item in standaloneFiles" :key="item.path!" class="lume-sidebar__file"
            :class="{ 'lume-sidebar__file--active': item.path === activeDocument?.path }" type="button"
            :title="item.path!" @click="openWorkspaceFile(item.path!)">
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
          <input ref="createInput" v-model="createName" :placeholder="createKind === 'file' ? '文件名.md' : '文件夹名称'"
            @keydown.enter.prevent="confirmCreate" @keydown.esc.prevent="cancelCreate" @blur="cancelCreate" />
          <button type="button" title="取消" aria-label="取消新建" @mousedown.prevent @click="cancelCreate">
            <X :size="13" />
          </button>
        </div>
        <p v-if="workspaceError" class="lume-sidebar__error">{{ workspaceError }}</p>
     </div>
   </template>

  <div v-else class="lume-sidebar__content lume-sidebar__content--outline" role="tabpanel" @contextmenu.prevent>
      <button v-for="item in outlineItems" :key="`${item.index}-${item.text}`" class="lume-sidebar__outline-item"
        :style="{ paddingLeft: `${12 + (item.level - 1) * 14}px` }" type="button" :title="item.text"
        @click="navigateToHeading(item.index)">
        {{ item.text }}
      </button>
      <div v-if="outlineItems.length === 0" class="lume-sidebar__placeholder">
        <p>暂无大纲</p>
        <p class="lume-sidebar__hint">添加 Markdown 标题后将在这里显示</p>
      </div>
    </div>

  <Teleport to="body">
      <div v-if="contextMenuOpen" class="lume-sidebar__context-menu" role="menu"
        :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }" @pointerdown.stop
        @contextmenu.prevent>
        <button type="button" role="menuitem" @click="startCreate('file')">
          <FilePlus2 :size="15" />
          <span>新建文件</span>
        </button>
        <button type="button" role="menuitem" @click="startCreate('directory')">
          <FolderPlus :size="15" />
          <span>新建文件夹</span>
        </button>
      </div>
   </Teleport>
  </aside>
</template>

<style scoped>
.lume-sidebar {
  width: var(--lume-sidebar-width);
  display: flex;
  flex-direction: column;
  background-color: var(--lume-bg-surface);
  border-right: 1px solid var(--lume-border-subtle);
  flex-shrink: 0;
  overflow: hidden;
}

.lume-sidebar__tabs {
  height: 44px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--lume-border-subtle);
}

.lume-sidebar__tab {
  position: relative;
  flex: 1;
  align-self: stretch;
  border: 0;
  background: transparent;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-sm);
    cursor: pointer;
}

.lume-sidebar__tab::after {
  position: absolute;
  right: var(--lume-space-5);
  bottom: -1px;
  left: var(--lume-space-5);
  height: 2px;
  border-radius: var(--lume-radius-full);
  background: transparent;
  content: '';
}

.lume-sidebar__tab:hover,
.lume-sidebar__tab--active {
  color: var(--lume-text-primary);
}

.lume-sidebar__tab--active {
  font-weight: var(--lume-font-weight-semibold);
}

.lume-sidebar__tab--active::after {
  background: var(--lume-accent-default);
}

.lume-sidebar__tab:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: -2px;
}

.lume-sidebar__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--lume-space-2);
}

.lume-sidebar__content--outline {
  padding-top: var(--lume-space-3);
}

.lume-sidebar__file,
.lume-sidebar__outline-item,
.lume-sidebar__workspace-root {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  border: 0;
  border-radius: var(--lume-radius-sm);
  background: transparent;
    color: var(--lume-text-secondary);
    text-align: left;
  cursor: pointer;
}

.lume-sidebar__file {
  gap: var(--lume-space-2);
  padding: 0 var(--lume-space-3);
}

.lume-sidebar__workspace-root {
  gap: var(--lume-space-2);
  margin-bottom: var(--lume-space-1);
  padding: 0 var(--lume-space-3);
  color: var(--lume-text-primary);
  font-weight: var(--lume-font-weight-semibold);
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
}

.lume-sidebar__file-name,
.lume-sidebar__outline-item {
  overflow: hidden;
  font-size: var(--lume-font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lume-sidebar__file-name {
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
  margin-top: var(--lume-space-3);
  padding-top: var(--lume-space-3);
  border-top: 1px solid var(--lume-border-subtle);
}

.lume-sidebar__section-label {
  padding: 0 var(--lume-space-3) var(--lume-space-2);
  color: var(--lume-text-tertiary);
  font-size: 10px;
  font-weight: var(--lume-font-weight-semibold);
  letter-spacing: 0.6px;
  text-transform: uppercase;
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
    transition: background-color var(--lume-transition-fast), color var(--lume-transition-fast);
  }
  
  .lume-sidebar__primary-action {
    border: 1px solid var(--lume-accent-default);
    background: var(--lume-accent-default);
    color: var(--lume-text-on-accent, #fff);
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