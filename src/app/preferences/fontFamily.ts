export const PRESET_FONTS = {
  serif: 'var(--lume-font-serif)',
  sans: 'var(--lume-font-sans)',
  mono: 'var(--lume-font-mono)',
  song: '"SimSun", "Songti SC", serif',
  kai: '"KaiTi", "Kaiti SC", serif',
} as const

export type FontPreference = keyof typeof PRESET_FONTS | `local:${string}`

export const isFontPreference = (value: unknown): value is FontPreference => {
  if (typeof value !== 'string') return false
  if (Object.hasOwn(PRESET_FONTS, value)) return true
  return value.startsWith('local:') && isFontFamilyName(value.slice(6))
}

export const resolveFontFamily = (value: FontPreference) => {
  if (!value.startsWith('local:')) return PRESET_FONTS[value as keyof typeof PRESET_FONTS]
  return `${quoteFontFamily(value.slice(6))}, var(--lume-font-sans)`
}
import { isFontFamilyName, quoteFontFamily } from '@/utils/fontFamily'

export { isFontFamilyName } from '@/utils/fontFamily'
