<script setup lang="ts">
/**
 * UnsavedChangesDialog - 未保存修改确认弹窗
 *
 * 关闭标签前明确提示用户，取消时保留会话暂存，确认时丢弃并关闭。
 */
import { TriangleAlert } from 'lucide-vue-next'

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
        <div class="lume-unsaved__content">
          <span class="lume-unsaved__icon" aria-hidden="true">
            <TriangleAlert :size="18" :stroke-width="1.8" />
          </span>
          <div class="lume-unsaved__message">
            <h2 id="unsaved-title" class="lume-unsaved__title">放弃未保存的修改？</h2>
            <p id="unsaved-description" class="lume-unsaved__description">
              关闭 <strong class="lume-unsaved__filename">{{ fileName }}</strong> 后，修改将无法恢复。
            </p>
          </div>
        </div>

        <div class="lume-unsaved__actions">
          <button class="lume-unsaved__button" type="button" autofocus @click="emit('cancel')">
            取消
          </button>
          <button
            class="lume-unsaved__button lume-unsaved__button--danger"
            type="button"
            @click="emit('confirm')"
          >
            放弃修改
          </button>
        </div>
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
  background-color: rgba(10, 10, 10, 0.3);
    backdrop-filter: blur(4px);
}

.lume-unsaved__dialog {
  width: min(400px, 100%);
    padding: var(--lume-space-6);
    border: 1px solid color-mix(in srgb, var(--lume-border-default) 72%, transparent);
  border-radius: var(--lume-radius-xl);
  background-color: var(--lume-bg-overlay);
  color: var(--lume-text-primary);
  box-shadow: var(--lume-shadow-xl);
}

.lume-unsaved__content {
  display: flex;
  align-items: flex-start;
    gap: var(--lume-space-4);
}

.lume-unsaved__icon {
  width: 34px;
    height: 34px;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--lume-radius-md);
    background-color: var(--lume-accent-subtle);
    color: var(--lume-accent-default);
}

.lume-unsaved__message {
  min-width: 0;
  padding-top: var(--lume-space-1);
}

.lume-unsaved__title {
  margin: 0;
  font-size: var(--lume-font-size-lg);
  font-weight: var(--lume-font-weight-semibold);
  letter-spacing: -0.15px;
  }
.lume-unsaved__description {
  margin: var(--lume-space-2) 0 0;
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  line-height: var(--lume-line-height-normal);
}
.lume-unsaved__filename {
  display: inline-block;
  max-width: 180px;
  margin: 0 2px;
  padding: 0 var(--lume-space-2);
  overflow: hidden;
  border-radius: var(--lume-radius-sm);
  background-color: var(--lume-accent-subtle);
  color: var(--lume-accent-default);
  font-weight: var(--lume-font-weight-medium);
  line-height: 1.6;
  text-overflow: ellipsis;
  vertical-align: -0.35em;
  white-space: nowrap;
}

.lume-unsaved__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--lume-space-3);
  margin-top: var(--lume-space-6);
}

.lume-unsaved__button {
  height: 34px;
  padding: 0 var(--lume-space-5);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-sm);
  font-weight: var(--lume-font-weight-medium);
  cursor: pointer;
  transition: border-color var(--lume-transition-fast), background-color var(--lume-transition-fast),
    color var(--lume-transition-fast);
}

.lume-unsaved__button:hover {
  border-color: var(--lume-border-strong);
  background-color: var(--lume-bg-surface);
}

.lume-unsaved__button--danger {
  border-color: var(--lume-accent-default);
  background-color: var(--lume-accent-default);
    color: var(--lume-accent-contrast);
}

.lume-unsaved__button--danger:hover {
  border-color: var(--lume-accent-hover);
  background-color: var(--lume-accent-hover);
}

.lume-unsaved__button:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 2px;
}
</style>