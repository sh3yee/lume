/**
 * useFileDrop - 应用文件拖放生命周期
 *
 * 区分拖入编辑器的图片与拖入应用的 Markdown 文件，并串行处理文件打开任务。
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import {
  onFileDragDrop,
  startupFilePaths,
  type FileDragDropEvent,
} from '@/types/tauri'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'])

export function useFileDrop(
  viewMode: Ref<'wysiwyg' | 'split'>,
  openFilesFromPaths: (paths: string[]) => Promise<{
    opened: number
    rejected: Array<{ path: string; message: string }>
  }>,
  showMessage: (message: string) => void,
  dismissMessage: () => void,
) {
  const fileDragPaths = ref<string[]>([])
  let unlistenFileDragDrop: (() => void) | null = null
  let fileDropQueue = Promise.resolve()

  async function handleDroppedFiles(paths: string[]) {
    const result = await openFilesFromPaths(paths)
    if (result.rejected.length === 0) return

    const prefix = result.opened > 0 ? `已打开 ${result.opened} 个文件；` : ''
    const firstError = result.rejected[0].message
    const remaining = result.rejected.length > 1
      ? `，另有 ${result.rejected.length - 1} 个文件未打开`
      : ''
    showMessage(`${prefix}${firstError}${remaining}`)
  }

  function queueDroppedFiles(paths: string[]) {
    fileDragPaths.value = []
    fileDropQueue = fileDropQueue
      .then(() => handleDroppedFiles(paths))
      .catch(() => showMessage('打开拖入文件失败'))
  }

  function isImagePath(path: string) {
    const extension = path.split('.').at(-1)?.toLowerCase()
    return extension ? IMAGE_EXTENSIONS.has(extension) : false
  }

  function getDropPoint(position: { x: number; y: number }) {
    const scale = window.devicePixelRatio || 1
    return { x: position.x / scale, y: position.y / scale }
  }

  function handleFileDragDrop(event: FileDragDropEvent) {
    if (event.type === 'enter') {
      dismissMessage()
      fileDragPaths.value = event.paths
      return
    }
    if (event.type === 'drop') {
      const point = getDropPoint(event.position)
      const editorBounds = document.querySelector('.lume-wysiwyg-pane')?.getBoundingClientRect()
      const droppedInEditor = viewMode.value === 'wysiwyg'
        && editorBounds
        && point.x >= editorBounds.left
        && point.x <= editorBounds.right
        && point.y >= editorBounds.top
        && point.y <= editorBounds.bottom
      const imagePaths = droppedInEditor ? event.paths.filter(isImagePath) : []
      const otherPaths = event.paths.filter((path) => !imagePaths.includes(path))

      fileDragPaths.value = []
      if (imagePaths.length > 0) {
        window.dispatchEvent(new CustomEvent('lume:image-drop', {
          detail: { paths: imagePaths, x: point.x, y: point.y },
        }))
      }
      if (otherPaths.length > 0) queueDroppedFiles(otherPaths)
      return
    }
    if (event.type === 'leave') fileDragPaths.value = []
  }

  onMounted(async () => {
    unlistenFileDragDrop = await onFileDragDrop(handleFileDragDrop).catch(() => null)
    if ('__TAURI_INTERNALS__' in window) {
      const startupPaths = await startupFilePaths().catch(() => [])
      if (startupPaths.length > 0) await handleDroppedFiles(startupPaths)
    }
  })

  onBeforeUnmount(() => {
    unlistenFileDragDrop?.()
  })

  return { fileDragPaths }
}