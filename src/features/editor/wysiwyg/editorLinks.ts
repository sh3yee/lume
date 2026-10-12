import { isTauri } from '@/platform/tauri/client'
import { readDroppedDocuments } from '@/features/files/services/documentFileService'

export const canOpenEditorLink = (href: string) => {
  if (/^(?:https?:\/\/|#)/i.test(href)) return true
  if (/^[a-z][\w+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return false
  return /\.(?:md|markdown|txt)(?:[?#].*)?$/i.test(href)
}

export const openEditorLink = async (
  href: string,
  options: {
    documentPath: string | null
    root: HTMLElement | null
    isActive: () => boolean
    onOpenDocument: (content: string, name: string, path: string) => void
  },
) => {
  if (!canOpenEditorLink(href) || !options.isActive()) return
  if (/^https?:\/\//i.test(href)) {
    window.open(href, '_blank', 'noopener,noreferrer')
    return
  }
  if (href.startsWith('#')) {
    const id = decodeURIComponent(href.slice(1))
    const element = Array.from(options.root?.querySelectorAll<HTMLElement>('[id]') ?? []).find(
      (element) => element.id === id,
    )
    if (!element) throw new Error('当前文档中找不到链接目标。')
    element.scrollIntoView({ block: 'start' })
    return
  }
  if (!isTauri()) throw new Error('本地文件链接需要在桌面应用中打开。')
  const source = decodeURIComponent(href.split(/[?#]/)[0])
  const absolute = /^[a-z]:[\\/]|^[/\\]/i.test(source)
  if (!absolute && !options.documentPath) throw new Error('请先保存当前文档，再打开相对文件链接。')
  const { dirname, resolve } = await import('@tauri-apps/api/path')
  const path = absolute ? source : await resolve(await dirname(options.documentPath!), source)
  const { files, result } = await readDroppedDocuments([path])
  if (!options.isActive()) return
  const file = files[0]
  if (!file) throw new Error(result.rejected[0]?.message ?? '无法打开链接文件。')
  options.onOpenDocument(file.content, file.name, file.path)
}
