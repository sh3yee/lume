import { ref, watch } from 'vue'

export type WritingWidth = 'compact' | 'comfortable' | 'wide'
export const WRITING_FONTS = {
  serif: 'var(--lume-font-serif)',
  sans: 'var(--lume-font-sans)',
  mono: 'var(--lume-font-mono)',
  song: '"SimSun", "Songti SC", serif',
  kai: '"KaiTi", "Kaiti SC", serif',
} as const
export type WritingFont = keyof typeof WRITING_FONTS

function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Keep session preferences. */
  }
}
function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  const number = value === null ? NaN : Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback
}

export function useWritingPreference() {
  const savedWidth = readPreference('lume-writing-width')
  const writingWidth = ref<WritingWidth>(
    savedWidth === 'compact' || savedWidth === 'wide' ? savedWidth : 'comfortable',
  )
  const savedFont = readPreference('lume-writing-font')
  const writingFont = ref<WritingFont>(
    savedFont && Object.hasOwn(WRITING_FONTS, savedFont) ? (savedFont as WritingFont) : 'serif',
  )
  const legacyScale = readPreference('lume-font-scale')
  const legacySize = legacyScale === 'small' ? 14 : legacyScale === 'large' ? 16 : 15
  const fontSize = ref(boundedNumber(readPreference('lume-writing-font-size'), legacySize, 12, 32))
  const lineHeight = ref(boundedNumber(readPreference('lume-writing-line-height'), 1.65, 1.2, 2.4))

  watch(
    [writingWidth, writingFont, fontSize, lineHeight],
    () => {
      const root = document.documentElement
      root.dataset.writingWidth = writingWidth.value
      root.style.setProperty('--lume-writing-font', WRITING_FONTS[writingFont.value])
      root.style.setProperty('--lume-writing-font-size', fontSize.value + 'px')
      root.style.setProperty('--lume-writing-line-height', String(lineHeight.value))
      savePreference('lume-writing-width', writingWidth.value)
      savePreference('lume-writing-font', writingFont.value)
      savePreference('lume-writing-font-size', String(fontSize.value))
      savePreference('lume-writing-line-height', String(lineHeight.value))
    },
    { immediate: true },
  )

  return { writingWidth, writingFont, fontSize, lineHeight }
}
