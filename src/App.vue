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
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDocument } from '@composables/useDocument'
import { useFileOps } from '@composables/useFileOps'
import { closeWindow } from './types/tauri'

/** 工作模式：所见即所得 | 分栏（源码+预览） */
type ViewMode = 'wysiwyg' | 'split'
type ThemePreference = 'system' | 'light' | 'dark'

const THEME_STORAGE_KEY = 'lume-theme'

/** 读取已保存的主题偏好，无有效记录时跟随系统。 */
function getInitialTheme(): ThemePreference {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  return savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system'
    ? savedTheme
    : 'system'
}

const viewMode = ref<ViewMode>('wysiwyg')
const sidebarVisible = ref(false)
const settingsOpen = ref(false)
const themePreference = ref<ThemePreference>(getInitialTheme())
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
const { newFile, openFile, saveFile } = useFileOps()
const { activeDocument, activeDocumentId, closeDocument, documents, persistDocumentSession } = useDocument()
let sessionPersistTimer: ReturnType<typeof setTimeout> | null = null

/** 将主题偏好解析为实际主题并应用到根元素。 */
function applyTheme() {
  const resolvedTheme = themePreference.value === 'system'
    ? systemTheme.matches ? 'dark' : 'light'
    : themePreference.value
  document.documentElement.dataset.theme = resolvedTheme
}

function handleSystemThemeChange() {
  if (themePreference.value === 'system') applyTheme()
}

function toggleViewMode() {
  viewMode.value = viewMode.value === 'wysiwyg' ? 'split' : 'wysiwyg'
}

function openSettings() {
  settingsOpen.value = true
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
  await closeWindow()
}

function handleBeforeUnload() {
  persistDocumentSession()
}

/** 关闭当前标签，未保存时先向用户确认。 */
function closeActiveDocument() {
  const document = activeDocument.value
  if (!document) return
  if (document.isDirty && !window.confirm(`“${document.name}”尚未保存，确定关闭吗？`)) return
  closeDocument(document.id)
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
  if (key === 's') void saveFile()
  if (key === 'w') closeActiveDocument()
}

watch(themePreference, (theme) => {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyTheme()
}, { immediate: true })

watch([documents, activeDocumentId], scheduleSessionPersist, { deep: true })

onMounted(() => {
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('beforeunload', handleBeforeUnload)
  systemTheme.addEventListener('change', handleSystemThemeChange)
})

onBeforeUnmount(() => {
  if (sessionPersistTimer) clearTimeout(sessionPersistTimer)
  persistDocumentSession()
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  systemTheme.removeEventListener('change', handleSystemThemeChange)
})
</script>

<template>
  <div class="lume-app">
    <TitleBar @toggle-view-mode="toggleViewMode" @close-window="handleCloseWindow" />
    <DocumentTabs />

    <div class="lume-app__body">
      <SideBar v-if="sidebarVisible" />

      <main class="lume-app__main">
        <WysiwygPane v-show="viewMode === 'wysiwyg'" />
        <template v-if="viewMode === 'split'">
          <EditorPane />
          <PreviewPane />
        </template>
      </main>
    </div>

    <StatusBar @open-settings="openSettings" />
    <SettingsDialog :open="settingsOpen" :view-mode="viewMode" :theme="themePreference" @close="settingsOpen = false"
      @update:view-mode="viewMode = $event" @update:theme="themePreference = $event" />
  </div>
</template>

<style scoped>
.lume-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--lume-bg-base);
}

.lume-app__body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.lume-app__main {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
}
</style>