<script setup lang="ts">
/**
 * SideBar - 侧栏
 *
 * Phase 0 阶段提供占位结构，后续将承载文件树、搜索和书签面板。
 */
</script>

<template>
  <aside class="lume-sidebar">
    <div class="lume-sidebar__header">
      <span class="lume-sidebar__label">资源管理器</span>
    </div>

    <div class="lume-sidebar__content">
      <div class="lume-sidebar__placeholder">
        <p>尚未打开工作区</p>
        <p class="lume-sidebar__hint">打开一个文件夹以浏览文档</p>
      </div>
    </div>

    <div class="lume-sidebar__footer">
      <span class="lume-sidebar__status">就绪</span>
    </div>
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

.lume-sidebar__header {
  height: var(--lume-titlebar-height);
  display: flex;
  align-items: center;
  padding: 0 var(--lume-space-5);
  border-bottom: 1px solid var(--lume-border-subtle);
}

.lume-sidebar__label {
  font-size: var(--lume-font-size-xs);
  font-weight: var(--lume-font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--lume-text-tertiary);
}

.lume-sidebar__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--lume-space-5);
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

.lume-sidebar__hint {
  font-size: var(--lume-font-size-xs);
  margin-top: var(--lume-space-2);
  color: var(--lume-text-tertiary);
}

.lume-sidebar__footer {
  height: var(--lume-statusbar-height);
  display: flex;
  align-items: center;
  padding: 0 var(--lume-space-5);
  border-top: 1px solid var(--lume-border-subtle);
}

.lume-sidebar__status {
  font-size: var(--lume-font-size-xs);
  color: var(--lume-text-tertiary);
}
</style>