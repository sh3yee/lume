import { invokeCommand } from './client'

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

export function openWebUrl(url: string) {
  return invokeCommand<void>('lume_open_web_url', { url })
}
