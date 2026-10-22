<script setup lang="ts">
import { computed, ref } from 'vue'
import { resolveFontFamily, type FontPreference } from '@/app/preferences/fontFamily'
import { useRecentFonts } from '@/app/preferences/useRecentFonts'
import {
  createFontOption,
  PRESET_FONT_OPTIONS,
  type FontOption,
} from '@/app/preferences/useSystemFonts'
import SettingsSelect from './SettingsSelect.vue'

type GroupedFontOption = FontOption & { group?: string }

const props = defineProps<{
  id: string
  label: string
  value: FontPreference
  options: FontOption[]
  container: HTMLDialogElement | null
  status?: string
}>()

const emit = defineEmits<{
  change: [value: FontPreference]
  open: []
}>()

const query = ref('')
const showAll = ref(false)
const { recentFonts, rememberFont } = useRecentFonts()

const recentOptions = computed<FontOption[]>(() =>
  recentFonts.value.map(
    (value) =>
      props.options.find((option) => option.value === value) ?? {
        value,
        label: value.startsWith('local:')
          ? value.slice(6)
          : (PRESET_FONT_OPTIONS.find((option) => option.value === value)?.label ?? value),
      },
  ),
)
const allOptions = computed<FontOption[]>(() => {
  const options = [...props.options]
  const current: FontOption = {
    value: props.value,
    label: props.value.startsWith('local:')
      ? props.value.slice(6)
      : (PRESET_FONT_OPTIONS.find((option) => option.value === props.value)?.label ?? props.value),
  }
  for (const option of [...recentOptions.value, current]) {
    if (!options.some((candidate) => candidate.value === option.value)) options.push(option)
  }
  return options
})
const visibleOptions = computed<GroupedFontOption[]>(() => {
  if (query.value.trim()) return allOptions.value
  if (showAll.value) {
    return allOptions.value.map((option) => ({
      ...option,
      group: PRESET_FONT_OPTIONS.some((preset) => preset.value === option.value)
        ? '默认字体'
        : '系统字体',
    }))
  }

  const options: GroupedFontOption[] = []
  const suggested = [...recentOptions.value, ...PRESET_FONT_OPTIONS]
  const current = allOptions.value.find((option) => option.value === props.value)
  if (current && !suggested.some((option) => option.value === current.value)) {
    options.push({ ...current, group: '当前字体' })
  }
  for (const [group, candidates] of [
    ['最近使用', recentOptions.value],
    ['常用字体', PRESET_FONT_OPTIONS],
  ] as const) {
    for (const option of candidates) {
      if (!options.some((candidate) => candidate.value === option.value))
        options.push({ ...option, group })
    }
  }
  return options
})

const handleOpen = () => {
  query.value = ''
  showAll.value = false
  emit('open')
}

const handleClose = () => {
  query.value = ''
  showAll.value = false
}

const handleSelect = (value: FontPreference) => {
  rememberFont(value)
  emit('change', value)
}
</script>

<template>
  <SettingsSelect
    :id="id"
    :label="label"
    :value="value"
    :options="visibleOptions"
    :container="container"
    searchable
    search-placeholder="输入字体名称"
    :max-menu-height="360"
    :create-option="createFontOption"
    @open="handleOpen"
    @close="handleClose"
    @search="query = $event"
    @change="handleSelect"
  >
    <template #option="{ option, active }">
      <span class="lume-font-select__option">
        <span class="lume-font-select__name" :title="option.label">{{ option.label }}</span>
        <span
          v-if="active"
          class="lume-font-select__sample"
          :style="{ fontFamily: resolveFontFamily(option.value) }"
          aria-hidden="true"
          >Aa 字</span
        >
      </span>
    </template>
    <template #footer>
      <span v-if="status" class="lume-font-select__hint" role="status">{{ status }}</span>
      <span v-if="query.trim()" class="lume-font-select__hint">按 Enter 确认字体</span>
      <button
        v-else
        class="lume-font-select__browse"
        type="button"
        @pointerdown.prevent
        @click="showAll = !showAll"
      >
        {{ showAll ? '返回常用字体' : '浏览全部字体' }}
      </button>
    </template>
  </SettingsSelect>
</template>

<style scoped>
.lume-font-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lume-space-4);
  min-width: 0;
  flex: 1;
}

.lume-font-select__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lume-font-select__sample {
  flex-shrink: 0;
  color: var(--lume-text-secondary);
  font-size: 18px;
}

.lume-font-select__browse {
  width: 100%;
  padding: var(--lume-space-3);
  border-radius: var(--lume-radius-sm);
  color: var(--lume-accent-default);
  font-size: var(--lume-font-size-sm);
  text-align: left;
}

.lume-font-select__browse:hover,
.lume-font-select__browse:focus-visible {
  background: var(--lume-accent-subtle);
}

.lume-font-select__hint {
  display: block;
  padding: var(--lume-space-3);
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
}
</style>
