import { t } from '@/app/i18n'
import { computed, ref } from 'vue'
import { listSystemFonts } from '@/platform/tauri/fonts'
import { isFontFamilyName, type FontPreference } from './fontFamily'

export interface FontOption {
  value: FontPreference
  label: string
}

export const PRESET_FONT_OPTIONS = computed<FontOption[]>(() => [
  { value: 'sans', label: t('系统默认字体') },
  { value: 'serif', label: t('默认衬线字体') },
  { value: 'song', label: t('宋体') },
  { value: 'kai', label: t('楷体') },
  { value: 'mono', label: t('等宽字体') },
])

export const createFontOption = (name: string): FontOption | null => {
  const family = name.trim()
  if (!isFontFamilyName(family)) return null
  return { value: `local:${family}`, label: t('使用“{0}”', family) }
}

export const useSystemFonts = () => {
  const families = ref<string[]>([])
  const loading = ref(false)
  const error = ref('')
  const loaded = ref(false)

  const options = computed<FontOption[]>(() => [
    ...PRESET_FONT_OPTIONS.value,
    ...families.value.map((family): FontOption => ({ value: `local:${family}`, label: family })),
  ])

  const ensureLoaded = async () => {
    if (loaded.value || loading.value) return
    loading.value = true
    error.value = ''
    try {
      families.value = await listSystemFonts()
      loaded.value = true
    } catch {
      error.value = t('暂时无法获取字体列表，仍可输入已安装字体名称。')
    } finally {
      loading.value = false
    }
  }

  return { families, options, loading, loaded, error, ensureLoaded }
}
