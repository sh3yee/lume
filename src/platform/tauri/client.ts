/** Tauri 命令客户端：负责环境检测、懒加载 invoke 和统一错误转换。 */
type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

let invokeFn: InvokeFn | null = null

export class PlatformError extends Error {
  constructor(public readonly kind: string, message: string) {
    super(message)
    this.name = 'PlatformError'
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function toPlatformError(error: unknown, command: string) {
  if (error instanceof Error) return error
  if (error && typeof error === 'object') {
    const value = error as { kind?: unknown; message?: unknown }
    return new PlatformError(
      typeof value.kind === 'string' ? value.kind : 'Unknown',
      typeof value.message === 'string' ? value.message : `命令 ${command} 执行失败`,
    )
  }
  return new Error(typeof error === 'string' ? error : `命令 ${command} 执行失败`)
}

async function getInvoke(): Promise<InvokeFn> {
  if (invokeFn) return invokeFn
  const { invoke } = await import('@tauri-apps/api/core')
  invokeFn = invoke
  return invoke
}

export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error(`命令“${command}”需要 Tauri 桌面环境`)
  try {
    return await (await getInvoke())(command, args) as T
  } catch (error) {
    throw toPlatformError(error, command)
  }
}
