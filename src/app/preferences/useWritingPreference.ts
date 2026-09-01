/**
 * useWritingPreference - 写作偏好
 *
 * 负责正文宽度和正文字号的前端配置，避免把这些设置耦合进编辑器或 Rust 层。
 */
import { ref, watch } from 'vue'

export type WritingWidth = 'compact' | 'comfortable' | 'wide'
export type FontScale = 'small' | 'medium' | 'large'

const WRITING_WIDTH_KEY = 'lume-writing-width'
const FONT_SCALE_KEY = 'lume-font-scale'

function getInitialWritingWidth(): WritingWidth {
  const saved = localStorage.getItem(WRITING_WIDTH_KEY)
  return saved === 'compact' || saved === 'comfortable' || saved === 'wide' ? saved : 'comfortable'
}

function getInitialFontScale(): FontScale {
  const saved = localStorage.getItem(FONT_SCALE_KEY)
  return saved === 'small' || saved === 'medium' || saved === 'large' ? saved : 'medium'
}

export function useWritingPreference() {
  const writingWidth = ref<WritingWidth>(getInitialWritingWidth())
  const fontScale = ref<FontScale>(getInitialFontScale())

  function applyWritingPreferences() {
    document.documentElement.dataset.writingWidth = writingWidth.value
    document.documentElement.dataset.fontScale = fontScale.value
  }

  watch(writingWidth, (value) => {
    localStorage.setItem(WRITING_WIDTH_KEY, value)
    applyWritingPreferences()
  }, { immediate: true })

  watch(fontScale, (value) => {
    localStorage.setItem(FONT_SCALE_KEY, value)
    applyWritingPreferences()
  }, { immediate: true })

  return { writingWidth, fontScale }
}
