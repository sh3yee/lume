import { isTauri } from '@/platform/tauri/client'
import { getExportName, type ExportFormat } from '../model/exportFormats'

export const selectExportPath = async (name: string, format: ExportFormat) => {
  const filename = getExportName(name, format.extension)
  if (!isTauri()) return filename
  const { save } = await import('@tauri-apps/plugin-dialog')
  const path = await save({
    defaultPath: filename,
    filters: [{ name: format.label, extensions: [format.extension] }],
  })
  if (!path) return null
  return path
}

export const saveExport = async (path: string, blob: Blob) => {
  if (isTauri()) {
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
    return
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = path
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
