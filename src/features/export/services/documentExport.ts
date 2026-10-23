import type { OpenDocument } from '@/features/documents/model/documentTypes'
import type { ExportFormat } from '../model/exportFormats'
import { selectExportPath, saveExport } from './exportFile'
import { renderExport } from './renderExport'
import { printExport, renderImageExport } from './nativeExport'

export const exportDocument = async (snapshot: OpenDocument, format: ExportFormat) => {
  if (format.engine === 'print') {
    await printExport(await renderExport(snapshot, true, 'light'))
    return 'print' as const
  }
  const path = await selectExportPath(snapshot.name, format)
  if (!path) return null
  const html = await renderExport(snapshot, format.id !== 'html-plain')
  const blob =
    format.engine === 'image'
      ? await renderImageExport(html)
      : new Blob([html], { type: 'text/html;charset=utf-8' })
  await saveExport(path, blob)
  return 'saved' as const
}
