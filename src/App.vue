<template>
  <div class="lume-app" :class="{ 'lume-app--focus': focusMode }">
    <TitleBar
      :sidebar-visible="sidebarVisible && !focusMode"
      :inspector-visible="inspectorVisible && !focusMode"
      @toggle-sidebar="toggleSidebar"
      @toggle-inspector="handleToggleInspector"
      @open-command-palette="commandPalette.open"
      @save-file="saveCurrentFile()"
      @open-export="handleOpenExport"
      @open-settings="openSettings"
      @close-window="handleCloseWindow"
    >
      <template v-if="tabsEnabled && !focusMode" #documents>
        <DocumentTabs :file-drop-paths="fileDragPaths" />
      </template>
    </TitleBar>

    <div class="lume-app__body">
      <SideBar v-if="sidebarVisible && !focusMode" />

      <div class="lume-app__workspace">
        <div class="lume-app__content">
          <div class="lume-app__editor-card">
            <main class="lume-app__main">
              <WysiwygPane
                v-if="viewMode === 'wysiwyg'"
                ref="wysiwygPaneRef"
                :key="activeDocumentId"
                @edit-source="handleEditSource"
              />
              <div v-else class="lume-app__split-view">
                <SourceEditor
                  ref="sourceEditorRef"
                  :sync-ratio="splitScrollRatio"
                  @scroll-ratio="handleSplitScrollRatio"
                />
                <PreviewPane
                  :sync-ratio="splitScrollRatio"
                  @scroll-ratio="handleSplitScrollRatio"
                />
              </div>
            </main>
          </div>
          <DocumentInspector v-if="inspectorVisible && !focusMode" />
        </div>
      </div>
    </div>

    <StatusBar
      v-if="statusBarEnabled"
      :sidebar-visible="sidebarVisible && !focusMode"
      @toggle-sidebar="toggleSidebar"
    />
    <CommandPalette
      :open="commandPaletteOpen"
      :items="commandPaletteItems"
      @close="closeCommandPalette"
      @select="handleCommandPaletteSelect"
    />
    <SettingsDialog
      :open="settingsOpen"
      :view-mode="viewMode"
      :theme="themePreference"
      :focus-mode="focusMode"
      :writing-width="writingWidth"
      :writing-font="writingFont"
      :font-size="fontSize"
      :line-height="lineHeight"
      :tabs-enabled="tabsEnabled"
      :status-bar-enabled="statusBarEnabled"
      :interface-font="interfaceFont"
      :interface-font-size="interfaceFontSize"
      :outline-font-size="outlineFontSize"
      @close="settingsOpen = false"
      @update:view-mode="handleViewModeChange"
      @update:theme="themePreference = $event"
      @update:focus-mode="focusMode = $event"
      @update:writing-width="writingWidth = $event"
      @update:writing-font="writingFont = $event"
      @update:font-size="fontSize = $event"
      @update:line-height="lineHeight = $event"
      @update:tabs-enabled="tabsEnabled = $event"
      @update:status-bar-enabled="statusBarEnabled = $event"
      @update:interface-font="interfaceFont = $event"
      @update:interface-font-size="interfaceFontSize = $event"
      @update:outline-font-size="outlineFontSize = $event"
    />
    <UnsavedChangesDialog
      v-if="pendingCloseDocument"
      :file-name="pendingCloseDocument.name"
      @cancel="cancelCloseDocument"
      @confirm="confirmCloseDocument"
    />
    <ExportDialog
      v-if="exportSnapshot"
      :document="exportSnapshot"
      @close="exportSnapshot = null"
      @exported="showMessage(t('导出成功'))"
    />
    <ExternalConflictDialog
      v-if="externalConflict"
      :file-name="externalConflict.fileName"
      :deleted="externalConflict.kind === 'deleted'"
      @keep="keepLocalChanges"
      @reload="reloadConflictedDocument"
    />
    <FileDropMessage :message="fileDropMessage" @dismiss="dismissMessage" />
  </div>
</template>

<script setup lang="ts">
/**
 * App.vue - 应用根组件
 *
 * 组合标题栏、文件栏、编辑区、文档信息栏和状态栏。
 * 默认采用所见即所得（WYSIWYG）模式，用户直接在渲染结果上编辑。
 */
import { t } from '@/app/i18n'
import TitleBar from '@components/TitleBar.vue'
import DocumentTabs from '@components/DocumentTabs.vue'
import DocumentInspector from '@components/DocumentInspector.vue'
import SideBar from '@components/SideBar.vue'
import SourceEditor from '@/features/editor/components/SourceEditor.vue'
import PreviewPane from '@components/PreviewPane.vue'
import WysiwygPane from '@components/WysiwygPane.vue'
import StatusBar from '@components/StatusBar.vue'
import SettingsDialog from '@components/SettingsDialog.vue'
import CommandPalette from '@components/CommandPalette.vue'
import UnsavedChangesDialog from '@components/UnsavedChangesDialog.vue'
import FileDropMessage from '@components/FileDropMessage.vue'
import ExternalConflictDialog from '@components/ExternalConflictDialog.vue'
import ExportDialog from '@/features/export/components/ExportDialog.vue'
import { nextTick, ref } from 'vue'
import { useDocument } from '@composables/useDocument'
import { useFileOps } from '@composables/useFileOps'
import { useAppShortcuts } from '@/app/commands/useAppShortcuts'
import { useCommandPalette } from '@/app/commands/useCommandPalette'
import { useAppFeedback } from '@/app/feedback/useAppFeedback'
import { useDocumentSessionPersistence } from '@/app/lifecycle/useDocumentSessionPersistence'
import { useFileDrop } from '@/app/lifecycle/useFileDrop'
import { useWindowPersistence } from '@/app/lifecycle/useWindowPersistence'
import { useWorkspaceLifecycle } from '@/app/lifecycle/useWorkspaceLifecycle'
import { useThemePreference } from '@/app/preferences/useThemePreference'
import { useWritingPreference } from '@/app/preferences/useWritingPreference'
import { useInterfacePreference } from '@/app/preferences/useInterfacePreference'
import { useTabsPreference } from '@/app/preferences/useTabsPreference'
import { useStatusBarPreference } from '@/app/preferences/useStatusBarPreference'
import type { OpenDocument } from '@/features/documents/model/documentTypes'
import {
  useImageCommands,
  type ImageCommandEditor,
} from '@/features/images/editor/useImageCommands'

/** 工作模式：所见即所得 | 分栏（源码+预览） */
type ViewMode = 'wysiwyg' | 'split'

const viewMode = ref<ViewMode>('wysiwyg')
const wysiwygPaneRef = ref<ImageCommandEditor | null>(null)
const sourceEditorRef = ref<(ImageCommandEditor & { focus: () => void }) | null>(null)
const sidebarVisible = ref(window.matchMedia('(min-width: 900px)').matches)
const inspectorVisible = ref(window.matchMedia('(min-width: 1180px)').matches)
const focusMode = ref(false)
const splitScrollRatio = ref(0)
const settingsOpen = ref(false)
const exportSnapshot = ref<OpenDocument | null>(null)
const { newFile, openFile, openFilesFromPaths, saveFile } = useFileOps()
const commandPalette = useCommandPalette({
  newFile,
  openFile,
  saveFile: saveCurrentFile,
  saveFileAs: () => saveCurrentFile(true),
  openExport: () => handleOpenExport(),
  toggleSidebar,
  toggleInspector: () => handleToggleInspector(),
  toggleFocusMode: () => {
    focusMode.value = !focusMode.value
  },
  toggleViewMode: () => {
    handleViewModeChange(viewMode.value === 'wysiwyg' ? 'split' : 'wysiwyg')
  },
  openSettings,
  closeActiveDocument,
  onImageCommand: (id) => imageCommands.execute(id),
})
const commandPaletteOpen = commandPalette.isOpen
const commandPaletteItems = commandPalette.items
const closeCommandPalette = commandPalette.close
const handleCommandPaletteSelect = commandPalette.handleSelect
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
const { themePreference } = useThemePreference()
const { writingWidth, writingFont, fontSize, lineHeight } = useWritingPreference()
const { interfaceFont, interfaceFontSize, outlineFontSize } = useInterfacePreference()
const { tabsEnabled } = useTabsPreference()
const { statusBarEnabled } = useStatusBarPreference()
const { message: fileDropMessage, dismissMessage, showMessage, getErrorMessage } = useAppFeedback()
const imageCommands = useImageCommands({
  getEditor: () => (viewMode.value === 'wysiwyg' ? wysiwygPaneRef.value : sourceEditorRef.value),
  onMessage: showMessage,
})
const { externalConflict, keepLocalChanges, reloadConflictedDocument } =
  useWorkspaceLifecycle(showMessage)
const { flushDocumentSession } = useDocumentSessionPersistence(
  documents,
  activeDocumentId,
  persistDocumentSession,
)
const { fileDragPaths } = useFileDrop(viewMode, openFilesFromPaths, showMessage, dismissMessage)

const handleEditSource = async () => {
  handleViewModeChange('split')
  await nextTick()
  sourceEditorRef.value?.focus()
}

const handleOpenExport = () => {
  wysiwygPaneRef.value?.flushPendingMarkdown?.()
  if (activeDocument.value) exportSnapshot.value = { ...activeDocument.value }
}

const handleViewModeChange = (mode: ViewMode) => {
  wysiwygPaneRef.value?.flushPendingMarkdown?.()
  viewMode.value = mode
}

const handleToggleInspector = () => {
  if (focusMode.value) {
    focusMode.value = false
    inspectorVisible.value = true
    return
  }
  inspectorVisible.value = !inspectorVisible.value
}

function openSettings() {
  settingsOpen.value = true
}

function toggleSidebar() {
  if (focusMode.value) {
    focusMode.value = false
    sidebarVisible.value = true
    return
  }
  sidebarVisible.value = !sidebarVisible.value
}

function handleSplitScrollRatio(value: number) {
  if (Number.isFinite(value)) splitScrollRatio.value = value
}

/** 关闭应用前同步暂存，确保最后一次输入也能恢复。 */
async function handleCloseWindow() {
  wysiwygPaneRef.value?.flushPendingMarkdown?.()
  flushDocumentSession()
  requestCloseDocuments(
    documents.value
      .filter((document: OpenDocument) => document.isDirty)
      .map((document: OpenDocument) => document.id),
    (completed: boolean) => {
      if (!completed) return
      void closeApplicationWindow().catch((error: unknown) => {
        showMessage(t('关闭失败：{0}', getErrorMessage(error)))
      })
    },
  )
}

const { closeApplicationWindow } = useWindowPersistence(handleCloseWindow)

async function saveCurrentFile(saveAs = false) {
  try {
    wysiwygPaneRef.value?.flushPendingMarkdown?.()
    await saveFile(saveAs)
  } catch (error) {
    showMessage(t('保存失败：{0}', getErrorMessage(error)))
  }
}

/** 关闭当前标签，未保存时先向用户确认。 */
function closeActiveDocument() {
  const document = activeDocument.value
  if (!document) return
  requestCloseDocument(document.id)
}

useAppShortcuts({
  toggleSidebar,
  toggleInspector: handleToggleInspector,
  closeActiveDocument,
  newFile,
  openFile,
  openSettings,
  saveFile: saveCurrentFile,
  saveFileAs: () => saveCurrentFile(true),
  openExport: handleOpenExport,
  openCommandPalette: commandPalette.open,
  toggleViewMode: () => handleViewModeChange(viewMode.value === 'wysiwyg' ? 'split' : 'wysiwyg'),
  toggleFocusMode: () => {
    focusMode.value = !focusMode.value
  },
  insertImage: () => imageCommands.execute('insertImage'),
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
  position: relative;
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

.lume-app__content {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  gap: 0;
  padding: 0;
}

.lume-app__editor-card {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: var(--lume-pane-bg);
  box-shadow: none;
}

.lume-app__main {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  padding: 0;
}

/* 外框由编辑面板统一绘制，标签和正文之间不再叠加卡片。 */
.lume-app__main :deep(.lume-wysiwyg-pane),
.lume-app__main :deep(.lume-source-editor),
.lume-app__main :deep(.lume-preview-pane) {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.lume-app__split-view :deep(.lume-source-editor) {
  border-right: 1px solid var(--lume-border-subtle);
}

.lume-app__split-view {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  gap: 0;
}

.lume-app--focus .lume-app__body {
  padding: 0;
}

.lume-app--focus .lume-app__workspace {
  max-width: 1100px;
  width: min(1100px, 100%);
  margin: 0 auto;
}

.lume-app--focus .lume-app__content {
  gap: 0;
  padding: 0;
}

.lume-app--focus .lume-app__editor-card {
  margin: 0;
}

@media (max-width: 1179px) {
  .lume-app__content > :deep(.lume-document-inspector) {
    position: absolute;
    z-index: var(--lume-z-raised);
    top: 0;
    right: 10px;
    bottom: 0;
    box-shadow: var(--lume-shadow-lg);
  }
}

@media (max-width: 899px) {
  .lume-app__body > :deep(.lume-sidebar) {
    position: absolute;
    z-index: var(--lume-z-sticky);
    inset: 0 auto 0 0;
    box-shadow: var(--lume-shadow-lg);
  }
}

@media (max-width: 639px) {
  .lume-app__split-view {
    flex-direction: column;
  }

  .lume-app__split-view :deep(.lume-source-editor) {
    border-right: 0;
    border-bottom: 1px solid var(--lume-border-subtle);
  }
}
</style>
