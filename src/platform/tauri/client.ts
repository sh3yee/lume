import { t, type MessageKey } from '@/app/i18n'
import { en } from '@/app/i18n/en'
/** Tauri 命令客户端：负责环境检测、懒加载 invoke 和统一错误转换。 */
type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

let invokeFn: InvokeFn | null = null

export class PlatformError extends Error {
  constructor(
    public readonly kind: string,
    message: string,
  ) {
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
      typeof value.message === 'string'
        ? translatePlatformMessage(value.message)
        : t('命令 {0} 执行失败', command),
    )
  }
  return new Error(typeof error === 'string' ? error : t('命令 {0} 执行失败', command))
}

const translatePlatformMessage = (message: string) => {
  if (Object.prototype.hasOwnProperty.call(en, message)) return t(message as MessageKey)
  const unsupportedImage = /^不支持 \.(.+) 图片$/.exec(message)
  if (unsupportedImage) return t('不支持 .{0} 图片', unsupportedImage[1])
  const fontTask = /^读取系统字体任务失败：(.+)$/.exec(message)
  if (fontTask) return t('读取系统字体任务失败：{0}', fontTask[1])
  return message
}

async function getInvoke(): Promise<InvokeFn> {
  if (invokeFn) return invokeFn
  const { invoke } = await import('@tauri-apps/api/core')
  invokeFn = invoke
  return invoke
}

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) throw new Error(t('命令“{0}”需要 Tauri 桌面环境', command))
  try {
    return (await (
      await getInvoke()
    )(command, args)) as T
  } catch (error) {
    throw toPlatformError(error, command)
  }
}
