<script setup lang="ts">
/**
 * App.vue - 应用根组件
 *
 * 组合应用壳的五大区域：标题栏、侧栏、编辑区、状态栏。
 * 默认采用所见即所得（WYSIWYG）模式，用户直接在渲染结果上编辑。
 */
import TitleBar from '@components/TitleBar.vue'
import DocumentTabs from '@components/DocumentTabs.vue'
import SideBar from '@components/SideBar.vue'
import EditorPane from '@components/EditorPane.vue'
import PreviewPane from '@components/PreviewPane.vue'
import WysiwygPane from '@components/WysiwygPane.vue'
import StatusBar from '@components/StatusBar.vue'
import SettingsDialog from '@components/SettingsDialog.vue'
import UnsavedChangesDialog from '@components/UnsavedChangesDialog.vue'
import FileDropMessage from '@components/FileDropMessage.vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDocument } from '@composables/useDocument'
import { useFileOps } from '@composables/useFileOps'
import {
  closeWindow,
  getWindowState,
  onFileDragDrop,
  onWindowResized,
  restoreWindowState,
  showWindow,
  startupFilePaths,
  type FileDragDropEvent,
  type WindowState,
} from './types/tauri'

/** 工作模式：所见即所得 | 分栏（源码+预览） */
type ViewMode = 'wysiwyg' | 'split'
type ThemePreference = 'system' | 'light' | 'dark' | 'glass'
type ResolvedTheme = 'light' | 'dark' | 'glass'

const THEME_STORAGE_KEY = 'lume-theme'
const WINDOW_STATE_STORAGE_KEY = 'lume-window-state'
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'])

/** 读取已保存的主题偏好，无有效记录时跟随系统。 */
function getInitialTheme(): ThemePreference {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  return savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'glass' || savedTheme === 'system'
    ? savedTheme
    : 'system'
}

const viewMode = ref<ViewMode>('wysiwyg')
const sidebarVisible = ref(false)
const settingsOpen = ref(false)
const fileDragPaths = ref<string[]>([])
const fileDropMessage = ref<string | null>(null)
const themePreference = ref<ThemePreference>(getInitialTheme())
const resolvedTheme = ref<ResolvedTheme>('light')
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
const { newFile, openFile, openFilesFromPaths, saveFile } = useFileOps()
const {
  activeDocument,
  activeDocumentId,
  cancelCloseDocument,
  confirmCloseDocument,
  documents,
  pendingCloseDocument,
  persistDocumentSession,
  requestCloseDocument,
} = useDocument()
let sessionPersistTimer: ReturnType<typeof setTimeout> | null = null
let unlistenWindowResized: (() => void) | null = null
let unlistenFileDragDrop: (() => void) | null = null
let fileDropMessageTimer: ReturnType<typeof setTimeout> | null = null
let fileDropQueue = Promise.resolve()

/** 将主题偏好解析为实际主题并应用到根元素。 */
function applyTheme() {
  resolvedTheme.value = themePreference.value === 'system'
    ? systemTheme.matches ? 'dark' : 'light'
    : themePreference.value
  document.documentElement.dataset.theme = resolvedTheme.value
}

function handleSystemThemeChange() {
  if (themePreference.value === 'system') applyTheme()
}

function openSettings() {
  settingsOpen.value = true
}

function toggleSidebar() {
  sidebarVisible.value = !sidebarVisible.value
}

function isValidWindowState(value: unknown): value is WindowState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<WindowState>
  return typeof state.width === 'number'
    && typeof state.height === 'number'
    && typeof state.maximized === 'boolean'
    && state.width >= 720
    && state.height >= 480
}

function getSavedWindowState(): WindowState | null {
  const savedState = localStorage.getItem(WINDOW_STATE_STORAGE_KEY)
  if (!savedState) return null

  try {
    const parsedState = JSON.parse(savedState)
    return isValidWindowState(parsedState) ? parsedState : null
  } catch {
    return null
  }
}

function saveWindowState(state: WindowState) {
  localStorage.setItem(WINDOW_STATE_STORAGE_KEY, JSON.stringify(state))
}

async function persistWindowState() {
  const state = await getWindowState()
  if (state) saveWindowState(state)
}

/** 延迟更新会话暂存，避免编辑时频繁写入本地存储。 */
function scheduleSessionPersist() {
  if (sessionPersistTimer) clearTimeout(sessionPersistTimer)
  sessionPersistTimer = setTimeout(() => {
    persistDocumentSession()
    sessionPersistTimer = null
  }, 300)
}

/** 关闭应用前同步暂存，确保最后一次输入也能恢复。 */
async function handleCloseWindow() {
  if (sessionPersistTimer) clearTimeout(sessionPersistTimer)
  persistDocumentSession()
  await persistWindowState()
  await closeWindow()
}

function handleBeforeUnload() {
  persistDocumentSession()
  void persistWindowState()
}

function dismissFileDropMessage() {
  if (fileDropMessageTimer) clearTimeout(fileDropMessageTimer)
  fileDropMessageTimer = null
  fileDropMessage.value = null
}

function showFileDropMessage(message: string) {
  dismissFileDropMessage()
  fileDropMessage.value = message
  fileDropMessageTimer = setTimeout(dismissFileDropMessage, 6000)
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error || '未知错误')
}

async function saveCurrentFile() {
  try {
    await saveFile()
  } catch (error) {
    showFileDropMessage(`保存失败：${getErrorMessage(error)}`)
  }
}

async function handleDroppedFiles(paths: string[]) {
  const result = await openFilesFromPaths(paths)
  if (result.rejected.length > 0) {
    const prefix = result.opened > 0 ? `已打开 ${result.opened} 个文件；` : ''
    const firstError = result.rejected[0].message
    const remaining = result.rejected.length > 1
      ? `，另有 ${result.rejected.length - 1} 个文件未打开`
      : ''
    showFileDropMessage(`${prefix}${firstError}${remaining}`)
  }
}

function queueDroppedFiles(paths: string[]) {
  fileDragPaths.value = []
  fileDropQueue = fileDropQueue
    .then(() => handleDroppedFiles(paths))
    .catch(() => showFileDropMessage('打开拖入文件失败'))
}

function isImagePath(path: string) {
  const extension = path.split('.').at(-1)?.toLowerCase()
  return extension ? IMAGE_EXTENSIONS.has(extension) : false
}

function getDropPoint(position: { x: number; y: number }) {
  const scale = window.devicePixelRatio || 1
  return { x: position.x / scale, y: position.y / scale }
}

function handleFileDragDrop(event: FileDragDropEvent) {
  if (event.type === 'enter') {
    dismissFileDropMessage()
    fileDragPaths.value = event.paths
    return
  }
  if (event.type === 'drop') {
    const point = getDropPoint(event.position)
    const editorBounds = document.querySelector('.lume-wysiwyg-pane')?.getBoundingClientRect()
    const droppedInEditor = viewMode.value === 'wysiwyg'
      && editorBounds
      && point.x >= editorBounds.left
      && point.x <= editorBounds.right
      && point.y >= editorBounds.top
      && point.y <= editorBounds.bottom
    const imagePaths = droppedInEditor ? event.paths.filter(isImagePath) : []
    const otherPaths = event.paths.filter((path) => !imagePaths.includes(path))

    fileDragPaths.value = []
    if (imagePaths.length > 0) {
      window.dispatchEvent(new CustomEvent('lume:image-drop', {
        detail: { paths: imagePaths, x: point.x, y: point.y },
      }))
    }
    if (otherPaths.length > 0) queueDroppedFiles(otherPaths)
    return
  }
  if (event.type === 'leave') fileDragPaths.value = []
}

/** 关闭当前标签，未保存时先向用户确认。 */
function closeActiveDocument() {
  const document = activeDocument.value
  if (!document) return
  requestCloseDocument(document.id)
}

/** 桌面编辑器常用文件快捷键。 */
function handleShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return

  const key = event.key.toLowerCase()
  if (key === ',') {
    event.preventDefault()
    openSettings()
    return
  }
  if (!['n', 'o', 's', 't', 'w'].includes(key)) return
  event.preventDefault()

  if (key === 'n' || key === 't') newFile()
  if (key === 'o') void openFile()
  if (key === 's') void saveCurrentFile()
  if (key === 'w') closeActiveDocument()
}

watch(themePreference, (theme) => {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyTheme()
}, { immediate: true })

watch([documents, activeDocumentId], scheduleSessionPersist, { deep: true })

onMounted(async () => {
  try {
    const savedWindowState = getSavedWindowState()
    if (savedWindowState) await restoreWindowState(savedWindowState)
  } finally {
    await showWindow()
  }

  unlistenWindowResized = await onWindowResized(saveWindowState).catch(() => null)
  unlistenFileDragDrop = await onFileDragDrop(handleFileDragDrop).catch(() => null)
  if ('__TAURI_INTERNALS__' in window) {
    const startupPaths = await startupFilePaths().catch(() => [])
    if (startupPaths.length > 0) await handleDroppedFiles(startupPaths)
  }
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('beforeunload', handleBeforeUnload)
  systemTheme.addEventListener('change', handleSystemThemeChange)
})

onBeforeUnmount(() => {
  if (sessionPersistTimer) clearTimeout(sessionPersistTimer)
  unlistenWindowResized?.()
  unlistenFileDragDrop?.()
  dismissFileDropMessage()
  persistDocumentSession()
  void persistWindowState()
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  systemTheme.removeEventListener('change', handleSystemThemeChange)
})
</script>

<template>
  <div class="lume-app">
   <TitleBar :theme="resolvedTheme" @open-settings="openSettings" @close-window="handleCloseWindow" />

    <div class="lume-app__body">
      <SideBar v-if="sidebarVisible" />

    <div class="lume-app__workspace">
        <DocumentTabs :file-drop-paths="fileDragPaths" />
      <main class="lume-app__main">
          <WysiwygPane v-if="viewMode === 'wysiwyg'" :key="activeDocumentId" />
          <template v-else>
            <EditorPane />
            <PreviewPane />
          </template>
        </main>
      </div>
   </div>

  <StatusBar :sidebar-visible="sidebarVisible" @toggle-sidebar="toggleSidebar" />
    <SettingsDialog :open="settingsOpen" :view-mode="viewMode" :theme="themePreference" @close="settingsOpen = false"
      @update:view-mode="viewMode = $event" @update:theme="themePreference = $event" />
    <UnsavedChangesDialog v-if="pendingCloseDocument" :file-name="pendingCloseDocument.name"
      @cancel="cancelCloseDocument" @confirm="confirmCloseDocument" />
    <FileDropMessage :message="fileDropMessage" @dismiss="dismissFileDropMessage" />
  </div>
</template>

<style scoped>
.lume-app {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--lume-app-background, var(--lume-bg-base));
}

.lume-app__body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.lume-app__workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}
.lume-app__main {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
}
</style>
