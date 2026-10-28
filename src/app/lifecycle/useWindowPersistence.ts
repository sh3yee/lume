/**
 * useWindowPersistence - 桌面窗口状态生命周期
 *
 * 负责恢复、监听和持久化窗口尺寸、位置与最大化状态。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { readPreference, savePreference } from '@/app/preferences/preferenceStorage'
import {
  closeWindow,
  getWindowState,
  onWindowCloseRequested,
  onWindowMoved,
  onWindowResized,
  restoreWindowState,
  showWindow,
  type WindowState,
} from '@/platform/tauri/window'

const WINDOW_STATE_STORAGE_KEY = 'lume-window-state'

function isValidWindowState(value: unknown): value is WindowState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<WindowState>
  return typeof state.width === 'number'
    && typeof state.height === 'number'
    && typeof state.maximized === 'boolean'
    && Number.isFinite(state.width)
    && Number.isFinite(state.height)
    && state.width >= 720
    && state.height >= 480
    && ((state.x === undefined && state.y === undefined)
      || (typeof state.x === 'number' && Number.isFinite(state.x)
        && typeof state.y === 'number' && Number.isFinite(state.y)))
}

function getSavedWindowState(): WindowState | null {
  const savedState = readPreference(WINDOW_STATE_STORAGE_KEY)
  if (!savedState) return null

  try {
    const parsedState = JSON.parse(savedState)
    return isValidWindowState(parsedState) ? parsedState : null
  } catch {
    return null
  }
}

function saveWindowState(state: WindowState) {
  savePreference(WINDOW_STATE_STORAGE_KEY, JSON.stringify(state))
}

export function useWindowPersistence(handleCloseRequest?: () => void) {
  let unlistenWindowCloseRequested: (() => void) | null = null
  let unlistenWindowResized: (() => void) | null = null
  let unlistenWindowMoved: (() => void) | null = null
  let lastWindowState: WindowState | null = null
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let pendingSave = Promise.resolve()
  let disposed = false

  function persistWindowState() {
    clearTimeout(saveTimer)
    // 串行读取，避免移动和缩放事件的异步结果相互覆盖。
    pendingSave = pendingSave.then(async () => {
      const state = await getWindowState()
      if (!state || !isValidWindowState(state)) return
      // 最大化时保留普通窗口的尺寸和位置，以便下次还原。
      lastWindowState = state.maximized && lastWindowState
        ? { ...lastWindowState, maximized: true }
        : state
      saveWindowState(lastWindowState)
    }).catch((error: unknown) => {
      console.warn('保存窗口状态失败:', error)
    })
    return pendingSave
  }

  function scheduleSave() {
    if (disposed) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { void persistWindowState() }, 120)
  }

  async function listen(register: () => Promise<(() => void) | null>) {
    const unlisten = await register().catch(() => null)
    if (disposed) {
      unlisten?.()
      return null
    }
    return unlisten
  }

  async function closeApplicationWindow() {
    await persistWindowState()
    await closeWindow()
  }

  onMounted(async () => {
    try {
      lastWindowState = getSavedWindowState()
      if (lastWindowState) await restoreWindowState(lastWindowState)
    } catch (error) {
      console.warn('恢复窗口状态失败:', error)
    } finally {
      await showWindow()
    }

    if (disposed) return
    await persistWindowState()
    unlistenWindowResized = await listen(() => onWindowResized(scheduleSave))
    unlistenWindowMoved = await listen(() => onWindowMoved(scheduleSave))
    if (handleCloseRequest) {
      unlistenWindowCloseRequested = await listen(() => onWindowCloseRequested(handleCloseRequest))
    }
  })

  onBeforeUnmount(() => {
    disposed = true
    clearTimeout(saveTimer)
    unlistenWindowCloseRequested?.()
    unlistenWindowResized?.()
    unlistenWindowMoved?.()
    void persistWindowState()
  })

  return { closeApplicationWindow, persistWindowState }
}
