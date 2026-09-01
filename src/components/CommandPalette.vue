<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CommandPaletteItem } from '@/app/commands/useCommandPalette'

const props = defineProps<{
  open: boolean
  items: CommandPaletteItem[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', id: string): void
}>()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const filteredItems = computed(() => {
  const value = query.value.trim().toLowerCase()
  if (!value) return props.items
  return props.items.filter((item) => {
    const haystack = `${item.label} ${item.hint ?? ''} ${item.group ?? ''}`.toLowerCase()
    return haystack.includes(value)
  })
})

watch(
  () => props.open,
  (open) => {
    if (!open) {
      query.value = ''
      activeIndex.value = 0
      return
    }
    void nextTick(() => inputRef.value?.focus())
  },
)

watch(
  () => filteredItems.value.length,
  () => {
    activeIndex.value = 0
  },
)

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }

  if (event.key === 'ArrowDown' || event.key === 'Tab') {
    event.preventDefault()
    if (event.shiftKey && event.key === 'Tab') {
      activeIndex.value = (activeIndex.value - 1 + Math.max(filteredItems.value.length, 1)) % Math.max(filteredItems.value.length, 1)
      return
    }
    activeIndex.value = (activeIndex.value + 1) % Math.max(filteredItems.value.length, 1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + Math.max(filteredItems.value.length, 1)) % Math.max(filteredItems.value.length, 1)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    const item = filteredItems.value[activeIndex.value]
    if (item) emit('select', item.id)
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="lume-command-palette" @mousedown="emit('close')">
      <div class="lume-command-palette__panel" role="dialog" aria-modal="true" aria-label="命令面板" @mousedown.stop>
        <div class="lume-command-palette__header">
          <input
            ref="inputRef"
            v-model="query"
            class="lume-command-palette__input"
            type="text"
            placeholder="搜索命令或动作..."
            autocomplete="off"
          />
        </div>

        <div class="lume-command-palette__list" role="listbox" aria-label="可用命令">
          <button
            v-for="(item, index) in filteredItems"
            :key="item.id"
            type="button"
            role="option"
            :aria-selected="activeIndex === index"
            class="lume-command-palette__item"
            :class="{ 'lume-command-palette__item--active': activeIndex === index }"
            @click="emit('select', item.id)"
          >
            <span class="lume-command-palette__label">{{ item.label }}</span>
            <span v-if="item.hint" class="lume-command-palette__hint">{{ item.hint }}</span>
          </button>

          <div v-if="filteredItems.length === 0" class="lume-command-palette__empty">
            没有匹配的命令
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.lume-command-palette {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 110px;
  background: rgba(12, 12, 12, 0.24);
  backdrop-filter: blur(8px);
}

.lume-command-palette__panel {
  width: min(560px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--lume-border-default) 75%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--lume-bg-surface) 96%, transparent);
  box-shadow: var(--lume-shadow-xl);
}

.lume-command-palette__header {
  padding: 12px 12px 8px;
  border-bottom: 1px solid var(--lume-border-subtle);
  background: color-mix(in srgb, var(--lume-bg-surface-raised) 70%, transparent);
}

.lume-command-palette__input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--lume-border-default);
  border-radius: 10px;
  background: var(--lume-bg-surface);
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-md);
}

.lume-command-palette__input:focus {
  outline: 2px solid color-mix(in srgb, var(--lume-accent-default) 42%, transparent);
  outline-offset: 2px;
}

.lume-command-palette__list {
  display: flex;
  flex-direction: column;
  max-height: min(420px, 60vh);
  overflow-y: auto;
  padding: 8px;
}

.lume-command-palette__item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--lume-text-primary);
  text-align: left;
  cursor: pointer;
}

.lume-command-palette__item:hover,
.lume-command-palette__item--active {
  border-color: color-mix(in srgb, var(--lume-accent-default) 30%, transparent);
  background: color-mix(in srgb, var(--lume-accent-default) 9%, transparent);
}

.lume-command-palette__label {
  font-size: var(--lume-font-size-sm);
}

.lume-command-palette__hint {
  color: var(--lume-text-tertiary);
  font-size: 11px;
}

.lume-command-palette__empty {
  padding: 14px 8px 6px;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-sm);
}
</style>
