import { reactive, watch } from 'vue'

export const MARKDOWN_EXTENSION_DEFAULTS = {
  highlight: false,
  subscript: false,
  superscript: false,
  inlineMath: true,
  mermaid: true,
  autoLink: true,
  emoji: true,
  githubAlerts: true,
}

export type MarkdownExtension = keyof typeof MARKDOWN_EXTENSION_DEFAULTS
export type EmojiCompletion = 'manual' | 'auto'
export interface MarkdownPreferences {
  enabled: Record<MarkdownExtension, boolean>
  emojiCompletion: EmojiCompletion
}

const MARKDOWN_PREFERENCES_KEY = 'lume-markdown-preferences'
const LEGACY_GITHUB_ALERTS_KEY = 'lume-github-alerts'

const getInitialPreferences = (): MarkdownPreferences => {
  const preferences: MarkdownPreferences = {
    enabled: { ...MARKDOWN_EXTENSION_DEFAULTS },
    emojiCompletion: 'manual',
  }

  try {
    preferences.enabled.githubAlerts = localStorage.getItem(LEGACY_GITHUB_ALERTS_KEY) !== 'false'
    const saved: unknown = JSON.parse(localStorage.getItem(MARKDOWN_PREFERENCES_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return preferences

    if ('enabled' in saved && saved.enabled && typeof saved.enabled === 'object') {
      const enabled = saved.enabled as Record<string, unknown>
      for (const extension of Object.keys(preferences.enabled) as MarkdownExtension[]) {
        const value = enabled[extension]
        if (typeof value === 'boolean') preferences.enabled[extension] = value
      }
    }
    if (
      'emojiCompletion' in saved &&
      (saved.emojiCompletion === 'manual' || saved.emojiCompletion === 'auto')
    ) {
      preferences.emojiCompletion = saved.emojiCompletion
    }
  } catch {
    // 无法读取本地配置时保留默认值，或已读取的旧版提示块设置。
  }

  return preferences
}

export const markdownPreferences = reactive<MarkdownPreferences>(getInitialPreferences())

watch(
  markdownPreferences,
  (preferences) => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.githubAlerts = String(preferences.enabled.githubAlerts)
    }
    try {
      localStorage.setItem(MARKDOWN_PREFERENCES_KEY, JSON.stringify(preferences))
      localStorage.setItem(LEGACY_GITHUB_ALERTS_KEY, String(preferences.enabled.githubAlerts))
    } catch {
      // 存储不可用时，当前会话的设置仍然立即生效。
    }
  },
  { deep: true, immediate: true, flush: 'sync' },
)
