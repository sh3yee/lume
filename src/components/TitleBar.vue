<script setup lang="ts">
/**
 * TitleBar - 标题栏
 *
 * 显示应用名称、窗口控制按钮（Tauri 环境下）和全局操作入口。
 */
</script>

<template>
  <header class="lume-titlebar">
    <div class="lume-titlebar__left">
      <span class="lume-titlebar__logo">Lume</span>
    </div>

    <div class="lume-titlebar__center">
      <span class="lume-titlebar__title">未命名文档</span>
    </div>

    <div class="lume-titlebar__right">
      <!-- 窗口控制按钮在 Tauri 环境下由原生层接管 -->
    </div>
  </header>
</template>

<style scoped>
.lume-titlebar {
  height: var(--lume-titlebar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--lume-space-5);
  background-color: var(--lume-bg-surface);
  border-bottom: 1px solid var(--lume-border-subtle);
  user-select: none;
  flex-shrink: 0;
}

.lume-titlebar__left {
  display: flex;
  align-items: center;
  gap: var(--lume-space-4);
}

.lume-titlebar__logo {
  font-size: var(--lume-font-size-md);
  font-weight: var(--lume-font-weight-semibold);
  color: var(--lume-accent-default);
  letter-spacing: 0.5px;
}

.lume-titlebar__center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.lume-titlebar__title {
  font-size: var(--lume-font-size-sm);
  color: var(--lume-text-secondary);
}

.lume-titlebar__right {
  display: flex;
  align-items: center;
  gap: var(--lume-space-3);
}
</style>