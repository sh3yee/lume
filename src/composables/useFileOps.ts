/**
 * useFileOps - 文件操作
 *
 * 提供打开和保存 Markdown 文件的能力。
 * - Tauri 环境：使用原生 dialog + fs 插件
 * - 浏览器环境：使用 File API（打开）和下载链接（保存）
 */
import { computed } from 'vue'
import { useDocument } from '@composables/useDocument'
import { isTauri } from '../types/tauri'

/** 获取当前文件名 */
export function useFileOps() {
  const {
    activeDocument,
    content,
    newDocument,
    openDocument,
    updateActiveDocument,
  } = useDocument()
  const currentFileName = computed(() => activeDocument.value?.name ?? '未命名文档')
  const currentFilePath = computed(() => activeDocument.value?.path ?? null)
  const isDirty = computed(() => activeDocument.value?.isDirty ?? false)

  /**
   * 打开文件
   *
   * Tauri 环境调用原生对话框，浏览器环境触发隐藏的 <input type="file">。
   */
  async function openFile(): Promise<void> {
    if (isTauri()) {
      await openFileTauri()
    } else {
      await openFileBrowser()
    }
  }

  /** Tauri 环境打开文件 */
  async function openFileTauri(): Promise<void> {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { readFile } = await import('@tauri-apps/plugin-fs')

      const selected = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
      })

      if (typeof selected === 'string') {
        const bytes = await readFile(selected)
        const text = new TextDecoder('utf-8').decode(bytes)
        openDocument(text, selected.split(/[\\/]/).pop() || '未命名文档', selected)
      }
    } catch (err) {
      console.error('打开文件失败:', err)
    }
  }

  /** 浏览器环境打开文件 */
  function openFileBrowser(): Promise<void> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.md,.markdown,.txt,text/markdown,text/plain'
      input.style.display = 'none'

      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) {
          resolve()
          return
        }

        const reader = new FileReader()
        reader.onload = () => {
          const text = reader.result as string
          openDocument(text, file.name, null)
          resolve()
        }
        reader.onerror = () => {
          console.error('读取文件失败')
          resolve()
        }
        reader.readAsText(file, 'utf-8')
      }

      input.oncancel = () => resolve()
      document.body.appendChild(input)
      input.click()
      document.body.removeChild(input)
    })
  }

  /**
   * 保存文件
   *
   * Tauri 环境写入文件系统，浏览器环境触发下载。
   */
  async function saveFile(): Promise<void> {
    if (isTauri()) {
      await saveFileTauri()
    } else {
      saveFileBrowser()
    }
  }

  /** Tauri 环境保存文件 */
  async function saveFileTauri(): Promise<void> {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeFile, exists, mkdir } = await import('@tauri-apps/plugin-fs')
      const { dirname } = await import('@tauri-apps/api/path')

      let path = currentFilePath.value
      if (!path) {
        path = await save({
          defaultPath: currentFileName.value,
          filters: [{ name: 'Markdown', extensions: ['md'] }],
        })
      }

      if (path) {
        // 确保父目录存在
        const dir = await dirname(path)
        if (!(await exists(dir))) {
          await mkdir(dir, { recursive: true })
        }
        await writeFile(path, new TextEncoder().encode(content.value))
        updateActiveDocument({
          path,
          name: path.split(/[\\/]/).pop() || currentFileName.value,
          isDirty: false,
        })
      }
    } catch (err) {
      console.error('保存文件失败:', err)
    }
  }

  /** 浏览器环境保存文件（触发下载） */
  function saveFileBrowser(): void {
    const blob = new Blob([content.value], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = currentFileName.value.endsWith('.md')
      ? currentFileName.value
      : `${currentFileName.value}.md`
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    updateActiveDocument({ isDirty: false })
  }

  /** 新建文件 */
  function newFile(): void {
    newDocument()
  }

  return {
    currentFileName,
    currentFilePath,
    isDirty,
    openFile,
    saveFile,
    newFile,
  }
}