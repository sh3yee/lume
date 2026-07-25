/**
 * useAppFeedback - 应用级反馈状态
 *
 * 统一管理需要在应用壳展示的短时消息。
 */
import { onBeforeUnmount, ref } from 'vue'

export function useAppFeedback() {
  const message = ref<string | null>(null)
  let messageTimer: ReturnType<typeof setTimeout> | null = null

  function dismissMessage() {
    if (messageTimer) clearTimeout(messageTimer)
    messageTimer = null
    message.value = null
  }

  function showMessage(value: string) {
    dismissMessage()
    message.value = value
    messageTimer = setTimeout(dismissMessage, 6000)
  }

  function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message
    if (error && typeof error === 'object' && 'message' in error) return String(error.message)
    return String(error || '未知错误')
  }

  onBeforeUnmount(dismissMessage)

  return { message, dismissMessage, showMessage, getErrorMessage }
}