import { ref, watch } from 'vue'
import { isFontPreference, resolveFontFamily, type FontPreference } from './fontFamily'
import { boundedNumber, readPreference, savePreference } from './preferenceStorage'

const savedFont = readPreference('lume-interface-font')
const interfaceFont = ref<FontPreference>(isFontPreference(savedFont) ? savedFont : 'sans')
const interfaceFontSize = ref(boundedNumber(readPreference('lume-interface-font-size'), 14, 12, 20))
const outlineFontSize = ref(boundedNumber(readPreference('lume-outline-font-size'), 0, 12, 24))

watch(
  [interfaceFont, interfaceFontSize, outlineFontSize],
  () => {
    const root = document.documentElement
    root.style.setProperty('--lume-interface-font', resolveFontFamily(interfaceFont.value))
    root.style.setProperty('--lume-interface-font-size', `${interfaceFontSize.value}px`)
    root.style.setProperty(
      '--lume-outline-font-size',
      `${outlineFontSize.value || interfaceFontSize.value}px`,
    )
    savePreference('lume-interface-font', interfaceFont.value)
    savePreference('lume-interface-font-size', String(interfaceFontSize.value))
    savePreference('lume-outline-font-size', String(outlineFontSize.value))
  },
  { immediate: true },
)

export const useInterfacePreference = () => ({
  interfaceFont,
  interfaceFontSize,
  outlineFontSize,
})
