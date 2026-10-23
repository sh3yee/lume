import { t } from '@/app/i18n'
import type { OpenDocument } from '@/features/documents/model/documentTypes'
import { createMarkdownPreview } from '@/features/editor/extensions'
import {
  collectLocalImageSources,
  useImagesPreviewExtension,
} from '@/features/editor/extensions/images'
import { collectHtmlResourceSources } from '@/features/editor/extensions/html'
import { highlightCodeBlocks } from '@/features/editor/extensions/code-block'
import { renderMermaidDiagrams } from '@/features/editor/extensions/mermaid'
import { getDocumentImageOptions } from '@/features/images/model/imageSettings'
import { resolveHtmlResourceUrl } from '@/platform/tauri/resources'
import { exportStyles } from './exportStyles'

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

const embedResource = async (url: string) => {
  if (url.startsWith('data:')) return url
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(t('无法读取导出资源：{0}', url))
  return blobToDataUrl(await response.blob())
}

const embedStyles = async () => {
  const urls = [
    ...new Set(
      Array.from(exportStyles.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g), (match) => match[1]),
    ),
  ]
  let css = exportStyles
  for (const url of urls) {
    if (url.startsWith('#') || url.startsWith('data:')) continue
    css = css.split(url).join(await embedResource(new URL(url, document.baseURI).href))
  }
  return css
}

const prepareExportImages = (container: ParentNode) => {
  for (const image of container.querySelectorAll<HTMLImageElement>('img')) {
    // 未填写路径的编辑占位符不参与导出，已有说明文字仍保留。
    if (!image.getAttribute('src')?.trim()) image.replaceWith(image.alt)
    else image.loading = 'eager'
  }
}

export const renderExport = async (
  snapshot: OpenDocument,
  styled: boolean,
  theme: 'light' | 'dark' = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
) => {
  const markdown = createMarkdownPreview()
  const resolvedResources = new Map<string, string>()
  useImagesPreviewExtension(markdown, (source) => resolvedResources.get(source))
  const tokens = markdown.parse(snapshot.content, {})
  const sources = collectHtmlResourceSources(tokens, collectLocalImageSources(tokens))
  // 先把本地路径转为可显示的 URL，再进入 HTML 过滤，避免盘符和暂存协议被剥离。
  for (const source of sources) {
    resolvedResources.set(
      source,
      await resolveHtmlResourceUrl(
        source,
        snapshot.path,
        snapshot.id,
        getDocumentImageOptions(snapshot.content),
      ),
    )
  }
  const article = document.createElement('article')
  article.className = 'lume-export lume-markdown-content'
  article.innerHTML = markdown.render(snapshot.content)
  prepareExportImages(article)
  if (styled) {
    const root = getComputedStyle(document.documentElement)
    article.style.fontFamily =
      root.getPropertyValue('--lume-writing-font').trim() || 'var(--lume-font-serif)'
    article.style.fontSize = root.getPropertyValue('--lume-writing-font-size').trim() || '15px'
    article.style.lineHeight = root.getPropertyValue('--lume-writing-line-height').trim() || '1.65'
  }
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;pointer-events:none;'
  host.setAttribute('aria-hidden', 'true')
  host.append(article)
  document.body.append(host)
  try {
    if (styled)
      await Promise.all([
        highlightCodeBlocks(article, theme),
        renderMermaidDiagrams(article, theme),
      ])
    else article.querySelectorAll('.katex-html').forEach((element) => element.remove())
    const resources = new Map<string, Promise<string>>()
    for (const element of article.querySelectorAll<HTMLElement>('[src], [poster]')) {
      for (const attribute of ['src', 'poster']) {
        const source = element.getAttribute(attribute)
        if (!source || source.startsWith('#')) continue
        let resource = resources.get(source)
        if (!resource) {
          resource = (async () => {
            const url = resolvedResources.get(source) ?? source
            try {
              return await embedResource(url)
            } catch (error) {
              // 远程资源允许保留公开 URL；本地资源必须打包，不能留下应用内部地址。
              if (/^(https?:|\/\/)/i.test(source)) return new URL(source, document.baseURI).href
              throw error
            }
          })()
          resources.set(source, resource)
        }
        element.setAttribute(attribute, await resource)
      }
    }
    article
      .querySelectorAll('[contenteditable]')
      .forEach((element) => element.removeAttribute('contenteditable'))
    const title = markdown.utils.escapeHtml(snapshot.name.replace(/\.(md|markdown)$/i, ''))
    const css = styled ? await embedStyles() : ''
    return `<!DOCTYPE html><html lang="${document.documentElement.lang || 'zh-CN'}" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${styled ? `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>` : ''}</head><body>${article.outerHTML}</body></html>`
  } finally {
    host.remove()
  }
}

export const loadExportFrame = (html: string): Promise<HTMLIFrameElement> =>
  new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;height:1000px;border:0;'
    const timer = window.setTimeout(() => {
      frame.remove()
      reject(new Error(t('导出内容加载超时。')))
    }, 30000)
    frame.onload = async () => {
      try {
        const doc = frame.contentDocument
        if (!doc) throw new Error(t('无法创建导出页面。'))
        prepareExportImages(doc)
        await doc.fonts.ready
        await Promise.all(
          Array.from(doc.images, async (image) => {
            const source = image.currentSrc || image.getAttribute('src') || ''
            const label = image.alt || (source.startsWith('data:') ? t('嵌入图片') : source)
            try {
              await image.decode()
              if (!image.naturalWidth) throw new Error()
            } catch {
              throw new Error(t('图片加载失败：{0}', label))
            }
          }),
        )
        window.clearTimeout(timer)
        resolve(frame)
      } catch (error) {
        window.clearTimeout(timer)
        frame.remove()
        reject(error)
      }
    }
    frame.srcdoc = html
    document.body.append(frame)
  })
