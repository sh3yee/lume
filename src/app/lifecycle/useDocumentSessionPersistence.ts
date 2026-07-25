/**
 * useDocumentSessionPersistence - 文档会话持久化调度
 *
 * 对连续编辑产生的会话写入进行防抖，并在窗口卸载前同步暂存。
 */
import { onBeforeUnmount, watch, type Ref } from 'vue'
import type { OpenDocument } from '@composables/useDocument'

export function useDocumentSessionPersistence(
  documents: Ref<OpenDocument[]>,
  activeDocumentId: Ref<string>,
  persistDocumentSession: () => void,
) {
  let sessionPersistTimer: ReturnType<typeof setTimeout> | null = null

  /** 延迟更新会话暂存，避免编辑时频繁写入本地存储。 */
  function scheduleSessionPersist() {
    if (sessionPersistTimer) clearTimeout(sessionPersistTimer)
    sessionPersistTimer = setTimeout(() => {
      persistDocumentSession()
      sessionPersistTimer = null
    }, 300)
  }

  /** 关闭应用前同步暂存，确保最后一次输入也能恢复。 */
  function flushDocumentSession() {
    if (sessionPersistTimer) clearTimeout(sessionPersistTimer)
    sessionPersistTimer = null
    persistDocumentSession()
  }

  const stopSessionWatch = watch(
    [documents, activeDocumentId],
    scheduleSessionPersist,
    { deep: true },
  )

  window.addEventListener('beforeunload', flushDocumentSession)

  onBeforeUnmount(() => {
    stopSessionWatch()
    window.removeEventListener('beforeunload', flushDocumentSession)
    flushDocumentSession()
  })

  return { flushDocumentSession }
}