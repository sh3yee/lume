import { ref } from 'vue'
import { isFontPreference, type FontPreference } from './fontFamily'
import { readPreference, savePreference } from './preferenceStorage'

const STORAGE_KEY = 'lume-recent-fonts'
const MAX_RECENT_FONTS = 5

const readRecentFonts = (): FontPreference[] => {
  try {
    const saved: unknown = JSON.parse(readPreference(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return [...new Set(saved.filter(isFontPreference))].slice(0, MAX_RECENT_FONTS)
  } catch {
    return []
  }
}

const recentFonts = ref<FontPreference[]>(readRecentFonts())

export const useRecentFonts = () => {
  const rememberFont = (value: FontPreference) => {
    if (!isFontPreference(value)) return
    recentFonts.value = [value, ...recentFonts.value.filter((font) => font !== value)].slice(
      0,
      MAX_RECENT_FONTS,
    )
    savePreference(STORAGE_KEY, JSON.stringify(recentFonts.value))
  }

  return { recentFonts, rememberFont }
}
