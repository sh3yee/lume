<script setup lang="ts">
import { t } from '@/app/i18n'
import { onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
import type { PropertyForm } from './contextMenuTypes'

const props = defineProps<{ form: PropertyForm }>()
const emit = defineEmits<{ close: []; submit: [values: Record<string, string>] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const values = ref(Object.fromEntries(props.form.fields.map((field) => [field.key, field.value])))
const handleSubmit = () => emit('submit', { ...values.value })
onMounted(() => {
  dialog.value?.showModal()
  dialog.value?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')?.focus()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="lume-node-properties"
    :aria-label="form.title"
    @cancel.prevent="emit('close')"
    @pointerdown.stop
    @keydown.stop
  >
    <form @submit.prevent="handleSubmit">
      <header class="lume-node-properties__header">
        <h2>{{ form.title }}</h2>
        <button
          class="lume-node-properties__close"
          type="button"
          :aria-label="t('关闭')"
          @click="emit('close')"
        >
          <X :size="16" :stroke-width="1.8" />
        </button>
      </header>
      <div class="lume-node-properties__fields">
        <p v-if="form.error" role="alert">{{ form.error }}</p>
        <label v-for="field in form.fields" :key="field.key">
          <span>{{ field.label }}</span>
          <textarea
            v-if="field.multiline"
            v-model="values[field.key]"
            :required="field.required"
            rows="6"
            spellcheck="false"
          ></textarea>
          <input v-else v-model="values[field.key]" :required="field.required" type="text" />
        </label>
      </div>
      <div class="lume-node-properties__actions">
        <button type="button" @click="emit('close')">{{ t('取消') }}</button>
        <button type="submit">{{ t('保存') }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.lume-node-properties {
  box-sizing: border-box;
  margin: auto;
  width: min(400px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--lume-border-default) 65%, transparent);
  border-radius: var(--lume-radius-xl);
  background: var(--lume-bg-surface);
  color: var(--lume-text-primary);
  font-family: var(--lume-interface-font);
  font-size: var(--lume-font-size-base);
  line-height: var(--lume-line-height-normal);
  box-shadow: var(--lume-shadow-xl);
}
.lume-node-properties::backdrop {
  background: rgb(10 15 25 / 18%);
  backdrop-filter: blur(4px);
}
.lume-node-properties__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lume-space-4);
  padding: var(--lume-space-5) var(--lume-space-6) var(--lume-space-4);
}
h2 {
  margin: 0;
  font-size: var(--lume-font-size-md);
  font-weight: var(--lume-font-weight-semibold);
  line-height: var(--lume-line-height-tight);
}
.lume-node-properties__fields {
  display: grid;
  gap: var(--lume-space-5);
  padding: var(--lume-space-2) var(--lume-space-6) var(--lume-space-6);
}
p[role='alert'] {
  margin: 0;
  padding: var(--lume-space-3) var(--lume-space-4);
  border-radius: var(--lume-radius-md);
  background: var(--lume-color-danger-bg);
  color: var(--lume-color-danger);
  font-size: var(--lume-font-size-sm);
  overflow-wrap: anywhere;
}
label {
  display: grid;
  gap: 6px;
}
label > span {
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  font-weight: var(--lume-font-weight-medium);
}
input,
textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: var(--lume-space-3) var(--lume-space-4);
  border: 1px solid color-mix(in srgb, var(--lume-border-default) 65%, transparent);
  border-radius: var(--lume-radius-md);
  outline: none;
  background: color-mix(in srgb, var(--lume-bg-surface-raised) 45%, var(--lume-bg-surface));
  color: inherit;
  font: inherit;
  font-size: var(--lume-font-size-sm);
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease,
    background-color 120ms ease;
}
input:hover,
textarea:hover {
  border-color: var(--lume-border-strong);
}
input:focus,
textarea:focus {
  border-color: var(--lume-accent-default);
  background: var(--lume-bg-surface);
  box-shadow: 0 0 0 2px var(--lume-accent-subtle);
}
textarea {
  min-height: 120px;
  font-family: var(--lume-font-mono);
  font-size: var(--lume-font-size-sm);
  line-height: var(--lume-line-height-relaxed);
  resize: vertical;
}
.lume-node-properties__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--lume-space-3);
  padding: var(--lume-space-4) var(--lume-space-6);
  border-top: 1px solid color-mix(in srgb, var(--lume-border-subtle) 65%, transparent);
  background: color-mix(in srgb, var(--lume-bg-surface-raised) 35%, var(--lume-bg-surface));
}
button {
  min-height: 30px;
  padding: var(--lume-space-2) var(--lume-space-4);
  border: 1px solid transparent;
  border-radius: var(--lume-radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--lume-font-size-sm);
  font-weight: var(--lume-font-weight-medium);
  cursor: pointer;
}
button:hover {
  background: var(--lume-bg-surface-raised);
}
button[type='submit'] {
  min-width: 64px;
  border-color: transparent;
  background: var(--lume-accent-default);
  color: var(--lume-accent-contrast);
}
button[type='submit']:hover {
  background: var(--lume-accent-hover);
}
button:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 2px;
}
.lume-node-properties__close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  min-height: 28px;
  padding: 0;
  color: var(--lume-text-tertiary);
}
.lume-node-properties__close:hover {
  color: var(--lume-text-primary);
}
</style>
