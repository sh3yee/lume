import { PhysicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from './client'

type UnlistenFn = () => void

export interface WindowState {
  width: number
  height: number
  maximized: boolean
}

export type FileDragDropEvent =
  | { type: 'enter'; paths: string[]; position: { x: number; y: number } }
  | { type: 'over'; position: { x: number; y: number } }
  | { type: 'drop'; paths: string[]; position: { x: number; y: number } }
  | { type: 'leave' }

export async function onFileDragDrop(handler: (event: FileDragDropEvent) => void): Promise<UnlistenFn | null> {
  if (!isTauri()) return null
  return getCurrentWindow().onDragDropEvent(({ payload }) => handler(payload))
}

export async function minimizeWindow() { if (isTauri()) await getCurrentWindow().minimize() }
export async function isWindowMaximized() { return isTauri() ? getCurrentWindow().isMaximized() : false }
export async function toggleMaximizeWindow() {
  if (!isTauri()) return false
  const current = getCurrentWindow()
  await current.toggleMaximize()
  return current.isMaximized()
}
export async function getWindowState(): Promise<WindowState | null> {
  if (!isTauri()) return null
  const current = getCurrentWindow()
  const [size, maximized] = await Promise.all([current.innerSize(), current.isMaximized()])
  return { width: size.width, height: size.height, maximized }
}
export async function restoreWindowState(state: WindowState) {
  if (!isTauri()) return
  const current = getCurrentWindow()
  if (state.width >= 720 && state.height >= 480) await current.setSize(new PhysicalSize(state.width, state.height))
  if (state.maximized && !(await current.isMaximized())) await current.maximize()
}
export async function onWindowResized(handler: (state: WindowState) => void): Promise<UnlistenFn | null> {
  if (!isTauri()) return null
  const current = getCurrentWindow()
  return current.onResized(async ({ payload }) => handler({ ...payload, maximized: await current.isMaximized() }))
}
export async function onWindowCloseRequested(handler: () => void): Promise<UnlistenFn | null> {
  if (!isTauri()) return null
  return getCurrentWindow().onCloseRequested((event) => { event.preventDefault(); handler() })
}
export async function showWindow() { if (isTauri()) await getCurrentWindow().show() }
export async function closeWindow() { if (isTauri()) await getCurrentWindow().destroy() }
