import type { MessageKey } from '@/app/i18n'

export interface ExportFormat {
  id: string
  label: MessageKey
  extension: string
  engine: 'html' | 'print' | 'image'
}

export const EXPORT_FORMATS: ExportFormat[] = [
  { id: 'pdf', label: 'PDF', extension: 'pdf', engine: 'print' },
  { id: 'html', label: 'HTML', extension: 'html', engine: 'html' },
  { id: 'html-plain', label: 'HTML（无样式）', extension: 'html', engine: 'html' },
  { id: 'png', label: '图片（PNG）', extension: 'png', engine: 'image' },
]

export const getExportName = (name: string, extension: string) =>
  `${name.replace(/\.(?:md|markdown|txt)$/i, '').replace(/[<>:"/\\|?*]/g, '_') || 'document'}.${extension}`
