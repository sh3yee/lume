<script setup lang="ts">
/**
 * App.vue - 应用根组件
 *
 * 组合应用壳的五大区域：标题栏、侧栏、编辑区、预览区、状态栏。
 * 负责整体布局和全局状态协调。
 */
import TitleBar from '@components/TitleBar.vue'
import SideBar from '@components/SideBar.vue'
import EditorPane from '@components/EditorPane.vue'
import PreviewPane from '@components/PreviewPane.vue'
import StatusBar from '@components/StatusBar.vue'
import { ref } from 'vue'

/** 工作模式：编辑 | 分栏 | 预览 */
type ViewMode = 'edit' | 'split' | 'preview'

const viewMode = ref<ViewMode>('split')
const sidebarVisible = ref(true)
</script>

<template>
  <div class="lume-app">
    <TitleBar />

    <div class="lume-app__body">
      <SideBar v-if="sidebarVisible" />

      <main class="lume-app__main">
        <EditorPane v-show="viewMode !== 'preview'" />
        <PreviewPane v-show="viewMode !== 'edit'" />
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