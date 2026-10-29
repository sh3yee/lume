<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RotateCcw, Search, X } from 'lucide-vue-next'
import { t, type MessageKey } from '@/app/i18n'
import {
  formatShortcut,
  SHORTCUT_DEFINITIONS,
  shortcutFromEvent,
  type ShortcutId,
} from '@/app/commands/shortcuts'
import { useShortcutPreference } from '@/app/preferences/useShortcutPreference'

interface ShortcutFeedback {
  id: ShortcutId | null
  message: string
  error: boolean
}

const { bindings, setShortcut, resetShortcuts } = useShortcutPreference()
const search = ref('')
const recordingId = ref<ShortcutId | null>(null)
const feedback = ref<ShortcutFeedback | null>(null)

const shortcutGroups = computed(() => {
  const query = search.value.toLocaleLowerCase().replace(/[\s+]/g, '')
  const groups: Array<{
    label: MessageKey
    shortcuts: (typeof SHORTCUT_DEFINITIONS)[number][]
  }> = []

  for (const shortcut of SHORTCUT_DEFINITIONS) {
    const binding = bindings.value[shortcut.id]
    const searchable = [t(shortcut.label), t(shortcut.group), formatShortcut(binding), binding]
      .join(' ')
      .toLocaleLowerCase()
      .replace(/[\s+]/g, '')
    if (query && !searchable.includes(query)) continue

    let group = groups.find((item) => item.label === shortcut.group)
    if (!group) {
      group = { label: shortcut.group, shortcuts: [] }
      groups.push(group)
    }
    group.shortcuts.push(shortcut)
  }

  return groups
})

const handleCancelRecording = () => {
  recordingId.value = null
}

const handleStartRecording = (id: ShortcutId, event: MouseEvent) => {
  feedback.value = null
  recordingId.value = recordingId.value === id ? null : id
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
}

const handleSetShortcut = (id: ShortcutId, binding: string) => {
  const error = setShortcut(id, binding)
  if (error) {
    feedback.value = { id, message: error, error: true }
    return
  }

  handleCancelRecording()
  const shortcut = SHORTCUT_DEFINITIONS.find((item) => item.id === id)
  if (!shortcut) return
  feedback.value = {
    id,
    message: binding
      ? t('已设置「{0}」：{1}', t(shortcut.label), formatShortcut(binding))
      : t('已清除「{0}」快捷键', t(shortcut.label)),
    error: false,
  }
}

const handleRecordKeydown = (event: KeyboardEvent) => {
  const id = recordingId.value
  if (!id) return

  // 在窗口捕获阶段截断录入事件，避免触发应用和编辑器命令。
  event.stopImmediatePropagation()
  if (event.key === 'Tab') {
    handleCancelRecording()
    return
  }
  event.preventDefault()
  if (event.key === 'Escape') {
    handleCancelRecording()
    feedback.value = null
    return
  }
  if (event.repeat || event.isComposing) return
  if (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key === 'Backspace' || event.key === 'Delete')
  ) {
    handleSetShortcut(id, '')
    return
  }

  const binding = shortcutFromEvent(event)
  if (binding) handleSetShortcut(id, binding)
}

const handleResetShortcuts = () => {
  handleCancelRecording()
  resetShortcuts()
  feedback.value = { id: null, message: t('已恢复默认快捷键'), error: false }
}

onMounted(() => {
  window.addEventListener('keydown', handleRecordKeydown, true)
  window.addEventListener('blur', handleCancelRecording)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleRecordKeydown, true)
  window.removeEventListener('blur', handleCancelRecording)
})
</script>

<template>
  <section class="lume-shortcut-settings" aria-labelledby="shortcut-settings-title">
    <div>
      <h3 id="shortcut-settings-title" class="lume-shortcut-settings__title">
        {{ t('应用快捷键') }}
      </h3>
      <p class="lume-shortcut-settings__hint">
        {{
          t('自定义文件和视图等应用操作的快捷键，立即生效并自动保存。编辑器常用快捷键保持不变。')
        }}
      </p>
    </div>

    <label class="lume-shortcut-settings__search">
      <Search :size="15" :stroke-width="1.7" aria-hidden="true" />
      <input
        v-model="search"
        type="search"
        :placeholder="t('搜索命令或快捷键')"
        :aria-label="t('搜索命令或快捷键')"
      />
    </label>

    <p id="shortcut-recording-help" class="lume-shortcut-settings__hint">
      {{ t('点击快捷键后按下新的组合键。Esc 取消，Tab 移至下一项，Backspace 或 Delete 清除。') }}
    </p>

    <div
      id="shortcut-settings-feedback"
      class="lume-shortcut-settings__feedback"
      :class="{ 'lume-shortcut-settings__feedback--error': feedback?.error }"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ feedback?.message }}
    </div>

    <section
      v-for="group in shortcutGroups"
      :key="group.label"
      class="lume-shortcut-settings__group"
    >
      <h4 class="lume-shortcut-settings__group-title">{{ t(group.label) }}</h4>
      <div
        v-for="shortcut in group.shortcuts"
        :key="shortcut.id"
        class="lume-shortcut-settings__row"
      >
        <span :id="`shortcut-label-${shortcut.id}`" class="lume-shortcut-settings__label">
          {{ t(shortcut.label) }}
        </span>
        <div class="lume-shortcut-settings__controls">
          <button
            type="button"
            class="lume-shortcut-settings__recorder"
            :class="{
              'lume-shortcut-settings__recorder--active': recordingId === shortcut.id,
              'lume-shortcut-settings__recorder--empty': !bindings[shortcut.id],
            }"
            data-shortcut-recorder
            :aria-label="t('为「{0}」设置快捷键', t(shortcut.label))"
            :aria-pressed="recordingId === shortcut.id"
            :aria-describedby="
              feedback?.id === shortcut.id
                ? 'shortcut-recording-help shortcut-settings-feedback'
                : 'shortcut-recording-help'
            "
            @click="handleStartRecording(shortcut.id, $event)"
            @blur="handleCancelRecording"
          >
            <span v-if="recordingId === shortcut.id">{{ t('请按下组合键…') }}</span>
            <kbd v-else-if="bindings[shortcut.id]">{{ formatShortcut(bindings[shortcut.id]) }}</kbd>
            <span v-else>{{ t('未设置') }}</span>
          </button>
          <button
            type="button"
            class="lume-shortcut-settings__action"
            :disabled="!bindings[shortcut.id]"
            :title="t('清除「{0}」快捷键', t(shortcut.label))"
            :aria-label="t('清除「{0}」快捷键', t(shortcut.label))"
            @click="handleSetShortcut(shortcut.id, '')"
          >
            <X :size="14" :stroke-width="1.7" />
          </button>
          <button
            type="button"
            class="lume-shortcut-settings__action"
            :disabled="bindings[shortcut.id] === shortcut.defaultBinding"
            :title="t('恢复「{0}」默认快捷键', t(shortcut.label))"
            :aria-label="t('恢复「{0}」默认快捷键', t(shortcut.label))"
            @click="handleSetShortcut(shortcut.id, shortcut.defaultBinding)"
          >
            <RotateCcw :size="14" :stroke-width="1.7" />
          </button>
        </div>
      </div>
    </section>

    <p v-if="!shortcutGroups.length" class="lume-shortcut-settings__empty">
      {{ t('没有匹配的快捷键') }}
    </p>

    <button type="button" class="lume-shortcut-settings__reset" @click="handleResetShortcuts">
      <RotateCcw :size="14" :stroke-width="1.7" aria-hidden="true" />
      {{ t('恢复默认快捷键') }}
    </button>
  </section>
</template>

<style scoped>
.lume-shortcut-settings {
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-4);
}

.lume-shortcut-settings__title {
  margin: 0;
  font-size: var(--lume-font-size-base);
  font-weight: var(--lume-font-weight-semibold);
}

.lume-shortcut-settings__hint {
  margin: var(--lume-space-2) 0 0;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  line-height: var(--lume-line-height-normal);
}

.lume-shortcut-settings__search {
  display: flex;
  align-items: center;
  gap: var(--lume-space-3);
  min-height: 34px;
  padding: 0 var(--lume-space-3);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-tertiary);
}

.lume-shortcut-settings__search:focus-within {
  border-color: var(--lume-input-focus-border);
  background-color: var(--lume-input-focus-bg);
}

.lume-shortcut-settings__search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--lume-text-primary);
  font: inherit;
  font-size: var(--lume-font-size-sm);
}

.lume-shortcut-settings__search input::placeholder {
  color: var(--lume-text-tertiary);
}

.lume-shortcut-settings__feedback {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: 1.5em;
  background: var(--lume-bg-surface);
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-xs);
  line-height: var(--lume-line-height-normal);
}

.lume-shortcut-settings__feedback--error {
  color: var(--lume-color-danger);
}

.lume-shortcut-settings__group-title {
  margin: 0 0 var(--lume-space-2);
  padding-bottom: var(--lume-space-2);
  border-bottom: 1px solid var(--lume-border-subtle);
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-xs);
  font-weight: var(--lume-font-weight-medium);
}

.lume-shortcut-settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lume-space-4);
  min-height: 44px;
}

.lume-shortcut-settings__label {
  min-width: 0;
  font-size: var(--lume-font-size-sm);
}

.lume-shortcut-settings__controls {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--lume-space-2);
}

.lume-shortcut-settings__recorder {
  min-width: 136px;
  min-height: 30px;
  padding: var(--lume-space-1) var(--lume-space-3);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-xs);
  cursor: pointer;
}

.lume-shortcut-settings__recorder kbd {
  font-family: var(--lume-font-sans);
}

.lume-shortcut-settings__recorder--empty {
  color: var(--lume-text-tertiary);
}

.lume-shortcut-settings__recorder--active {
  border-color: var(--lume-input-focus-border);
  background-color: var(--lume-input-focus-bg);
  color: var(--lume-text-primary);
  font-weight: var(--lume-font-weight-medium);
}

.lume-shortcut-settings__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--lume-radius-sm);
  background: transparent;
  color: var(--lume-text-tertiary);
  cursor: pointer;
}

.lume-shortcut-settings__action:hover:not(:disabled) {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-shortcut-settings__action:disabled {
  opacity: 0.35;
  cursor: default;
}

.lume-shortcut-settings__reset {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: var(--lume-space-2);
  min-height: 30px;
  padding: 0 var(--lume-space-3);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  cursor: pointer;
}

.lume-shortcut-settings__reset:hover,
.lume-shortcut-settings__recorder:hover {
  border-color: var(--lume-border-strong);
  color: var(--lume-text-primary);
}

.lume-shortcut-settings__recorder:focus-visible {
  outline: none;
  border-color: var(--lume-input-focus-border);
  background-color: var(--lume-input-focus-bg);
}

.lume-shortcut-settings__action:focus-visible,
.lume-shortcut-settings__reset:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 2px;
}

.lume-shortcut-settings__empty {
  margin: var(--lume-space-4) 0;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-sm);
  text-align: center;
}

@container lume-settings-content (max-width: 420px) {
  .lume-shortcut-settings__row {
    flex-wrap: wrap;
    gap: var(--lume-space-2);
    padding: var(--lume-space-2) 0;
  }

  .lume-shortcut-settings__controls {
    margin-left: auto;
  }
}
</style>
