import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { availableMonitors, getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from './client'

type UnlistenFn = () => void

export interface WindowState {
  width: number
  height: number
  maximized: boolean
  // 兼容旧版只保存尺寸的记录；坐标与尺寸均使用物理像素。
  x?: number
  y?: number
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
  const [size, position, maximized, minimized] = await Promise.all([
    current.innerSize(), current.outerPosition(), current.isMaximized(), current.isMinimized(),
  ])
  // Windows 最小化时的位置可能是屏幕外的哨兵值，不能覆盖正常窗口状态。
  if (minimized) return null
  return { width: size.width, height: size.height, x: position.x, y: position.y, maximized }
}
export async function restoreWindowState(state: WindowState) {
  if (!isTauri()) return
  const current = getCurrentWindow()
  let shouldCenter = true
  const { x, y } = state
  if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
    const monitors = await availableMonitors()
    // 保证标题栏可拖动，同时允许副屏上的负坐标和部分超出屏幕的窗口。
    const titleBarVisible = monitors.some(({ workArea }) => {
      const right = Math.min(x + state.width, workArea.position.x + workArea.size.width)
      const left = Math.max(x, workArea.position.x)
      return right - left >= 160
        && y >= workArea.position.y
        && y + 32 <= workArea.position.y + workArea.size.height
    })
    if (titleBarVisible) {
      await current.setPosition(new PhysicalPosition(x, y))
      shouldCenter = false
    }
  }
  // 先移动到目标屏幕，再恢复物理尺寸，避免跨屏缩放改变最终大小。
  if (state.width >= 720 && state.height >= 480) await current.setSize(new PhysicalSize(state.width, state.height))
  if (shouldCenter) await current.center()
  if (state.maximized && !(await current.isMaximized())) await current.maximize()
}
export async function onWindowResized(handler: () => void): Promise<UnlistenFn | null> {
  if (!isTauri()) return null
  return getCurrentWindow().onResized(handler)
}
export async function onWindowMoved(handler: () => void): Promise<UnlistenFn | null> {
  if (!isTauri()) return null
  return getCurrentWindow().onMoved(handler)
}
export async function onWindowCloseRequested(handler: () => void): Promise<UnlistenFn | null> {
  if (!isTauri()) return null
  return getCurrentWindow().onCloseRequested((event) => { event.preventDefault(); handler() })
}
export async function showWindow() { if (isTauri()) await getCurrentWindow().show() }
export async function closeWindow() { if (isTauri()) await getCurrentWindow().destroy() }
