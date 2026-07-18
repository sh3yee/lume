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
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useFileOps } from '@composables/useFileOps'

/** 工作模式：所见即所得 | 分栏（源码+预览） */
type ViewMode = 'wysiwyg' | 'split'

const viewMode = ref<ViewMode>('wysiwyg')
const sidebarVisible = ref(false)
const { newFile, openFile, saveFile } = useFileOps()

function toggleViewMode() {
  viewMode.value = viewMode.value === 'wysiwyg' ? 'split' : 'wysiwyg'
}

/** 桌面编辑器常用文件快捷键。 */
function handleShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return

  const key = event.key.toLowerCase()
  if (!['n', 'o', 's'].includes(key)) return
  event.preventDefault()

  if (key === 'n') newFile()
  if (key === 'o') void openFile()
  if (key === 's') void saveFile()
}

onMounted(() => window.addEventListener('keydown', handleShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', handleShortcut))
</script>

<template>
  <div class="lume-app">
    <TitleBar @toggle-view-mode="toggleViewMode" />
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

    <StatusBar />
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