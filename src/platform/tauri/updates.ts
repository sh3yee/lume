import { Channel } from '@tauri-apps/api/core'
import { invokeCommand } from './client'

export interface AppUpdate {
  version: string
  notes: string | null
}

export interface UpdateDownloadProgress {
  downloaded: number
  total: number | null
}

export const checkForUpdate = () => invokeCommand<AppUpdate | null>('lume_check_for_update')

export const downloadUpdate = (onProgress: (progress: UpdateDownloadProgress) => void) =>
  invokeCommand<void>('lume_download_update', {
    onProgress: new Channel<UpdateDownloadProgress>(onProgress),
  })

export const installUpdate = () => invokeCommand<void>('lume_install_update')
