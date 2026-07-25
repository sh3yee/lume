/**
 * useThemePreference - 应用主题偏好
 *
 * 管理主题偏好的读取、持久化、系统主题监听和根元素主题应用。
 */
import { onBeforeUnmount, ref, watch } from 'vue'

export type ThemePreference = 'system' | 'light' | 'dark' | 'glass'
export type ResolvedTheme = 'light' | 'dark' | 'glass'

const THEME_STORAGE_KEY = 'lume-theme'

/** 读取已保存的主题偏好，无有效记录时跟随系统。 */
function getInitialTheme(): ThemePreference {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
  return savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'glass' || savedTheme === 'system'
    ? savedTheme
    : 'system'
}

export function useThemePreference() {
  const themePreference = ref<ThemePreference>(getInitialTheme())
  const resolvedTheme = ref<ResolvedTheme>('light')
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')

  /** 将主题偏好解析为实际主题并应用到根元素。 */
  function applyTheme() {
    resolvedTheme.value = themePreference.value === 'system'
      ? systemTheme.matches ? 'dark' : 'light'
      : themePreference.value
    document.documentElement.dataset.theme = resolvedTheme.value
  }

  function handleSystemThemeChange() {
    if (themePreference.value === 'system') applyTheme()
  }

  watch(themePreference, (theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    applyTheme()
  }, { immediate: true })

  systemTheme.addEventListener('change', handleSystemThemeChange)

  onBeforeUnmount(() => {
    systemTheme.removeEventListener('change', handleSystemThemeChange)
  })

  return { themePreference, resolvedTheme }
}