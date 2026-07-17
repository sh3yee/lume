/**
 * Tauri 命令桥接层
 *
 * 封装所有对 Rust 后端的调用，提供类型安全的接口。
 * 前端组件不直接调用 `invoke`，统一通过此模块访问原生能力。
 */

// Tauri 的 invoke 在 Web 环境下不可用，通过动态导入实现懒加载
// 这样开发阶段（仅前端）也能正常运行
type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

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