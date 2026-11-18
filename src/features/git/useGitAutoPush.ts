import { computed, shallowRef, watch, type Ref } from 'vue'
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

interface GitAutoPushSchedule {
  path: string | null
  preference: GitAutoPushPreference
  savedPushAt: number | null
}

const defaults: GitAutoPushPreference = { enabled: false, intervalMinutes: 30 }
const preferenceKey = (path: string) => `lume-git-auto-push:${path}`
const validInterval = (minutes: unknown): minutes is number =>
  typeof minutes === 'number' &&
  Number.isInteger(minutes) &&
  minutes >= MIN_AUTO_PUSH_MINUTES &&
  minutes <= MAX_AUTO_PUSH_MINUTES

const loadSchedule = (path: string | null): GitAutoPushSchedule => {
  const saved = path && readPreference(preferenceKey(path))
  if (saved) {
    try {
      const value = JSON.parse(saved) as
        (Partial<GitAutoPushPreference> & { nextPushAt?: unknown }) | null
      if (value && typeof value.enabled === 'boolean' && validInterval(value.intervalMinutes)) {
        const { enabled, intervalMinutes, nextPushAt } = value
        return {
          path,
          preference: { enabled, intervalMinutes },
          savedPushAt:
            typeof nextPushAt === 'number' && Number.isSafeInteger(nextPushAt) && nextPushAt > 0
              ? nextPushAt
              : null,
        }
      }
    } catch {
      // 忽略无法解析的本地设置。
    }
  }
  return { path, preference: defaults, savedPushAt: null }
}

const saveSchedule = (path: string, preference: GitAutoPushPreference, nextPushAt: number | null) =>
  savePreference(preferenceKey(path), JSON.stringify({ ...preference, nextPushAt }))

export const useGitAutoPush = (workspace: Readonly<Ref<string | null>>) => {
  const schedule = shallowRef(loadSchedule(workspace.value))
  const preference = computed(() => schedule.value.preference)
  const error = shallowRef('')
  const revision = shallowRef(0)
  let pendingPush: Promise<boolean> | null = null

  const updatePreference = (next: GitAutoPushPreference) => {
    const path = workspace.value
    if (!path || !isTauri() || !validInterval(next.intervalMinutes)) return
    if (
      preference.value.enabled === next.enabled &&
      preference.value.intervalMinutes === next.intervalMinutes
    )
      return
    if (!next.enabled) saveSchedule(path, next, null)
    schedule.value = { path, preference: next, savedPushAt: null }
  }

  watch(
    workspace,
    (path) => {
      schedule.value = loadSchedule(path)
    },
    { flush: 'sync' },
  )

  watch(
    schedule,
    ({ path, preference, savedPushAt }, _, onCleanup) => {
      error.value = ''
      if (!path || !preference.enabled || !isTauri()) return

      const intervalMs = preference.intervalMinutes * 60_000
      let active = true
      let timer: number | undefined

      const push = async () => {
        if (pendingPush) await pendingPush.catch(() => false)
        if (!active) return

        try {
          pendingPush = gitAutoPush(path)
          const pushed = await pendingPush
          if (active) {
            error.value = ''
            if (pushed) revision.value++
          }
        } catch (failure) {
          if (active) error.value = gitErrorMessage(failure)
        } finally {
          pendingPush = null
          if (active) schedulePush(Date.now() + intervalMs)
        }
      }

      const schedulePush = (nextPushAt: number) => {
        saveSchedule(path, preference, nextPushAt)
        timer = window.setTimeout(() => void push(), Math.max(0, nextPushAt - Date.now()))
      }

      onCleanup(() => {
        active = false
        window.clearTimeout(timer)
      })

      const latestPushAt = Date.now() + intervalMs
      schedulePush(Math.min(savedPushAt ?? latestPushAt, latestPushAt))
    },
    { immediate: true, flush: 'sync' },
  )

  return { preference, error, revision, updatePreference }
}
