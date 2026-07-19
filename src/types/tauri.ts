/**
 * Tauri 命令桥接层
 *
 * 封装所有对 Rust 后端的调用，提供类型安全的接口。
 * 前端组件不直接调用 `invoke`，统一通过此模块访问原生能力。
 */

// Tauri 的 invoke 在 Web 环境下不可用，通过动态导入实现懒加载
// 这样开发阶段（仅前端）也能正常运行
type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
type UnlistenFn = () => void

export type FileDragDropEvent =
  | { type: 'enter'; paths: string[]; position: { x: number; y: number } }
  | { type: 'over'; position: { x: number; y: number } }
  | { type: 'drop'; paths: string[]; position: { x: number; y: number } }
  | { type: 'leave' }

export interface MarkdownFile {
  path: string
  name: string
  content: string
}

export interface ImageAsset {
  markdownPath: string
  localPath: string
}

export interface WindowState {
  width: number
  height: number
  maximized: boolean
}

let invokeFn: InvokeFn | null = null

/**
 * 检测当前是否运行在 Tauri 环境中
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * 懒加载获取 Tauri invoke 函数
 */
async function getInvoke(): Promise<InvokeFn> {
  if (invokeFn) return invokeFn
  const { invoke } = await import('@tauri-apps/api/core')
  invokeFn = invoke
  return invoke
}

/**
 * 健康检查返回类型
 */
export interface HealthStatus {
  status: string
  version: string
}

/**
 * Lume 统一错误类型（与 Rust 端 LumeError 对应）
 */
export interface LumeError {
  kind: string
  message: string
}

/**
 * 调用 Tauri 命令的通用封装
 *
 * 统一错误处理：将 Rust 端返回的错误转换为 `LumeError` 结构。
 */
async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error(`命令 "${cmd}" 需要 Tauri 环境，但当前运行在浏览器中`)
  }
  const invoke = await getInvoke()
  return invoke(cmd, args) as Promise<T>
}

/**
 * 健康检查 - 验证 Rust 后端是否就绪
 */
export async function healthCheck(): Promise<HealthStatus> {
  return invokeCommand<HealthStatus>('lume_health_check')
}

/** 读取用户从操作系统拖入的 Markdown 文件。 */
export async function readDroppedMarkdownFile(path: string): Promise<MarkdownFile> {
  return invokeCommand<MarkdownFile>('lume_read_markdown_file', { path })
}

/** 将拖入的本地图片复制到文档资源目录。 */
export async function importImageFile(
  path: string,
  documentPath: string | null,
  documentId: string,
): Promise<ImageAsset> {
  return invokeCommand<ImageAsset>('lume_import_image_file', { path, documentPath, documentId })
}

/** 将剪贴板图片写入文档资源目录。 */
export async function storeClipboardImage(
  bytes: number[],
  extension: string,
  documentPath: string | null,
  documentId: string,
): Promise<ImageAsset> {
  return invokeCommand<ImageAsset>('lume_store_clipboard_image', {
    bytes,
    extension,
    documentPath,
    documentId,
  })
}

/** 首次保存时迁移未命名文档的暂存图片。 */
export async function materializeStagedImages(
  content: string,
  documentPath: string,
  documentId: string,
): Promise<string> {
  return invokeCommand<string>('lume_materialize_staged_images', {
    content,
    documentPath,
    documentId,
  })
}

/** Markdown 写盘成功后清理未命名文档的图片暂存区。 */
export async function clearStagedImages(documentId: string): Promise<void> {
  return invokeCommand<void>('lume_clear_staged_images', { documentId })
}

/** 解析仅用于展示的本地图片绝对路径。 */
export async function resolveImagePath(
  markdownPath: string,
  documentPath: string | null,
  documentId: string,
): Promise<string> {
  return invokeCommand<string>('lume_resolve_image_path', {
    markdownPath,
    documentPath,
    documentId,
  })
}

/** 在系统文件管理器中选中指定文件。 */
export async function revealFileInFolder(path: string): Promise<void> {
  return invokeCommand<void>('lume_reveal_file', { path })
}

/** 监听当前桌面窗口的原生文件拖放事件。 */
export async function onFileDragDrop(
  handler: (event: FileDragDropEvent) => void,
): Promise<UnlistenFn | null> {
  if (!isTauri()) return null
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow().onDragDropEvent(({ payload }) => {
    if (payload.type === 'enter' || payload.type === 'drop') {
      handler({ type: payload.type, paths: payload.paths, position: payload.position })
      return
    }
    if (payload.type === 'over') {
      handler({ type: payload.type, position: payload.position })
      return
    }
    handler(payload)
  })
}

/** 最小化当前桌面窗口 */
export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().minimize()
}

/** 切换当前桌面窗口的最大化状态 */
export async function toggleMaximizeWindow(): Promise<boolean> {
  if (!isTauri()) return false
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const window = getCurrentWindow()
  await window.toggleMaximize()
  return window.isMaximized()
}

/** 获取当前桌面窗口是否已最大化 */
export async function isWindowMaximized(): Promise<boolean> {
  if (!isTauri()) return false
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow().isMaximized()
}

/** 获取当前桌面窗口状态 */
export async function getWindowState(): Promise<WindowState | null> {
  if (!isTauri()) return null
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const window = getCurrentWindow()
  const [size, maximized] = await Promise.all([
    window.innerSize(),
    window.isMaximized(),
  ])
  return { width: size.width, height: size.height, maximized }
}

/** 应用已保存的桌面窗口状态 */
export async function restoreWindowState(state: WindowState): Promise<void> {
  if (!isTauri()) return
  const { PhysicalSize } = await import('@tauri-apps/api/dpi')
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const window = getCurrentWindow()

  if (state.width >= 720 && state.height >= 480) {
    await window.setSize(new PhysicalSize(state.width, state.height))
  }

  if (state.maximized && !(await window.isMaximized())) {
    await window.maximize()
  }
}

/** 监听桌面窗口尺寸变化 */
export async function onWindowResized(handler: (state: WindowState) => void): Promise<UnlistenFn | null> {
  if (!isTauri()) return null
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const window = getCurrentWindow()
  return window.onResized(async ({ payload }) => {
    handler({
      width: payload.width,
      height: payload.height,
      maximized: await window.isMaximized(),
    })
  })
}

/** 显示当前桌面窗口 */
export async function showWindow(): Promise<void> {
  if (!isTauri()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().show()
}

/** 关闭当前桌面窗口 */
export async function closeWindow(): Promise<void> {
  if (!isTauri()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().close()
}
