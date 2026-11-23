import { listen } from '@tauri-apps/api/event'
import { invokeCommand, isTauri } from './client'

type UnlistenFn = () => void

export interface HealthStatus {
  status: string
  version: string
}

export function healthCheck() {
  return invokeCommand<HealthStatus>('lume_health_check')
}

export function startupFilePaths() {
  return invokeCommand<string[]>('lume_startup_file_paths')
}

export async function onOpenFileRequest(
  handler: (paths: string[]) => void,
): Promise<UnlistenFn | null> {
  if (!isTauri()) return null
  return listen<string[]>('lume://open-files', (event) => handler(event.payload))
}

export function openWebUrl(url: string) {
  return invokeCommand<void>('lume_open_web_url', { url })
}
