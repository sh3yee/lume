import { ref, watch } from 'vue'
import { readPreference, savePreference } from './preferenceStorage'

const STATUS_BAR_ENABLED_KEY = 'lume-statusbar-enabled'

export const useStatusBarPreference = () => {
  const statusBarEnabled = ref(readPreference(STATUS_BAR_ENABLED_KEY) !== 'false')

  watch(statusBarEnabled, (value) => {
    savePreference(STATUS_BAR_ENABLED_KEY, String(value))
  })

  return { statusBarEnabled }
}
