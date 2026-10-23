<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
import { t } from '@/app/i18n'
import type { OpenDocument } from '@/features/documents/model/documentTypes'
import { EXPORT_FORMATS } from '../model/exportFormats'
import { exportDocument } from '../services/documentExport'
import SettingsSelect from '@/components/SettingsSelect.vue'

const props = defineProps<{ document: OpenDocument }>()
const emit = defineEmits<{ close: []; exported: [] }>()
const dialogRef = ref<HTMLDialogElement | null>(null)
const formatId = ref('pdf')
const busy = ref(false)
const error = ref('')

const format = computed(() => EXPORT_FORMATS.find((item) => item.id === formatId.value)!)
const options = computed(() =>
  EXPORT_FORMATS.map((item) => ({ value: item.id, label: t(item.label) })),
)

const handleClose = () => {
  if (!busy.value) emit('close')
}

const handleExport = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await exportDocument(props.document, format.value)
    if (result === 'saved') emit('exported')
    if (result) emit('close')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

onMounted(() => dialogRef.value?.showModal())
onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <dialog
    ref="dialogRef"
    class="lume-export-dialog"
    aria-labelledby="export-title"
    :aria-busy="busy"
    @cancel.prevent="handleClose"
    @click.self="handleClose"
    @contextmenu.prevent
  >
    <header class="lume-export-dialog__header">
      <h2 id="export-title">{{ t('导出') }}</h2>
      <button type="button" :disabled="busy" :aria-label="t('关闭')" @click="handleClose">
        <X :size="18" />
      </button>
    </header>
    <form class="lume-export-dialog__body" @submit.prevent="handleExport">
      <p class="lume-export-dialog__filename">{{ document.name }}</p>
      <fieldset :disabled="busy">
        <SettingsSelect
          id="export-format"
          :label="t('导出格式')"
          :value="formatId"
          :options="options"
          :container="dialogRef"
          @change="formatId = String($event)"
        />
      </fieldset>
      <p class="lume-export-dialog__hint">
        {{
          format.engine === 'print'
            ? t('将打开打印窗口，请选择“另存为 PDF”保存。')
            : t('导出当前文档的全部内容，包含尚未保存的修改。')
        }}
      </p>
      <p v-if="error" class="lume-export-dialog__error" role="alert">{{ error }}</p>
      <footer class="lume-export-dialog__actions">
        <button type="button" :disabled="busy" @click="handleClose">{{ t('取消') }}</button>
        <button type="submit" class="lume-export-dialog__primary" :disabled="busy">
          {{ busy ? t('正在导出…') : t('导出') }}
        </button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.lume-export-dialog {
  position: fixed;
  inset: 0;
  width: min(460px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  margin: auto;
  padding: 0;
  overflow-y: auto;
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-xl);
  background: var(--lume-bg-surface);
  color: var(--lume-text-primary);
  box-shadow: var(--lume-shadow-lg);
}
.lume-export-dialog::backdrop {
  background: rgb(10 10 10 / 34%);
  backdrop-filter: blur(5px);
}
.lume-export-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--lume-border-subtle);
}
.lume-export-dialog__header h2 {
  margin: 0;
  font-size: var(--lume-font-size-md);
  font-weight: 500;
}
.lume-export-dialog__header button {
  display: flex;
  padding: 4px;
  border: 0;
  background: transparent;
  color: var(--lume-text-secondary);
}
.lume-export-dialog__body {
  padding: 20px;
}
.lume-export-dialog__filename {
  margin: 0 0 16px;
  overflow-wrap: anywhere;
  font-size: var(--lume-font-size-sm);
  color: var(--lume-text-secondary);
}
.lume-export-dialog fieldset {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.lume-export-dialog__hint {
  margin: 12px 0;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  line-height: 1.6;
}
.lume-export-dialog__error {
  color: var(--lume-color-danger);
  overflow-wrap: anywhere;
  font-size: var(--lume-font-size-sm);
}
.lume-export-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
.lume-export-dialog__actions button {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
  font: inherit;
  font-size: var(--lume-font-size-sm);
}
.lume-export-dialog__actions .lume-export-dialog__primary {
  background: var(--lume-accent-default);
  border-color: var(--lume-accent-default);
  color: var(--lume-accent-contrast);
}
.lume-export-dialog button {
  cursor: pointer;
}
.lume-export-dialog button:disabled {
  opacity: 0.55;
  cursor: default;
}
.lume-export-dialog button:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 2px;
}
</style>
