import { t } from '@/app/i18n'
import type { EditorView } from '@milkdown/kit/prose/view'
import { EditorSelection } from '@codemirror/state'
import type { EditorContext } from './selectionContext'

const isCurrent = (view: EditorView, target: EditorContext, isActive: () => boolean) =>
  isActive() &&
  !view.isDestroyed &&
  view.state.doc === target.doc &&
  target.nativeCode?.view.state.doc === target.nativeCode?.state.doc

export const cutCodeSelection = async (
  view: EditorView,
  target: EditorContext,
  isActive: () => boolean,
  onError: (message: string) => void,
) => {
  const code = target.nativeCode
  if (!code) return
  const ranges = code.state.selection.ranges.filter((range) => !range.empty)
  try {
    await navigator.clipboard.writeText(
      ranges.map((range) => code.state.sliceDoc(range.from, range.to)).join('\n'),
    )
    if (!isCurrent(view, target, isActive)) return
    code.view.dispatch({ selection: code.state.selection })
    code.view.dispatch({
      changes: ranges.map((range) => ({ from: range.from, to: range.to, insert: '' })),
      userEvent: 'delete.cut',
      scrollIntoView: true,
    })
  } catch {
    if (isActive()) onError(t('无法写入系统剪贴板，未剪切代码。'))
  }
}

export const pasteCodeClipboard = async (
  view: EditorView,
  target: EditorContext,
  isActive: () => boolean,
  onError: (message: string) => void,
) => {
  const code = target.nativeCode
  if (!code) return
  let handled = false
  const handlePaste = () => {
    handled = true
  }
  code.view.contentDOM.addEventListener('paste', handlePaste)
  try {
    document.execCommand('paste')
  } catch {
    /* WebView 可能拒绝原生粘贴。 */
  } finally {
    code.view.contentDOM.removeEventListener('paste', handlePaste)
  }
  if (handled) return
  try {
    const source = await navigator.clipboard.readText()
    if (!isCurrent(view, target, isActive)) return
    code.view.dispatch({ selection: code.state.selection })
    const state = code.view.state
    const text = state.toText(source.replace(/\r\n?/g, '\n'))
    let lineIndex = 1
    // 与 CodeMirror 原生粘贴一致：行数匹配范围数时，将各行分别粘贴到对应范围。
    const changes =
      text.lines === state.selection.ranges.length
        ? state.changeByRange((range) => {
            const line = text.line(lineIndex++)
            return {
              changes: { from: range.from, to: range.to, insert: line.text },
              range: EditorSelection.cursor(range.from + line.length),
            }
          })
        : state.replaceSelection(text)
    code.view.dispatch({ ...changes, userEvent: 'input.paste', scrollIntoView: true })
  } catch {
    if (isActive()) onError(t('无法读取系统剪贴板，请使用 Ctrl+V 粘贴代码。'))
  }
}
