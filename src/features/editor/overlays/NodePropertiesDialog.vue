<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { PropertyForm } from './contextMenuTypes'

const props = defineProps<{ form: PropertyForm }>()
const emit = defineEmits<{ close: []; submit: [values: Record<string, string>] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const values = ref(Object.fromEntries(props.form.fields.map((field) => [field.key, field.value])))
const handleSubmit = () => emit('submit', { ...values.value })
onMounted(() => dialog.value?.showModal())
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
      <h2>{{ form.title }}</h2>
      <p v-if="form.error" role="alert">{{ form.error }}</p>
      <label v-for="field in form.fields" :key="field.key">
        <span>{{ field.label }}</span>
        <textarea
          v-if="field.multiline"
          v-model="values[field.key]"
          :required="field.required"
          rows="7"
          spellcheck="false"
        ></textarea>
        <input v-else v-model="values[field.key]" :required="field.required" type="text" />
      </label>
      <div class="lume-node-properties__actions">
        <button type="button" @click="emit('close')">取消</button>
        <button type="submit">保存</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.lume-node-properties {
  margin: auto;
  width: min(480px, calc(100vw - 48px));
  padding: var(--lume-space-5);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-lg);
  background: var(--lume-bg-surface);
  color: var(--lume-text-primary);
  box-shadow: var(--lume-shadow-lg);
}
.lume-node-properties::backdrop {
  background: rgba(0, 0, 0, 0.3);
}
h2 {
  margin: 0 0 var(--lume-space-4);
  font-size: var(--lume-font-size-lg);
}
label {
  display: grid;
  gap: var(--lume-space-2);
  margin-bottom: var(--lume-space-4);
}
input,
textarea {
  box-sizing: border-box;
  width: 100%;
  padding: var(--lume-space-2);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-sm);
  background: var(--lume-bg-surface-raised);
  color: inherit;
  font: inherit;
}
textarea {
  resize: vertical;
}
.lume-node-properties__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--lume-space-3);
}
button {
  padding: var(--lume-space-2) var(--lume-space-4);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-sm);
  background: var(--lume-bg-surface-raised);
  color: inherit;
  cursor: pointer;
}
</style>
