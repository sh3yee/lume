import type { EditorView } from '@milkdown/kit/prose/view'

/** 读取当前系统剪贴板，并交给编辑器原有的图片、Markdown 与 HTML 粘贴链路。 */
export const pasteClipboard = async (
  view: EditorView,
  isActive: () => boolean,
  onError: (message: string) => void,
) => {
  const { doc, selection } = view.state
  const plainOnly = selection.$from.parent.type.spec.code
  let handled = false
  const handlePaste = () => {
    handled = true
  }
  view.dom.addEventListener('paste', handlePaste, { once: true })
  try {
    document.execCommand('paste')
  } catch {
    // WebView 不允许原生粘贴时，尝试浏览器剪贴板权限。
  } finally {
    view.dom.removeEventListener('paste', handlePaste)
  }
  if (handled) return

  try {
    const data = new DataTransfer()
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        for (const type of item.types) {
          if (plainOnly && type !== 'text/plain') continue
          if (!['text/plain', 'text/html'].includes(type) && !type.startsWith('image/')) continue
          const blob = await item.getType(type)
          if (type.startsWith('image/'))
            data.items.add(new File([blob], 'clipboard-image', { type }))
          else data.setData(type, await blob.text())
        }
      }
    } else if (navigator.clipboard?.readText) {
      data.setData('text/plain', await navigator.clipboard.readText())
    } else {
      throw new Error('Clipboard unavailable')
    }
    // 异步读取期间发生编辑或切换文档时，不能把内容粘贴到新目标。
    if (!isActive() || view.isDestroyed || view.state.doc !== doc) return
    view.dispatch(view.state.tr.setSelection(selection))
    view.focus()
    view.dom.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  } catch {
    if (isActive()) onError('无法读取系统剪贴板，请使用 Ctrl+V 粘贴。')
  }
}
