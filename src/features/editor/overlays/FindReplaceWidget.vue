<script setup lang="ts">
/** 查找替换浮层：管理输入、焦点和键盘交互，不直接依赖编辑器内核。 */
import { t } from '@/app/i18n'
import { vLiquidGlass } from '@/ui/glass/directive'
import { nextTick, ref, shallowRef, useId } from 'vue'
import { ChevronDown, ChevronRight, ChevronUp, Replace, ReplaceAll, X } from 'lucide-vue-next'

const replacementRowId = useId()

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
const replacementInput = ref<HTMLInputElement | null>(null)
const query = ref('')
const replacement = ref('')
const replacementExpanded = shallowRef(false)

function focus(select = false) {
  void nextTick(() => {
    findInput.value?.focus()
    if (select) findInput.value?.select()
  })
}

const handleToggleReplacement = () => {
  replacementExpanded.value = !replacementExpanded.value
  void nextTick(() => {
    const input = replacementExpanded.value ? replacementInput.value : findInput.value
    input?.focus()
  })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
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
  <div v-liquid-glass class="lume-find-replace" @keydown="handleKeydown">
    <div class="lume-find-replace__row">
      <button
        type="button"
        class="lume-find-replace__toggle"
        :title="t(replacementExpanded ? '收起替换' : '展开替换')"
        :aria-label="t(replacementExpanded ? '收起替换' : '展开替换')"
        :aria-expanded="replacementExpanded"
        :aria-controls="replacementRowId"
        @click="handleToggleReplacement"
      >
        <ChevronRight :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
      <div class="lume-find-replace__field">
        <input
          ref="findInput"
          v-model="query"
          class="lume-find-replace__input"
          type="text"
          :placeholder="t('查找')"
          :aria-label="t('查找')"
          @input="emit('find', query)"
        />
        <span v-if="query" class="lume-find-replace__count" role="status">
          {{ matchCount > 0 ? `${activeIndex + 1}/${matchCount}` : '0/0' }}
        </span>
      </div>
      <button
        type="button"
        :title="t('上一个')"
        :aria-label="t('上一个')"
        :disabled="matchCount === 0"
        @click="emit('move', -1, query)"
      >
        <ChevronUp :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        type="button"
        :title="t('下一个')"
        :aria-label="t('下一个')"
        :disabled="matchCount === 0"
        @click="emit('move', 1, query)"
      >
        <ChevronDown :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
      <button type="button" :title="t('关闭')" :aria-label="t('关闭')" @click="emit('close')">
        <X :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
    </div>
    <div
      v-show="replacementExpanded"
      :id="replacementRowId"
      class="lume-find-replace__row lume-find-replace__row--replacement"
    >
      <div class="lume-find-replace__field">
        <input
          ref="replacementInput"
          v-model="replacement"
          class="lume-find-replace__input"
          type="text"
          :placeholder="t('替换')"
          :aria-label="t('替换')"
        />
      </div>
      <button
        type="button"
        :title="t('替换')"
        :aria-label="t('替换')"
        :disabled="matchCount === 0"
        @click="emit('replace', query, replacement)"
      >
        <Replace :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        type="button"
        :title="t('全部替换')"
        :aria-label="t('全部替换')"
        :disabled="matchCount === 0"
        @click="emit('replaceAll', query, replacement)"
      >
        <ReplaceAll :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.lume-find-replace {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: var(--lume-z-tooltip);
  width: min(260px, calc(100% - 28px));
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--lume-glass-edge);
  border-radius: 10px;
  background-color: color-mix(in srgb, var(--lume-glass-overlay) 85%, transparent);
  background-image: var(--lume-glass-reflection);
  color: var(--lume-text-secondary);
  font-family: var(--lume-interface-font);
  box-shadow:
    inset 0 1px 0 var(--lume-glass-rim),
    0 10px 28px var(--lume-glass-depth),
    0 2px 6px var(--lume-glass-shadow);
  backdrop-filter: var(--lume-glass-filter, blur(4px)) blur(var(--lume-glass-popover-blur, 6px));
  -webkit-backdrop-filter: var(--lume-glass-filter, blur(4px))
    blur(var(--lume-glass-popover-blur, 6px));
}

@supports not (backdrop-filter: blur(1px)) {
  .lume-find-replace {
    background: var(--lume-bg-overlay);
  }
}

.lume-find-replace__row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.lume-find-replace__row--replacement {
  padding-left: 26px;
}

.lume-find-replace__field {
  min-width: 0;
  flex: 1;
  height: 28px;
  display: flex;
  align-items: center;
  border: 1px solid var(--lume-glass-edge);
  border-radius: 7px;
  background-color: color-mix(in srgb, var(--lume-bg-surface) 48%, transparent);
  box-shadow: inset 0 1px 2px rgb(0 0 0 / 5%);
}

.lume-find-replace__field:focus-within {
  border-color: var(--lume-input-focus-border);
  background-color: var(--lume-input-focus-bg);
}

.lume-find-replace__input {
  min-width: 0;
  width: 0;
  flex: 1;
  height: 100%;
  padding: 0 7px;
  border: 0;
  border-radius: inherit;
  outline: none;
  background: transparent;
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-sm);
}

.lume-find-replace__count {
  flex: none;
  padding-right: 6px;
  color: var(--lume-text-tertiary);
  font-size: calc(var(--lume-font-size-base) - 2px);
  text-align: center;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.lume-find-replace button {
  width: 24px;
  height: 24px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  white-space: nowrap;
  cursor: default;
}

.lume-find-replace__toggle[aria-expanded='true'] svg {
  transform: rotate(90deg);
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
