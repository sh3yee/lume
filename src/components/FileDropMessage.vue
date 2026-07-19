<script setup lang="ts">
import { TriangleAlert, X } from 'lucide-vue-next'

defineProps<{
  message: string | null
}>()

const emit = defineEmits<{
  dismiss: []
}>()
</script>

<template>
  <Transition name="lume-drop-message">
    <div v-if="message" class="lume-file-drop-message" role="status">
      <TriangleAlert :size="16" :stroke-width="1.8" />
      <span>{{ message }}</span>
      <button type="button" title="关闭提示" aria-label="关闭提示" @click="emit('dismiss')">
        <X :size="15" :stroke-width="1.8" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.lume-file-drop-message {
  position: absolute;
  right: var(--lume-space-5);
  bottom: calc(var(--lume-statusbar-height) + var(--lume-space-4));
  z-index: var(--lume-z-sticky);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--lume-space-3);
  max-width: min(520px, calc(100vw - 32px));
  min-height: 40px;
  padding: var(--lume-space-3) var(--lume-space-3) var(--lume-space-3) var(--lume-space-4);
  border: 1px solid color-mix(in srgb, var(--lume-color-warning) 48%, var(--lume-border-default));
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-overlay);
  color: var(--lume-text-secondary);
  box-shadow: var(--lume-shadow-md);
  font-size: var(--lume-font-size-sm);
  line-height: var(--lume-line-height-normal);
  backdrop-filter: blur(12px);
}

.lume-file-drop-message > svg {
  color: var(--lume-color-warning);
}

.lume-file-drop-message span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.lume-file-drop-message button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--lume-radius-sm);
  background: transparent;
  color: var(--lume-text-tertiary);
  cursor: pointer;
}

.lume-file-drop-message button:hover {
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-drop-message-enter-active,
.lume-drop-message-leave-active {
  transition:
    opacity var(--lume-transition-fast),
    transform var(--lume-transition-fast);
}

.lume-drop-message-enter-from,
.lume-drop-message-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
