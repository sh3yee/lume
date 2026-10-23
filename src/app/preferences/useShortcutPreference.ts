import { computed, ref, watch } from 'vue'
import { t } from '@/app/i18n'
import {
  createDefaultShortcuts,
  formatShortcut,
  getShortcutValidationError,
  normalizeShortcut,
  SHORTCUT_DEFINITIONS,
  shortcutFromEvent,
  type ShortcutBindings,
  type ShortcutId,
} from '@/app/commands/shortcuts'
import { readPreference, savePreference } from './preferenceStorage'

const STORAGE_KEY = 'lume-shortcuts'

const loadShortcuts = (): ShortcutBindings => {
  const defaults = createDefaultShortcuts()
  const saved = readPreference(STORAGE_KEY)
  if (!saved) return defaults
  try {
    const value: unknown = JSON.parse(saved)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
    const savedBindings = value as Record<string, unknown>
    // 旧版将新建拆成两个命令，合并后统一使用 Ctrl+T。
    if ('new-tab' in savedBindings) savedBindings['new-file'] = defaults['new-file']
    const bindings = { ...defaults }
    for (const { id } of SHORTCUT_DEFINITIONS) {
      const binding = normalizeShortcut(savedBindings[id])
      if (binding !== null && !getShortcutValidationError(binding)) bindings[id] = binding
    }
    const assigned = Object.values(bindings).filter(Boolean)
    // 损坏或外部修改的配置不能让同一按键触发不同命令。
    return new Set(assigned).size === assigned.length ? bindings : defaults
  } catch {
    return defaults
  }
}

const shortcutBindings = ref<ShortcutBindings>(loadShortcuts())
const bindings = computed(() => shortcutBindings.value)

export const getShortcutCommand = (event: KeyboardEvent): ShortcutId | null => {
  const binding = shortcutFromEvent(event)
  if (!binding) return null
  return SHORTCUT_DEFINITIONS.find(({ id }) => shortcutBindings.value[id] === binding)?.id ?? null
}

export const getShortcutHint = (id: ShortcutId): string =>
  formatShortcut(shortcutBindings.value[id])

const setShortcut = (id: ShortcutId, value: string): string | null => {
  const error = getShortcutValidationError(value)
  if (error) return t(error)
  const binding = normalizeShortcut(value)!
  const conflict =
    binding &&
    SHORTCUT_DEFINITIONS.find(
      (command) => command.id !== id && shortcutBindings.value[command.id] === binding,
    )
  if (conflict) return t('该快捷键已用于「{0}」', t(conflict.label))
  shortcutBindings.value = { ...shortcutBindings.value, [id]: binding }
  return null
}

const resetShortcuts = () => {
  shortcutBindings.value = createDefaultShortcuts()
}

watch(shortcutBindings, (value) => savePreference(STORAGE_KEY, JSON.stringify(value)), {
  immediate: true,
  flush: 'sync',
})

export const useShortcutPreference = () => ({
  bindings,
  getShortcutHint,
  setShortcut,
  resetShortcuts,
})
