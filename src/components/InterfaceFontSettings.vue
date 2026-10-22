<script setup lang="ts">
import { resolveFontFamily, type FontPreference } from '@/app/preferences/fontFamily'
import type { FontOption } from '@/app/preferences/useSystemFonts'
import FontSelect from './FontSelect.vue'
import SettingsSelect from './SettingsSelect.vue'

const interfaceFontSizeOptions = Array.from({ length: 9 }, (_, index) => ({
  value: index + 12,
  label: `${index + 12} px`,
}))
const outlineFontSizeOptions = [
  { value: 0, label: '跟随界面字号' },
  ...Array.from({ length: 13 }, (_, index) => ({ value: index + 12, label: `${index + 12} px` })),
]

defineProps<{
  font: FontPreference
  fontSize: number
  outlineFontSize: number
  fontOptions: FontOption[]
  container: HTMLDialogElement | null
  fontStatus?: string
}>()

const emit = defineEmits<{
  'update:font': [value: FontPreference]
  'update:font-size': [value: number]
  'update:outline-font-size': [value: number]
  'open-fonts': []
}>()

const handleResetInterface = () => {
  emit('update:font', 'sans')
  emit('update:font-size', 14)
  emit('update:outline-font-size', 0)
}
</script>

<template>
  <section class="lume-interface-font-settings">
    <div class="lume-interface-font-settings__heading">
      <h3 class="lume-interface-font-settings__label">界面文字</h3>
      <p class="lume-interface-font-settings__hint">
        调整菜单、标签栏、文件栏等界面文字，不改变正文排版。大纲可单独设置字号。
      </p>
    </div>
    <div class="lume-interface-font-settings__options">
      <FontSelect
        id="interface-font"
        label="界面字体"
        :value="font"
        :options="fontOptions"
        :container="container"
        :status="fontStatus"
        @open="emit('open-fonts')"
        @change="emit('update:font', $event)"
      />
      <SettingsSelect
        id="interface-font-size"
        label="界面字号"
        :value="fontSize"
        :options="interfaceFontSizeOptions"
        :container="container"
        @change="emit('update:font-size', $event)"
      />
      <SettingsSelect
        id="outline-font-size"
        label="大纲字号"
        :value="outlineFontSize"
        :options="outlineFontSizeOptions"
        :container="container"
        @change="emit('update:outline-font-size', $event)"
      />
    </div>
    <p
      class="lume-interface-font-settings__preview"
      :style="{ fontFamily: resolveFontFamily(font), fontSize: `${fontSize}px` }"
    >
      界面文字预览 · 文件、菜单和标签<br />
      <span :style="{ fontSize: `${outlineFontSize || fontSize}px` }">大纲标题预览</span>
    </p>
    <button class="lume-interface-font-settings__reset" type="button" @click="handleResetInterface">
      恢复默认界面文字
    </button>
  </section>
</template>

<style scoped>
.lume-interface-font-settings {
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-4);
  margin-top: var(--lume-space-5);
  padding-top: var(--lume-space-5);
  border-top: 1px solid var(--lume-border-subtle);
}

.lume-interface-font-settings__heading {
  width: 100%;
}

.lume-interface-font-settings__label {
  margin: 0;
  font-size: var(--lume-font-size-base);
  font-weight: var(--lume-font-weight-semibold);
}

.lume-interface-font-settings__hint {
  margin: var(--lume-space-2) 0 0;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  line-height: var(--lume-line-height-normal);
}

.lume-interface-font-settings__options {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--lume-space-3);
}

.lume-interface-font-settings__preview {
  margin: 12px 0;
  padding: 16px;
  border: 1px solid var(--lume-border-subtle);
  border-radius: var(--lume-radius-md);
  overflow-wrap: anywhere;
}

.lume-interface-font-settings__reset {
  min-width: 60px;
  min-height: 30px;
  padding: 0 var(--lume-space-3);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  cursor: pointer;
  transition:
    border-color var(--lume-transition-fast),
    background-color var(--lume-transition-fast),
    color var(--lume-transition-fast);
}

.lume-interface-font-settings__reset:hover {
  border-color: var(--lume-border-strong);
  color: var(--lume-text-primary);
}
</style>
