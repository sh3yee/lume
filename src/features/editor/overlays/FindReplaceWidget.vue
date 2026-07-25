<script setup lang="ts">
/** 查找替换浮层：管理输入、焦点和键盘交互，不直接依赖编辑器内核。 */
import { nextTick, ref } from 'vue'
import { ChevronDown, ChevronUp, X } from 'lucide-vue-next'

defineProps<{
  activeIndex: number
  matchCount: number
}>()

const emit = defineEmits<{
  close: []
  find: [query: string]
  move: [direction: 1 | -1, query: string]
  replace: [query: string, replacement: string]
  replaceAll: [query: string, replacement: string]
}>()

const findInput = ref<HTMLInputElement | null>(null)
const query = ref('')
const replacement = ref('')

function focus(select = false) {
  void nextTick(() => {
    findInput.value?.focus()
    if (select) findInput.value?.select()
  })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('move', event.shiftKey ? -1 : 1, query.value)
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

defineExpose({ focus })
</script>

<template>
  <div class="lume-find-replace" @keydown="handleKeydown">
    <div class="lume-find-replace__row">
      <input
        ref="findInput"
        v-model="query"
        class="lume-find-replace__input"
        type="text"
        placeholder="查找"
        @input="emit('find', query)"
      />
      <span class="lume-find-replace__count">
        {{ matchCount > 0 ? `${activeIndex + 1} / ${matchCount}` : '0 / 0' }}
      </span>
      <button type="button" title="上一个" aria-label="上一个" :disabled="matchCount === 0" @click="emit('move', -1, query)">
        <ChevronUp :size="14" :stroke-width="2" />
      </button>
      <button type="button" title="下一个" aria-label="下一个" :disabled="matchCount === 0" @click="emit('move', 1, query)">
        <ChevronDown :size="14" :stroke-width="2" />
      </button>
      <button type="button" title="关闭" aria-label="关闭" @click="emit('close')">
        <X :size="14" :stroke-width="2" />
      </button>
    </div>
    <div class="lume-find-replace__row">
      <input
        v-model="replacement"
        class="lume-find-replace__input"
        type="text"
        placeholder="替换"
      />
      <button type="button" :disabled="matchCount === 0" @click="emit('replace', query, replacement)">
        替换
      </button>
      <button type="button" :disabled="matchCount === 0" @click="emit('replaceAll', query, replacement)">
        全部替换
      </button>
    </div>
  </div>
</template>

<style scoped>
.lume-find-replace {
  position: absolute;
  top: 14px;
  right: 18px;
  z-index: var(--lume-z-tooltip);
  width: 348px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 9px;
  border: 1px solid color-mix(in srgb, var(--lume-border-subtle) 70%, transparent);
  border-radius: 12px;
  background-color: color-mix(in srgb, var(--lume-bg-overlay) 82%, transparent);
  color: var(--lume-text-secondary);
  box-shadow: 0 18px 48px rgb(0 0 0 / 16%), 0 2px 8px rgb(0 0 0 / 8%), inset 0 1px 0 rgb(255 255 255 / 18%);
  backdrop-filter: blur(28px) saturate(1.35);
}

.lume-find-replace__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.lume-find-replace__input {
  min-width: 0;
  flex: 1;
  height: 28px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--lume-border-subtle) 84%, transparent);
  border-radius: 7px;
  background-color: color-mix(in srgb, var(--lume-bg-surface-raised) 86%, transparent);
  color: var(--lume-text-primary);
  font-size: 13px;
  box-shadow: inset 0 1px 2px rgb(0 0 0 / 5%);
}

.lume-find-replace__input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--lume-accent-default) 72%, var(--lume-border-subtle));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lume-accent-default) 16%, transparent), inset 0 1px 2px rgb(0 0 0 / 5%);
}

.lume-find-replace__count {
  width: 52px;
  color: var(--lume-text-tertiary);
  font-size: 12px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.lume-find-replace button {
  height: 28px;
  min-width: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--lume-text-secondary);
  font-size: 13px;
  cursor: default;
}

.lume-find-replace button:hover:not(:disabled),
.lume-find-replace button:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--lume-border-subtle) 72%, transparent);
  background-color: color-mix(in srgb, var(--lume-text-primary) 7%, transparent);
  color: var(--lume-text-primary);
}

.lume-find-replace button:disabled {
  color: var(--lume-text-disabled);
}

.lume-find-replace svg {
  flex: none;
}
</style>