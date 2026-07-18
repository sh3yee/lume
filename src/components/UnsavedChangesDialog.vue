<script setup lang="ts">
/**
 * UnsavedChangesDialog - 未保存修改确认弹窗
 *
 * 关闭标签前明确提示用户，取消时保留会话暂存，确认时丢弃并关闭。
 */
import { AlertTriangle } from 'lucide-vue-next'

defineProps<{
  fileName: string
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'confirm'): void
}>()
</script>

<template>
  <Teleport to="body">
    <div class="lume-unsaved" role="presentation" @mousedown.self="emit('cancel')">
      <section
        class="lume-unsaved__dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        aria-describedby="unsaved-description"
        tabindex="-1"
        @keydown.esc="emit('cancel')"
      >
        <div class="lume-unsaved__icon">
          <AlertTriangle :size="21" :stroke-width="1.7" />
        </div>

        <div class="lume-unsaved__content">
          <h2 id="unsaved-title" class="lume-unsaved__title">关闭未保存的文档？</h2>
          <p id="unsaved-description" class="lume-unsaved__description">
            <strong>“{{ fileName }}”</strong> 包含未保存的修改。关闭后，该标签中的暂存内容将无法恢复。
          </p>
        </div>

        <footer class="lume-unsaved__actions">
          <button class="lume-unsaved__button" type="button" autofocus @click="emit('cancel')">
            取消
          </button>
          <button
            class="lume-unsaved__button lume-unsaved__button--danger"
            type="button"
            @click="emit('confirm')"
          >
            丢弃并关闭
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.lume-unsaved {
  position: fixed;
  inset: 0;
  z-index: var(--lume-z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--lume-space-6);
  background-color: rgba(10, 10, 10, 0.38);
  backdrop-filter: blur(4px);
}

.lume-unsaved__dialog {
  width: min(430px, 100%);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--lume-space-5);
  padding: var(--lume-space-7);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-xl);
  background-color: var(--lume-bg-surface);
  color: var(--lume-text-primary);
  box-shadow: var(--lume-shadow-xl);
}

.lume-unsaved__icon {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--lume-radius-lg);
  background-color: var(--lume-color-warning-bg);
  color: var(--lume-color-warning);
}

.lume-unsaved__content {
  min-width: 0;
}

.lume-unsaved__title {
  margin: 0;
  font-size: var(--lume-font-size-lg);
  font-weight: var(--lume-font-weight-semibold);
}

.lume-unsaved__description {
  margin: var(--lume-space-3) 0 0;
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  line-height: var(--lume-line-height-relaxed);
  overflow-wrap: anywhere;
}

.lume-unsaved__description strong {
  color: var(--lume-text-primary);
  font-weight: var(--lume-font-weight-medium);
}

.lume-unsaved__actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: var(--lume-space-3);
  margin-top: var(--lume-space-2);
}

.lume-unsaved__button {
  height: 34px;
  padding: 0 var(--lume-space-5);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-sm);
  cursor: pointer;
}

.lume-unsaved__button:hover {
  border-color: var(--lume-border-strong);
}

.lume-unsaved__button--danger {
  border-color: var(--lume-color-danger);
  background-color: var(--lume-color-danger);
  color: var(--lume-text-inverse);
}

.lume-unsaved__button--danger:hover {
  filter: brightness(0.92);
}

.lume-unsaved__button:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 2px;
}
</style>