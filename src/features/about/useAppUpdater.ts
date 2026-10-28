import { computed, inject, provide, readonly, shallowRef, type InjectionKey } from 'vue'
import { t } from '@/app/i18n'
import { isTauri } from '@/platform/tauri/client'
import {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  type AppUpdate,
  type UpdateDownloadProgress,
} from '@/platform/tauri/updates'

type UpdateStatus =
  'idle' | 'checking' | 'available' | 'latest' | 'downloading' | 'ready' | 'installing'

const updaterKey: InjectionKey<ReturnType<typeof provideAppUpdater>> = Symbol('app-updater')

export const provideAppUpdater = (beforeInstall: () => void) => {
  const status = shallowRef<UpdateStatus>('idle')
  const update = shallowRef<AppUpdate | null>(null)
  const progress = shallowRef<UpdateDownloadProgress>({ downloaded: 0, total: null })
  const error = shallowRef('')

  const busy = computed(() => ['checking', 'downloading', 'installing'].includes(status.value))
  const installing = computed(() => status.value === 'installing')
  const downloadPercent = computed(() => {
    const { downloaded, total } = progress.value
    return total && total > 0 ? Math.min(100, Math.floor((downloaded / total) * 100)) : null
  })

  const check = async () => {
    if (busy.value || status.value === 'ready') return
    error.value = ''
    update.value = null
    status.value = 'checking'
    try {
      update.value = await checkForUpdate()
      status.value = update.value ? 'available' : 'latest'
    } catch (reason) {
      status.value = 'idle'
      error.value = reason instanceof Error ? reason.message : t('检查更新失败，请稍后重试。')
    }
  }

  const download = async () => {
    if (status.value !== 'available') return
    error.value = ''
    progress.value = { downloaded: 0, total: null }
    status.value = 'downloading'
    try {
      await downloadUpdate((value) => {
        progress.value = value
      })
      status.value = 'ready'
    } catch (reason) {
      status.value = 'available'
      error.value = reason instanceof Error ? reason.message : t('下载更新失败，请重试。')
    }
  }

  const install = async () => {
    if (status.value !== 'ready') return
    error.value = ''
    // 暂存失败时保留下载结果，让用户处理存储问题后再重试。
    try {
      beforeInstall()
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : t('无法暂存文档，已取消安装更新。')
      return
    }
    status.value = 'installing'
    try {
      await installUpdate()
    } catch (reason) {
      status.value = 'available'
      error.value = reason instanceof Error ? reason.message : t('安装更新失败，请重新下载后重试。')
    }
  }

  const updater = {
    supported: isTauri(),
    status: readonly(status),
    update: readonly(update),
    progress: readonly(progress),
    error: readonly(error),
    busy,
    installing,
    downloadPercent,
    check,
    download,
    install,
  }
  provide(updaterKey, updater)
  return updater
}

export const useAppUpdater = () => {
  const updater = inject(updaterKey)
  if (!updater) throw new Error('App updater provider is missing')
  return updater
}
