import { t } from '@/app/i18n'
import { blobToDataUrl, loadExportFrame } from './renderExport'

let retainedPrintFrame: HTMLIFrameElement | null = null

export const printExport = async (html: string) => {
  const frame = await loadExportFrame(html)
  const target = frame.contentWindow
  if (!target) {
    frame.remove()
    throw new Error(t('无法创建导出页面。'))
  }
  // 打印预览会异步读取图片，保留最近一次页面，在下次打印时替换。
  retainedPrintFrame?.remove()
  retainedPrintFrame = frame
  try {
    target.focus()
    target.print()
  } catch (error) {
    frame.remove()
    retainedPrintFrame = null
    throw error
  }
}

export const renderImageExport = async (html: string) => {
  const frame = await loadExportFrame(html)
  try {
    const doc = frame.contentDocument!
    const article = doc.querySelector<HTMLElement>('article')!
    if (Array.from(doc.images).some((image) => !image.src.startsWith('data:')))
      throw new Error(t('图片导出需要下载文中的图片，请检查图片地址及跨域访问权限。'))
    const width = Math.ceil(article.getBoundingClientRect().width)
    const height = Math.ceil(article.getBoundingClientRect().height)
    const scale = 2
    if (height * scale > 32767 || width * height * scale * scale > 64000000)
      throw new Error(t('文档过长，无法导出为单张图片，请改用 PDF 或拆分文档。'))
    const theme = doc.documentElement.dataset.theme
    const background = frame.contentWindow!.getComputedStyle(doc.body).backgroundColor
    const body = document.createElementNS('http://www.w3.org/1999/xhtml', 'div')
    body.innerHTML = doc.head.querySelector('style')!.outerHTML + article.outerHTML
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" data-theme="${theme}"><rect width="100%" height="100%" fill="${background}"/><foreignObject x="0" y="0" width="100%" height="100%">${new XMLSerializer().serializeToString(body)}</foreignObject></svg>`
    const image = new Image()
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error(t('无法渲染导出图片。')))
    })
    image.src = await blobToDataUrl(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    await loaded
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const context = canvas.getContext('2d')
    if (!context) throw new Error(t('无法渲染导出图片。'))
    context.scale(scale, scale)
    context.drawImage(image, 0, 0)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error(t('无法渲染导出图片。')))),
        'image/png',
      ),
    )
  } finally {
    frame.remove()
  }
}
