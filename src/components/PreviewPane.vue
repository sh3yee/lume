<script setup lang="ts">
/**
 * PreviewPane - 预览区
 *
 * Phase 0 阶段提供占位结构，后续将集成 markdown-it 渲染与局部更新。
 */
</script>

<template>
  <section class="lume-preview-pane">
    <div class="lume-preview-pane__placeholder">
      <div class="lume-preview-pane__icon">👁</div>
      <p class="lume-preview-pane__text">预览区</p>
      <p class="lume-preview-pane__hint">markdown-it 渲染将在此处集成</p>
    </div>
  </section>
</template>

<style scoped>
.lume-preview-pane {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--lume-bg-surface-raised);
  border-left: 1px solid var(--lume-border-subtle);
  overflow: hidden;
  min-width: 0;
}

.lume-preview-pane__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: var(--lume-text-tertiary);
}

.lume-preview-pane__icon {
  font-size: 48px;
  margin-bottom: var(--lume-space-5);
  opacity: 0.3;
}

.lume-preview-pane__text {
  font-size: var(--lume-font-size-lg);
  font-weight: var(--lume-font-weight-medium);
  color: var(--lume-text-secondary);
}

.lume-preview-pane__hint {
  font-size: var(--lume-font-size-sm);
  margin-top: var(--lume-space-2);
  color: var(--lume-text-tertiary);
}
</style>