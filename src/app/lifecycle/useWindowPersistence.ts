/**
 * useWindowPersistence - 桌面窗口状态生命周期
 *
 * 负责恢复、监听和持久化窗口尺寸与最大化状态。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import {
  closeWindow,
  getWindowState,
  onWindowCloseRequested,
  onWindowResized,
  restoreWindowState,
  showWindow,
  type WindowState,
} from '@/types/tauri'

const WINDOW_STATE_STORAGE_KEY = 'lume-window-state'

function isValidWindowState(value: unknown): value is WindowState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<WindowState>
  return typeof state.width === 'number'
    && typeof state.height === 'number'
    && typeof state.maximized === 'boolean'
    && state.width >= 720
    && state.height >= 480
}

function getSavedWindowState(): WindowState | null {
  const savedState = localStorage.getItem(WINDOW_STATE_STORAGE_KEY)
  if (!savedState) return null

  try {
    const parsedState = JSON.parse(savedState)
    return isValidWindowState(parsedState) ? parsedState : null
  } catch {
    return null
  }
}

function saveWindowState(state: WindowState) {
  localStorage.setItem(WINDOW_STATE_STORAGE_KEY, JSON.stringify(state))
}

export function useWindowPersistence(handleCloseRequest?: () => void) {
  let unlistenWindowCloseRequested: (() => void) | null = null
  let unlistenWindowResized: (() => void) | null = null

  async function persistWindowState() {
    const state = await getWindowState()
    if (state) saveWindowState(state)
  }

  async function closeApplicationWindow() {
    await persistWindowState()
    await closeWindow()
  }

  onMounted(async () => {
    try {
      const savedWindowState = getSavedWindowState()
      if (savedWindowState) await restoreWindowState(savedWindowState)
    } finally {
      await showWindow()
    }

    unlistenWindowResized = await onWindowResized(saveWindowState).catch(() => null)
    if (handleCloseRequest) {
      unlistenWindowCloseRequested = await onWindowCloseRequested(handleCloseRequest).catch(() => null)
    }
  })

  onBeforeUnmount(() => {
    unlistenWindowCloseRequested?.()
    unlistenWindowResized?.()
    void persistWindowState()
  })

  return { closeApplicationWindow, persistWindowState }
}