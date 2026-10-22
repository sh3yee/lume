import { ref, watch } from 'vue'
import { isFontPreference, resolveFontFamily, type FontPreference } from './fontFamily'
import { boundedNumber, readPreference, savePreference } from './preferenceStorage'

export type WritingWidth = 'compact' | 'comfortable' | 'wide'
export type WritingFont = FontPreference

export function useWritingPreference() {
  const savedWidth = readPreference('lume-writing-width')
  const writingWidth = ref<WritingWidth>(
    savedWidth === 'compact' || savedWidth === 'wide' ? savedWidth : 'comfortable',
  )
  const savedFont = readPreference('lume-writing-font')
  const writingFont = ref<WritingFont>(isFontPreference(savedFont) ? savedFont : 'serif')
  const legacyScale = readPreference('lume-font-scale')
  const legacySize = legacyScale === 'small' ? 14 : legacyScale === 'large' ? 16 : 15
  const fontSize = ref(boundedNumber(readPreference('lume-writing-font-size'), legacySize, 12, 32))
  const lineHeight = ref(boundedNumber(readPreference('lume-writing-line-height'), 1.65, 1.2, 2.4))

  watch(
    [writingWidth, writingFont, fontSize, lineHeight],
    () => {
      const root = document.documentElement
      root.dataset.writingWidth = writingWidth.value
      root.style.setProperty('--lume-writing-font', resolveFontFamily(writingFont.value))
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
