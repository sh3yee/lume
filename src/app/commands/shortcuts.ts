import type { MessageKey } from '@/app/i18n'

export const SHORTCUT_DEFINITIONS = [
  { id: 'new-file', label: '新建文档', group: '文件', defaultBinding: 'Mod+T' },
  { id: 'open-file', label: '打开文件', group: '文件', defaultBinding: 'Mod+O' },
  { id: 'save-file', label: '保存', group: '文件', defaultBinding: 'Mod+S' },
  { id: 'save-file-as', label: '另存为', group: '文件', defaultBinding: 'Mod+Shift+S' },
  { id: 'close-document', label: '关闭当前文档', group: '文件', defaultBinding: 'Mod+W' },
  { id: 'insertImage', label: '插入图片', group: '编辑', defaultBinding: 'Mod+Shift+I' },
  { id: 'toggle-sidebar', label: '切换文件栏', group: '视图', defaultBinding: 'Mod+Shift+E' },
  { id: 'toggle-inspector', label: '切换大纲', group: '视图', defaultBinding: 'Mod+Shift+O' },
  { id: 'toggle-view-mode', label: '切换编辑模式', group: '视图', defaultBinding: '' },
  { id: 'toggle-focus-mode', label: '切换专注模式', group: '视图', defaultBinding: '' },
  { id: 'open-command-palette', label: '命令面板', group: '应用快捷键', defaultBinding: 'Mod+P' },
  { id: 'toggle-settings', label: '偏好设置', group: '应用快捷键', defaultBinding: 'Mod+,' },
] as const satisfies ReadonlyArray<{
  id: string
  label: MessageKey
  group: MessageKey
  defaultBinding: string
}>

export type ShortcutId = (typeof SHORTCUT_DEFINITIONS)[number]['id']
export type ShortcutBindings = Record<ShortcutId, string>

const MODIFIERS = ['Mod', 'Alt', 'Shift']
const NAMED_KEYS = new Set([
  'Tab',
  'Enter',
  'Space',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])
const PUNCTUATION_KEYS: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
}
const RESERVED_SHORTCUTS = new Set([
  'Mod+A',
  'Mod+B',
  'Mod+C',
  'Mod+D',
  'Mod+E',
  'Mod+F',
  'Mod+G',
  'Mod+H',
  'Mod+I',
  'Mod+J',
  'Mod+K',
  'Mod+L',
  'Mod+M',
  'Mod+U',
  'Mod+V',
  'Mod+X',
  'Mod+Y',
  'Mod+Z',
  'Mod+/',
  'Mod+[',
  'Mod+]',
  'Mod+-',
  'Mod+=',
  'Mod+Shift+B',
  'Mod+Shift+F',
  'Mod+Shift+G',
  'Mod+Shift+K',
  'Mod+Shift+L',
  'Mod+Shift+U',
  'Mod+Shift+V',
  'Mod+Shift+Z',
  'Mod+Shift+[',
  'Mod+Shift+]',
  'Mod+Shift+\\',
  'Mod+Alt+0',
  'Mod+Alt+1',
  'Mod+Alt+2',
  'Mod+Alt+3',
  'Mod+Alt+4',
  'Mod+Alt+5',
  'Mod+Alt+6',
  'Mod+Alt+7',
  'Mod+Alt+8',
  'Mod+Alt+C',
  'Mod+Alt+X',
  'Mod+Alt+\\',
  'Alt+A',
  'Alt+Shift+A',
  'Alt+L',
  'Alt+U',
  'Alt+Shift+M',
  'Alt+F10',
])

const isShortcutKey = (key: string) =>
  /^[A-Z0-9]$/.test(key) ||
  /^F([1-9]|1[0-2])$/.test(key) ||
  Object.values(PUNCTUATION_KEYS).includes(key) ||
  NAMED_KEYS.has(key)

export const createDefaultShortcuts = (): ShortcutBindings =>
  Object.fromEntries(
    SHORTCUT_DEFINITIONS.map(({ id, defaultBinding }) => [id, defaultBinding]),
  ) as ShortcutBindings

export const normalizeShortcut = (value: unknown): string | null => {
  if (value === '') return ''
  if (typeof value !== 'string') return null
  const parts = value.split('+')
  const key = parts.pop() ?? ''
  if (!isShortcutKey(key) || parts.some((part) => !MODIFIERS.includes(part))) return null
  if (new Set(parts).size !== parts.length) return null
  return [...MODIFIERS.filter((modifier) => parts.includes(modifier)), key].join('+')
}

export const shortcutFromEvent = (event: KeyboardEvent): string | null => {
  if (event.isComposing || event.keyCode === 229 || event.getModifierState?.('AltGraph'))
    return null
  if (event.ctrlKey && event.metaKey) return null
  const key =
    PUNCTUATION_KEYS[event.code] ??
    (/^Digit[0-9]$/.test(event.code) ? event.code.slice(5) : null) ??
    (event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key)
  if (!isShortcutKey(key)) return null
  return [
    ...(event.ctrlKey || event.metaKey ? ['Mod'] : []),
    ...(event.altKey ? ['Alt'] : []),
    ...(event.shiftKey ? ['Shift'] : []),
    key,
  ].join('+')
}

export const getShortcutValidationError = (binding: string): MessageKey | null => {
  const normalized = normalizeShortcut(binding)
  if (normalized === '') return null
  if (
    !normalized ||
    (!normalized.includes('Mod+') &&
      !normalized.includes('Alt+') &&
      !/^((Shift)\+)?F([1-9]|1[0-2])$/.test(normalized))
  ) {
    return '请使用 Ctrl、Command 或 Alt 组合键，或 F1–F12。'
  }
  const key = normalized.split('+').pop() ?? ''
  // 保留编辑器的剪贴板、格式、选区和光标操作，避免全局命令抢占。
  if (RESERVED_SHORTCUTS.has(normalized) || NAMED_KEYS.has(key)) {
    return '该快捷键用于编辑操作，请选择其他组合。'
  }
  return null
}

export const formatShortcut = (binding: string): string =>
  binding.replace(/^Mod(?=\+)/, /Mac/i.test(navigator.platform) ? 'Cmd' : 'Ctrl')
