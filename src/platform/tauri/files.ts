import { invokeCommand } from './client'

export interface MarkdownFile {
  path: string
  name: string
  content: string
}

/** 使用原生对话框选择并读取 Markdown 文件。 */
export async function openDocument() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { readFile } = await import('@tauri-apps/plugin-fs')
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
  })
  if (typeof selected !== 'string') return null
  const bytes = await readFile(selected)
  return {
    content: new TextDecoder('utf-8').decode(bytes),
    name: selected.split(/[\\/]/).pop() || '未命名文档',
    path: selected,
  }
}

export async function selectSavePath(currentPath: string | null, currentName: string, saveAs: boolean) {
  if (currentPath && !saveAs) return currentPath
  const { save } = await import('@tauri-apps/plugin-dialog')
  let path = await save({
    defaultPath: currentName.endsWith('.md') ? currentName : `${currentName}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (path && !/\.[^\\/]+$/.test(path)) path = `${path}.md`
  return path
}

export async function writeDocument(path: string, content: string) {
  const { writeFile } = await import('@tauri-apps/plugin-fs')
  await writeFile(path, new TextEncoder().encode(content))
}

export function readDroppedMarkdownFile(path: string) {
  return invokeCommand<MarkdownFile>('lume_read_markdown_file', { path })
}

export function revealFileInFolder(path: string) {
  return invokeCommand<void>('lume_reveal_file', { path })
}
