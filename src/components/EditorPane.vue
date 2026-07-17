<script setup lang="ts">
/**
 * EditorPane - 编辑区
 *
 * Phase 0 阶段提供占位结构，后续将集成 CodeMirror 6 编辑内核。
 */
</script>

<template>
  <section class="lume-editor-pane">
    <div class="lume-editor-pane__placeholder">
      <div class="lume-editor-pane__icon">✎</div>
      <p class="lume-editor-pane__text">编辑区</p>
      <p class="lume-editor-pane__hint">CodeMirror 6 将在此处集成</p>
    </div>
  </section>
</template>

<style scoped>
.lume-editor-pane {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--lume-bg-surface);
  overflow: hidden;
  min-width: 0;
}

.lume-editor-pane__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: var(--lume-text-tertiary);
}

.lume-editor-pane__icon {
  font-size: 48px;
  margin-bottom: var(--lume-space-5);
  opacity: 0.3;
}

.lume-editor-pane__text {
  font-size: var(--lume-font-size-lg);
  font-weight: var(--lume-font-weight-medium);
  color: var(--lume-text-secondary);
}

.lume-editor-pane__hint {
  font-size: var(--lume-font-size-sm);
  margin-top: var(--lume-space-2);
  color: var(--lume-text-tertiary);
}
</style>