import { shallowRef, watch, type Ref } from 'vue'
import { readPreference, savePreference } from '@/app/preferences/preferenceStorage'
import { isTauri } from '@/platform/tauri/client'
import { gitAutoPush } from '@/platform/tauri/git'
import { gitErrorMessage } from './useGitRepository'

export const MIN_AUTO_PUSH_MINUTES = 1
export const MAX_AUTO_PUSH_MINUTES = 1440

export interface GitAutoPushPreference {
  enabled: boolean
  intervalMinutes: number
}

const defaults: GitAutoPushPreference = { enabled: false, intervalMinutes: 30 }
const preferenceKey = (path: string) => `lume-git-auto-push:${path}`
const validInterval = (minutes: unknown): minutes is number =>
  typeof minutes === 'number' &&
  Number.isInteger(minutes) &&
  minutes >= MIN_AUTO_PUSH_MINUTES &&
  minutes <= MAX_AUTO_PUSH_MINUTES

const loadPreference = (path: string | null): GitAutoPushPreference => {
  const saved = path && readPreference(preferenceKey(path))
  if (saved) {
    try {
      const value = JSON.parse(saved) as Partial<GitAutoPushPreference> | null
      if (value && typeof value.enabled === 'boolean' && validInterval(value.intervalMinutes)) {
        return { enabled: value.enabled, intervalMinutes: value.intervalMinutes }
      }
    } catch {
      // 忽略无法解析的本地设置。
    }
  }
  return defaults
}

export const useGitAutoPush = (workspace: Readonly<Ref<string | null>>) => {
  const preference = shallowRef(defaults)
  const error = shallowRef('')
  const revision = shallowRef(0)
  let running = false

  const updatePreference = (next: GitAutoPushPreference) => {
    const path = workspace.value
    if (!path || !isTauri() || !validInterval(next.intervalMinutes)) return
    if (
      preference.value.enabled === next.enabled &&
      preference.value.intervalMinutes === next.intervalMinutes
    )
      return
    savePreference(preferenceKey(path), JSON.stringify(next))
    preference.value = next
  }

  watch(
    workspace,
    (path) => {
      preference.value = loadPreference(path)
    },
    { immediate: true, flush: 'sync' },
  )

  watch(
    [workspace, preference],
    ([path, { enabled, intervalMinutes }], _, onCleanup) => {
      error.value = ''
      if (!path || !enabled || !isTauri()) return
      let active = true
      const push = async () => {
        if (!active || running) return
        running = true
        try {
          const pushed = await gitAutoPush(path)
          if (active) {
            error.value = ''
            if (pushed) revision.value++
          }
        } catch (failure) {
          if (active) error.value = gitErrorMessage(failure)
        } finally {
          running = false
        }
      }
      const timer = window.setInterval(() => void push(), intervalMinutes * 60_000)
      onCleanup(() => {
        active = false
        window.clearInterval(timer)
      })
    },
    { immediate: true, flush: 'sync' },
  )

  return { preference, error, revision, updatePreference }
}
