export interface BrowserDocumentFile {
  content: string
  name: string
  path: null
}

/** 使用浏览器 File API 选择并读取 Markdown 文件。 */
export function openBrowserDocument(): Promise<BrowserDocumentFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain'
    input.style.display = 'none'

    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve({ content: String(reader.result), name: file.name, path: null })
      reader.onerror = () => resolve(null)
      reader.readAsText(file, 'utf-8')
    }
    input.oncancel = () => resolve(null)
    document.body.appendChild(input)
    input.click()
    input.remove()
  })
}

/** 使用浏览器下载能力保存 Markdown。 */
export function saveBrowserDocument(content: string, name: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name.endsWith('.md') ? name : `${name}.md`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}