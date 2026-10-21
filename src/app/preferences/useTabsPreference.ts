import { ref, watch } from 'vue'

const TABS_ENABLED_KEY = 'lume-tabs-enabled'

export function useTabsPreference() {
  let initialValue = true
  try {
    initialValue = localStorage.getItem(TABS_ENABLED_KEY) !== 'false'
  } catch {
    // Storage can be unavailable; keep tabs enabled for this session.
  }

  const tabsEnabled = ref(initialValue)
  watch(tabsEnabled, (value) => {
    try {
      localStorage.setItem(TABS_ENABLED_KEY, String(value))
    } catch {
      // The preference still applies for the current session.
    }
  })

  return { tabsEnabled }
}
