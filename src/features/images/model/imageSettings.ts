import { reactive, watch } from 'vue'
import type { ImagePathOptions } from '@/platform/tauri/images'
import { getDocumentImageMetadata } from './imageMetadata'

export { getDocumentImageMetadata, setDocumentImageMetadata } from './imageMetadata'
export type { ImageMetadataKey } from './imageMetadata'

export interface ImageSettings {
  insertAction: 'original' | 'copy' | 'upload'
  copyTo: string
  applyToLocal: boolean
  applyToRemote: boolean
  allowYamlCopy: boolean
  allowYamlUpload: boolean
  preferRelative: boolean
  ensureDotSlash: boolean
  escapePath: boolean
  uploader: { program: string; args: string[] }
}

const STORAGE_KEY = 'lume-image-settings'
const DEFAULT_SETTINGS: ImageSettings = {
  insertAction: 'copy',
  copyTo: '${filename}.assets',
  applyToLocal: true,
  applyToRemote: false,
  allowYamlCopy: true,
  allowYamlUpload: false,
  preferRelative: true,
  ensureDotSlash: false,
  escapePath: false,
  uploader: { program: '', args: [] },
}

const getInitialSettings = (): ImageSettings => {
  const defaults: ImageSettings = { ...DEFAULT_SETTINGS, uploader: { program: '', args: [] } }
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const saved = raw as Record<string, unknown>
    if (
      saved.insertAction === 'original' ||
      saved.insertAction === 'copy' ||
      saved.insertAction === 'upload'
    ) {
      defaults.insertAction = saved.insertAction
    }
    if (typeof saved.copyTo === 'string') defaults.copyTo = saved.copyTo
    const booleanKeys = [
      'applyToLocal',
      'applyToRemote',
      'allowYamlCopy',
      'allowYamlUpload',
      'preferRelative',
      'ensureDotSlash',
      'escapePath',
    ] as const
    for (const key of booleanKeys) {
      if (typeof saved[key] === 'boolean') defaults[key] = saved[key]
    }
    if (saved.uploader && typeof saved.uploader === 'object') {
      const uploader = saved.uploader as Record<string, unknown>
      defaults.uploader = {
        program: typeof uploader.program === 'string' ? uploader.program : '',
        args: Array.isArray(uploader.args)
          ? uploader.args.filter((arg): arg is string => typeof arg === 'string')
          : [],
      }
    }
    // 仅升级旧版未定制的默认设置；自定义目录、上传和原位置规则继续保留。
    if (
      saved.version === undefined &&
      defaults.insertAction === 'original' &&
      !defaults.uploader.program &&
      !defaults.uploader.args.length &&
      Object.entries(DEFAULT_SETTINGS).every(
        ([key, value]) =>
          key === 'insertAction' ||
          key === 'uploader' ||
          defaults[key as keyof ImageSettings] === value,
      )
    ) {
      defaults.insertAction = 'copy'
    }
    return defaults
  } catch {
    return defaults
  }
}

export const imageSettings = reactive<ImageSettings>(getInitialSettings())

export const getDocumentImageOptions = (
  content: string,
  source?: 'local' | 'remote',
): ImagePathOptions => {
  const metadata = getDocumentImageMetadata(content)
  let insertAction = imageSettings.insertAction
  let copyTo = imageSettings.copyTo.trim() || DEFAULT_SETTINGS.copyTo
  if (metadata.copyTo === '') insertAction = 'original'
  else if (metadata.copyTo === 'upload' && imageSettings.allowYamlUpload) insertAction = 'upload'
  else if (metadata.copyTo && metadata.copyTo !== 'upload' && imageSettings.allowYamlCopy) {
    insertAction = 'copy'
    copyTo = metadata.copyTo
  }
  if (
    (source === 'local' && !imageSettings.applyToLocal) ||
    (source === 'remote' && !imageSettings.applyToRemote)
  ) {
    insertAction = 'original'
  }
  return {
    insertAction,
    copyTo,
    rootUrl: metadata.rootUrl,
    preferRelative: imageSettings.preferRelative,
    ensureDotSlash: imageSettings.ensureDotSlash,
    escapePath: imageSettings.escapePath,
    uploader: {
      program: imageSettings.uploader.program.trim(),
      args: [...imageSettings.uploader.args],
    },
  }
}

watch(
  imageSettings,
  (settings) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, version: 1 }))
    } catch (error) {
      console.warn('保存图片偏好设置失败:', error)
    }
  },
  { deep: true, immediate: true },
)
