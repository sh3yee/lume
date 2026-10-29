<script setup lang="ts" generic="T extends string | number">
import { t } from '@/app/i18n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import { vLiquidGlass } from '@/ui/glass/directive'

const MENU_MAX_HEIGHT = 224
const MENU_GAP = 4
const MENU_INSET = 8

const props = defineProps<{
  id: string
  label: string
  description?: string
  value: T
  options: readonly { value: T; label: string; group?: string }[]
  container: HTMLDialogElement | null
  searchable?: boolean
  searchPlaceholder?: string
  maxMenuHeight?: number
  createOption?: (query: string) => { value: T; label: string; group?: string } | null
}>()

const emit = defineEmits<{
  change: [value: T]
  open: []
  close: []
  search: [query: string]
}>()

const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLDivElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const activeIndex = ref(0)
const query = ref('')
const menuPosition = ref({
  left: '0px',
  top: '0px',
  bottom: 'auto',
  width: '0px',
  maxHeight: '224px',
})
let searchText = ''
let lastSearchTime = 0

const selectedIndex = computed(() =>
  props.options.findIndex((option) => option.value === props.value),
)
const selectedLabel = computed(
  () => props.options[selectedIndex.value]?.label ?? String(props.value),
)
const filteredOptions = computed(() => {
  const search = props.searchable ? query.value.trim() : ''
  if (!search) return props.options
  const normalizedSearch = search.toLocaleLowerCase()
  const options = props.options.filter((option) =>
    option.label.toLocaleLowerCase().includes(normalizedSearch),
  )
  if (!props.options.some((option) => option.label.toLocaleLowerCase() === normalizedSearch)) {
    const option = props.createOption?.(search)
    if (option) options.push(option)
  }
  return options
})
const activeDescendant = computed(() =>
  isOpen.value && filteredOptions.value[activeIndex.value]
    ? `${props.id}-option-${activeIndex.value}`
    : undefined,
)

const handleClose = () => {
  if (!isOpen.value) return
  isOpen.value = false
  query.value = ''
  searchText = ''
  emit('close')
}

const scrollToActiveOption = () => {
  const option = listRef.value?.querySelector<HTMLElement>(
    `[data-option-index="${activeIndex.value}"]`,
  )
  option?.scrollIntoView({ block: 'nearest' })
}

const handleOpen = async (index = Math.max(0, selectedIndex.value), initialQuery = '') => {
  const trigger = triggerRef.value
  const container = props.container
  if (!trigger || !container?.open || (!props.searchable && props.options.length === 0)) return

  // 浮层留在 dialog 内，避开内容区裁剪，并按弹窗内部坐标定位。
  const bounds = container.getBoundingClientRect()
  const anchor = trigger.getBoundingClientRect()
  const originX = bounds.left + container.clientLeft
  const originY = bounds.top + container.clientTop
  const maxHeight = props.maxMenuHeight ?? MENU_MAX_HEIGHT
  const width = Math.min(anchor.width, Math.max(0, container.clientWidth - MENU_INSET * 2))
  const left = Math.max(
    MENU_INSET,
    Math.min(anchor.left - originX, container.clientWidth - width - MENU_INSET),
  )
  menuPosition.value = {
    left: `${left}px`,
    top: `${anchor.bottom - originY + MENU_GAP}px`,
    bottom: 'auto',
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
  }
  const wasOpen = isOpen.value
  isOpen.value = true
  if (!wasOpen) emit('open')
  query.value = initialQuery
  activeIndex.value = index
  await nextTick()
  const menu = menuRef.value
  if (!menu || !isOpen.value) return

  const below = Math.max(
    0,
    originY + container.clientHeight - MENU_INSET - anchor.bottom - MENU_GAP,
  )
  const above = Math.max(0, anchor.top - originY - MENU_INSET - MENU_GAP)
  const desiredHeight = Math.min(maxHeight, menu.scrollHeight + 2)
  const opensAbove = below < desiredHeight && above > below
  const height = Math.min(maxHeight, opensAbove ? above : below)

  menuPosition.value = {
    left: `${left}px`,
    top: opensAbove ? 'auto' : `${anchor.bottom - originY + MENU_GAP}px`,
    bottom: opensAbove ? `${container.clientHeight - (anchor.top - originY) + MENU_GAP}px` : 'auto',
    width: `${width}px`,
    maxHeight: `${height}px`,
  }
  await nextTick()
  if (!isOpen.value) return
  searchRef.value?.focus()
  scrollToActiveOption()
}

const handleToggle = () => {
  if (isOpen.value) handleClose()
  else void handleOpen()
}

const handleSelect = (index: number) => {
  const option = filteredOptions.value[index]
  if (!option) return
  emit('change', option.value)
  handleClose()
  triggerRef.value?.focus()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.isComposing) return
  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault()
    event.stopPropagation()
    handleClose()
    triggerRef.value?.focus()
    return
  }
  if (event.key === 'Tab') {
    handleClose()
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    if (isOpen.value) handleSelect(activeIndex.value)
    else void handleOpen()
    return
  }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()
    const last = filteredOptions.value.length - 1
    let index = Math.max(0, selectedIndex.value)
    if (event.key === 'Home') index = 0
    else if (event.key === 'End') index = last
    else if (isOpen.value)
      index = Math.max(0, Math.min(last, activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1)))
    if (!isOpen.value) void handleOpen(index)
    else {
      activeIndex.value = index
      void nextTick(scrollToActiveOption)
    }
    return
  }
  if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
  if (props.searchable) {
    event.preventDefault()
    void handleOpen(0, event.key)
    return
  }
  const now = Date.now()
  searchText = (now - lastSearchTime < 600 ? searchText : '') + event.key.toLowerCase()
  lastSearchTime = now
  const index = props.options.findIndex((option) =>
    option.label.toLowerCase().startsWith(searchText),
  )
  if (index < 0) return
  event.preventDefault()
  if (!isOpen.value) void handleOpen(index)
  else {
    activeIndex.value = index
    void nextTick(scrollToActiveOption)
  }
}

const handleSearchKeydown = (event: KeyboardEvent) => {
  if (event.isComposing) return
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    handleSelect(activeIndex.value)
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  event.stopPropagation()
  activeIndex.value = Math.max(
    0,
    Math.min(
      filteredOptions.value.length - 1,
      activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1),
    ),
  )
  void nextTick(scrollToActiveOption)
}

const handleMenuKeydown = (event: KeyboardEvent) => {
  if (event.isComposing) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    handleClose()
    triggerRef.value?.focus()
    return
  }
  if (event.key !== 'Tab') return
  const controls = Array.from(
    menuRef.value?.querySelectorAll<HTMLElement>(
      'input, button, select, textarea, a[href], [tabindex]',
    ) ?? [],
  ).filter(
    (element) =>
      element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0,
  )
  const boundary = event.shiftKey ? controls[0] : controls[controls.length - 1]
  if (boundary && document.activeElement !== boundary) return
  // 浮层在弹窗末尾，从边界回到触发器后交由浏览器继续原表单的 Tab 顺序。
  triggerRef.value?.focus()
  handleClose()
}

const handleOutsidePointerDown = (event: PointerEvent) => {
  const target = event.target as Node | null
  if (!triggerRef.value?.contains(target) && !menuRef.value?.contains(target)) handleClose()
}

const handleFocusIn = (event: FocusEvent) => {
  const target = event.target as Node | null
  if (!triggerRef.value?.contains(target) && !menuRef.value?.contains(target)) handleClose()
}

const handleScroll = (event: Event) => {
  if (!menuRef.value?.contains(event.target as Node | null)) handleClose()
}

watch(filteredOptions, (options) => {
  activeIndex.value = Math.max(
    0,
    options.findIndex((option) => option.value === props.value),
  )
  if (isOpen.value) void nextTick(scrollToActiveOption)
})

watch(query, (value) => emit('search', value), { flush: 'sync' })

watch(
  () => props.container,
  (container, previous) => {
    previous?.removeEventListener('close', handleClose)
    container?.addEventListener('close', handleClose)
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointerDown)
  document.addEventListener('focusin', handleFocusIn)
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleClose)
  window.addEventListener('blur', handleClose)
})

onBeforeUnmount(() => {
  props.container?.removeEventListener('close', handleClose)
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
  document.removeEventListener('focusin', handleFocusIn)
  window.removeEventListener('scroll', handleScroll, true)
  window.removeEventListener('resize', handleClose)
  window.removeEventListener('blur', handleClose)
})
</script>

<template>
  <div class="lume-settings-select">
    <div class="lume-settings-select__copy">
      <label :id="`${id}-label`" :for="id" class="lume-settings-select__label">{{ label }}</label>
      <p v-if="description" :id="`${id}-description`" class="lume-settings-select__description">
        {{ description }}
      </p>
    </div>
    <button
      :id="id"
      ref="triggerRef"
      class="lume-settings-select__trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-labelledby="`${id}-label`"
      :aria-describedby="description ? `${id}-description` : undefined"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? `${id}-listbox` : undefined"
      :aria-activedescendant="activeDescendant"
      @click="handleToggle"
      @keydown="handleKeydown"
    >
      <span class="lume-settings-select__value">{{ selectedLabel }}</span>
      <ChevronDown :size="14" aria-hidden="true" />
    </button>
    <Teleport v-if="isOpen && container" :to="container">
      <div
        ref="menuRef"
        v-liquid-glass
        class="lume-settings-select__menu"
        :style="menuPosition"
        @keydown="handleMenuKeydown"
      >
        <div v-if="searchable" class="lume-settings-select__search">
          <input
            ref="searchRef"
            v-model="query"
            class="lume-settings-select__search-input"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            :aria-label="t('搜索{0}', label)"
            :aria-controls="`${id}-listbox`"
            :aria-activedescendant="activeDescendant"
            :placeholder="searchPlaceholder ?? t('搜索选项')"
            @keydown="handleSearchKeydown"
          />
        </div>
        <div
          :id="`${id}-listbox`"
          ref="listRef"
          class="lume-settings-select__list"
          role="listbox"
          tabindex="-1"
          :aria-labelledby="`${id}-label`"
        >
          <template v-for="(option, index) in filteredOptions" :key="`${option.value}-${index}`">
            <div
              v-if="option.group && option.group !== filteredOptions[index - 1]?.group"
              class="lume-settings-select__group"
              role="presentation"
            >
              {{ option.group }}
            </div>
            <button
              :id="`${id}-option-${index}`"
              :data-option-index="index"
              class="lume-settings-select__option"
              :class="{ 'lume-settings-select__option--active': activeIndex === index }"
              type="button"
              role="option"
              tabindex="-1"
              :aria-selected="option.value === value"
              @pointerdown.prevent
              @pointermove="activeIndex = index"
              @click="handleSelect(index)"
            >
              <slot name="option" :option="option" :active="activeIndex === index">
                <span>{{ option.label }}</span>
              </slot>
              <Check v-if="option.value === value" :size="14" aria-hidden="true" />
            </button>
          </template>
        </div>
        <p v-if="filteredOptions.length === 0" class="lume-settings-select__empty">
          {{ t('没有匹配的选项') }}
        </p>
        <div v-if="$slots.footer" class="lume-settings-select__footer">
          <slot name="footer" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.lume-settings-select {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, var(--lume-settings-control-width, 220px));
  min-width: 0;
  min-height: 52px;
  align-items: center;
  gap: var(--lume-space-6);
  padding: var(--lume-space-3) 0;
}

.lume-settings-select__copy {
  min-width: 0;
}

.lume-settings-select__label {
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-sm);
  font-weight: var(--lume-font-weight-medium);
}

.lume-settings-select__description {
  margin: var(--lume-space-2) 0 0;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  line-height: var(--lume-line-height-normal);
  overflow-wrap: anywhere;
}

.lume-settings-select__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lume-space-3);
  min-width: 0;
  width: 100%;
  min-height: 34px;
  padding: 7px 10px;
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background: var(--lume-bg-surface);
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-sm);
  text-align: left;
}

.lume-settings-select__trigger:hover {
  border-color: var(--lume-border-strong);
}

.lume-settings-select__trigger[aria-expanded='true'],
.lume-settings-select__trigger:focus-visible {
  outline: none;
  border-color: var(--lume-input-focus-border);
  background-color: var(--lume-input-focus-bg);
}

.lume-settings-select__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lume-settings-select__trigger > svg {
  flex-shrink: 0;
  color: var(--lume-text-tertiary);
}

.lume-settings-select__menu {
  position: absolute;
  z-index: 1;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  overscroll-behavior: contain;
  padding: var(--lume-space-2);
  border: 1px solid var(--lume-glass-edge);
  border-radius: var(--lume-radius-md);
  background-color: color-mix(in srgb, var(--lume-bg-overlay) 82%, transparent);
  background-image: var(--lume-glass-reflection);
  backdrop-filter: var(--lume-glass-filter, blur(0px)) blur(12px);
  -webkit-backdrop-filter: var(--lume-glass-filter, blur(0px)) blur(12px);
  color: var(--lume-text-primary);
  box-shadow:
    inset 0 1px 0 var(--lume-glass-rim),
    0 8px 24px var(--lume-glass-depth),
    0 2px 6px var(--lume-glass-shadow);
}

@supports not (backdrop-filter: blur(1px)) {
  .lume-settings-select__menu {
    background: var(--lume-bg-overlay);
  }
}

@media (prefers-reduced-transparency: reduce) {
  .lume-settings-select__menu {
    background: var(--lume-bg-surface);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}

.lume-settings-select__search {
  flex-shrink: 0;
  padding: var(--lume-space-2);
  border-bottom: 1px solid var(--lume-border-subtle);
}

.lume-settings-select__search-input {
  width: 100%;
  min-height: 30px;
  padding: 5px var(--lume-space-2);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-sm);
  background: var(--lume-bg-surface);
  color: var(--lume-text-primary);
  font: inherit;
  font-size: var(--lume-font-size-sm);
}

.lume-settings-select__search-input:focus {
  outline: none;
  border-color: var(--lume-input-focus-border);
  background-color: var(--lume-input-focus-bg);
}

.lume-settings-select__list {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.lume-settings-select__group {
  padding: var(--lume-space-3) var(--lume-space-3) var(--lume-space-2);
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  font-weight: var(--lume-font-weight-medium);
}

.lume-settings-select__footer {
  flex-shrink: 0;
  padding: var(--lume-space-2);
  border-top: 1px solid var(--lume-border-subtle);
}

.lume-settings-select__empty {
  padding: var(--lume-space-3);
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-sm);
}

.lume-settings-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lume-space-3);
  width: 100%;
  min-height: 32px;
  padding: 6px var(--lume-space-3);
  border-radius: var(--lume-radius-sm);
  font-size: var(--lume-font-size-sm);
  text-align: left;
}

.lume-settings-select__option--active {
  background: var(--lume-accent-subtle);
}

.lume-settings-select__option[aria-selected='true'] {
  color: var(--lume-accent-default);
}

.lume-settings-select__option > svg {
  flex-shrink: 0;
}

@container lume-settings-content (max-width: 420px) {
  .lume-settings-select {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--lume-space-3);
  }
}
</style>
