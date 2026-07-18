<script setup lang="ts">
/**
 * UnsavedChangesDialog - 未保存修改确认弹窗
 *
 * 关闭标签前明确提示用户，取消时保留会话暂存，确认时丢弃并关闭。
 */
import { FileText, TriangleAlert } from 'lucide-vue-next'

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
        <header class="lume-unsaved__header">
          <div class="lume-unsaved__icon">
            <TriangleAlert :size="20" :stroke-width="1.7" />
          </div>
          <div class="lume-unsaved__heading">
            <span class="lume-unsaved__eyebrow">Unsaved changes</span>
            <h2 id="unsaved-title" class="lume-unsaved__title">关闭未保存的文档？</h2>
          </div>
        </header>

        <div class="lume-unsaved__body">
          <div class="lume-unsaved__file">
            <FileText :size="16" :stroke-width="1.6" />
            <strong>{{ fileName }}</strong>
            <span>尚未保存</span>
          </div>
          <p id="unsaved-description" class="lume-unsaved__description">
            关闭标签后，此文档的暂存修改将被丢弃且无法恢复。你也可以先取消，再使用
            <kbd>Ctrl</kbd><span>+</span><kbd>S</kbd> 保存。
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
  backdrop-filter: blur(5px);
}

.lume-unsaved__dialog {
  width: min(470px, 100%);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--lume-border-default) 75%, transparent);
  border-radius: var(--lume-radius-xl);
  background-color: var(--lume-bg-surface);
  color: var(--lume-text-primary);
  box-shadow: var(--lume-shadow-xl);
}

.lume-unsaved__header {
  display: flex;
  align-items: center;
  gap: var(--lume-space-5);
  padding: var(--lume-space-7) var(--lume-space-7) var(--lume-space-6);
  background: linear-gradient(135deg, var(--lume-accent-subtle), transparent 65%);
}
.lume-unsaved__icon {
  width: 42px;
    height: 42px;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--lume-radius-lg);
  background-color: var(--lume-bg-surface);
    color: var(--lume-accent-default);
    box-shadow: var(--lume-shadow-xs);
}

.lume-unsaved__heading {
  min-width: 0;
}

.lume-unsaved__eyebrow {
  display: block;
  margin-bottom: var(--lume-space-2);
  color: var(--lume-accent-default);
  font-size: 10px;
  font-weight: var(--lume-font-weight-semibold);
  letter-spacing: 1.2px;
  text-transform: uppercase;
}
.lume-unsaved__title {
  margin: 0;
  font-size: var(--lume-font-size-xl);
  font-weight: var(--lume-font-weight-semibold);
  letter-spacing: -0.25px;
  }
  
  .lume-unsaved__body {
    padding: var(--lume-space-5) var(--lume-space-7) var(--lume-space-6);
  }
  
  .lume-unsaved__file {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--lume-space-3);
    min-height: 44px;
    padding: 0 var(--lume-space-4);
    border: 1px solid var(--lume-border-subtle);
    border-radius: var(--lume-radius-lg);
    background-color: var(--lume-bg-surface-raised);
    color: var(--lume-accent-default);
  }
  
  .lume-unsaved__file strong {
    min-width: 0;
    overflow: hidden;
    color: var(--lume-text-primary);
    font-size: var(--lume-font-size-sm);
    font-weight: var(--lume-font-weight-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .lume-unsaved__file span {
    color: var(--lume-accent-default);
    font-size: var(--lume-font-size-xs);
}

.lume-unsaved__description {
  display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--lume-space-1);
    margin: var(--lume-space-4) 0 0;
    color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-sm);
  line-height: var(--lume-line-height-relaxed);
}

.lume-unsaved__description kbd {
  min-width: 22px;
  padding: 1px 5px;
  border: 1px solid var(--lume-border-default);
  border-bottom-color: var(--lume-border-strong);
  border-radius: var(--lume-radius-sm);
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
  font-family: var(--lume-font-sans);
  font-size: var(--lume-font-size-xs);
  line-height: var(--lume-line-height-normal);
  text-align: center;
  box-shadow: 0 1px 0 var(--lume-border-subtle);
}

.lume-unsaved__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--lume-space-3);
  padding: var(--lume-space-5) var(--lume-space-7);
    border-top: 1px solid var(--lume-border-subtle);
    background-color: color-mix(in srgb, var(--lume-bg-surface-raised) 65%, transparent);
}

.lume-unsaved__button {
  height: 36px;
  padding: 0 var(--lume-space-5);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-sm);
  font-weight: var(--lume-font-weight-medium);
  cursor: pointer;
  transition: border-color var(--lume-transition-fast), background-color var(--lume-transition-fast),
      color var(--lume-transition-fast), transform var(--lume-transition-fast);
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
    transform: translateY(-1px);
}

.lume-unsaved__button:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 2px;
}
@media (max-width: 480px) {

  .lume-unsaved__header,
  .lume-unsaved__body,
  .lume-unsaved__actions {
    padding-right: var(--lume-space-5);
    padding-left: var(--lume-space-5);
  }

  .lume-unsaved__file {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .lume-unsaved__file span {
    display: none;
  }
}
</style>