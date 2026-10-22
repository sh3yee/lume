import { ref, watch } from 'vue'
import { readPreference, savePreference } from '@/app/preferences/preferenceStorage'
import { en } from './en'

export type AppLanguage = 'zh-CN' | 'en'
export type MessageKey = keyof typeof en

const savedLanguage = readPreference('lume-language')
export const language = ref<AppLanguage>(savedLanguage === 'en' ? 'en' : 'zh-CN')
export const languageOptions: Array<{ value: AppLanguage; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
]

export const t = (key: MessageKey, ...values: Array<string | number>): string => {
  const message = language.value === 'en' ? en[key] : key
  return message.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    String(values[Number(index)] ?? placeholder),
  )
}

export const setLanguage = (value: string | number) => {
  if (value === 'zh-CN' || value === 'en') language.value = value
}

watch(
  language,
  (value) => {
    document.documentElement.lang = value
    savePreference('lume-language', value)
  },
  { immediate: true },
)
