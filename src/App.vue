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
           <SourceEditor />
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
   <ExternalConflictDialog v-if="externalConflict" :file-name="externalConflict.fileName"
      :deleted="externalConflict.kind === 'deleted'" @keep="keepLocalChanges" @reload="reloadConflictedDocument" />
    <FileDropMessage :message="fileDropMessage" @dismiss="dismissMessage" />
  </div>
</template>

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
import SourceEditor from '@/features/editor/components/SourceEditor.vue'
import PreviewPane from '@components/PreviewPane.vue'
import WysiwygPane from '@components/WysiwygPane.vue'
import StatusBar from '@components/StatusBar.vue'
import SettingsDialog from '@components/SettingsDialog.vue'
import UnsavedChangesDialog from '@components/UnsavedChangesDialog.vue'
import FileDropMessage from '@components/FileDropMessage.vue'
import ExternalConflictDialog from '@components/ExternalConflictDialog.vue'
import { ref } from 'vue'
import { useDocument } from '@composables/useDocument'
import { useFileOps } from '@composables/useFileOps'
import { useAppShortcuts } from '@/app/commands/useAppShortcuts'
import { useAppFeedback } from '@/app/feedback/useAppFeedback'
import { useDocumentSessionPersistence } from '@/app/lifecycle/useDocumentSessionPersistence'
import { useFileDrop } from '@/app/lifecycle/useFileDrop'
import { useWindowPersistence } from '@/app/lifecycle/useWindowPersistence'
import { useWorkspaceLifecycle } from '@/app/lifecycle/useWorkspaceLifecycle'
import { useThemePreference } from '@/app/preferences/useThemePreference'
import type { OpenDocument } from '@/features/documents/model/documentTypes'

/** 工作模式：所见即所得 | 分栏（源码+预览） */
type ViewMode = 'wysiwyg' | 'split'

const viewMode = ref<ViewMode>('wysiwyg')
const sidebarVisible = ref(false)
const settingsOpen = ref(false)
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
  requestCloseDocuments,
} = useDocument()
const { themePreference, resolvedTheme } = useThemePreference()
const { message: fileDropMessage, dismissMessage, showMessage, getErrorMessage } = useAppFeedback()
const { externalConflict, keepLocalChanges, reloadConflictedDocument } = useWorkspaceLifecycle(showMessage)
const { flushDocumentSession } = useDocumentSessionPersistence(
  documents,
  activeDocumentId,
  persistDocumentSession,
)
const { fileDragPaths } = useFileDrop(
  viewMode,
  openFilesFromPaths,
  showMessage,
  dismissMessage,
)

function openSettings() {
  settingsOpen.value = true
}

function toggleSidebar() {
  sidebarVisible.value = !sidebarVisible.value
}

/** 关闭应用前同步暂存，确保最后一次输入也能恢复。 */
async function handleCloseWindow() {
  flushDocumentSession()
  requestCloseDocuments(
    documents.value.filter((document: OpenDocument) => document.isDirty).map((document: OpenDocument) => document.id),
    (completed: boolean) => {
      if (completed) void closeApplicationWindow()
    },
  )
}

const { closeApplicationWindow } = useWindowPersistence(handleCloseWindow)

async function saveCurrentFile(saveAs = false) {
  try {
    await saveFile(saveAs)
  } catch (error) {
    showMessage(`保存失败：${getErrorMessage(error)}`)
  }
}

/** 关闭当前标签，未保存时先向用户确认。 */
function closeActiveDocument() {
  const document = activeDocument.value
  if (!document) return
  requestCloseDocument(document.id)
}

useAppShortcuts({
  closeActiveDocument,
  newFile,
  openFile,
  openSettings,
  saveFile: saveCurrentFile,
  saveFileAs: () => saveCurrentFile(true),
})
</script>

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
