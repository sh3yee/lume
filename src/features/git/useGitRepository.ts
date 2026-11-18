import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { t, type MessageKey } from '@/app/i18n'
import {
  gitAuthor,
  gitCommit,
  gitDiff,
  gitFetch,
  gitIndexTree,
  gitInit,
  gitPush,
  gitRemoteStatus,
  gitStage,
  gitStatus,
  gitSwitchBranch,
  type GitPushTarget,
  type GitRemoteStatus,
  type GitStatus,
} from '@/platform/tauri/git'
import { isTauri } from '@/platform/tauri/client'
import {
  reloadVersionWorkspace,
  runVersionWrite,
} from '@/features/workspace/services/workspaceOperations'

export const gitErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

interface GitFeedback {
  kind: 'pending' | 'success' | 'error'
  message: string
}

export const useGitRepository = (workspace: string) => {
  const status = shallowRef<GitStatus | null>(null)
  const remote = shallowRef<GitRemoteStatus | null>(null)
  const remoteError = shallowRef('')
  const busy = shallowRef(false)
  const feedback = shallowRef<GitFeedback | null>(null)
  const message = shallowRef('')
  const diff = shallowRef('')
  const diffPath = shallowRef('')
  const diffStaged = shallowRef(false)
  const diffLoading = shallowRef(false)
  let disposed = false
  let diffRequest = 0
  let indexTree = ''
  let feedbackTimeout = 0

  const hasConflicts = (snapshot: GitStatus) =>
    snapshot.changes.some((change) =>
      ['UU', 'AU', 'UA', 'DU', 'UD', 'AA', 'DD'].includes(change.index + change.working),
    )

  const writable = computed(() =>
    Boolean(status.value?.writable && !status.value.operation && !hasConflicts(status.value)),
  )

  const readStatus = async () => {
    const snapshot = await gitStatus(workspace)
    const tree =
      snapshot.root && !snapshot.operation && !hasConflicts(snapshot)
        ? await gitIndexTree(workspace)
        : ''
    let remoteSnapshot: GitRemoteStatus | null = null
    let remoteFailure = ''
    if (snapshot.writable && snapshot.branch && snapshot.head && !disposed) {
      try {
        remoteSnapshot = await gitRemoteStatus(workspace, snapshot.branch)
      } catch (failure) {
        remoteFailure = gitErrorMessage(failure)
      }
    }
    if (!disposed) {
      status.value = snapshot
      remote.value = remoteSnapshot
      remoteError.value = remoteFailure
      indexTree = tree
    }
  }

  const dismissFeedback = () => {
    window.clearTimeout(feedbackTimeout)
    feedback.value = null
  }

  const execute = async (progress: MessageKey | null, action: () => Promise<string | void>) => {
    if (busy.value || disposed) return false
    busy.value = true
    if (progress) {
      dismissFeedback()
      feedback.value = { kind: 'pending', message: t(progress) }
    }
    try {
      const success = await action()
      if (!disposed && progress) {
        feedback.value = success ? { kind: 'success', message: success } : null
        if (success) feedbackTimeout = window.setTimeout(dismissFeedback, 4500)
      }
      return true
    } catch (failure) {
      // hooks 或超时前操作可能已改变仓库，重新读取实际结果，保留原始错误。
      if (status.value?.root && !disposed) {
        try {
          await readStatus()
        } catch {
          /* 原始失败信息更有用。 */
        }
      }
      if (!disposed && (progress || !feedback.value)) {
        feedback.value = { kind: 'error', message: gitErrorMessage(failure) }
      }
      return false
    } finally {
      if (!disposed) busy.value = false
    }
  }

  const refresh = (showProgress = true) =>
    execute(showProgress ? '正在读取仓库状态…' : null, async () => {
      await readStatus()
      diffRequest++
      diff.value = ''
      diffPath.value = ''
    })

  const initialize = () =>
    execute('正在启用本地版本管理…', async () => {
      await runVersionWrite(workspace, () => gitInit(workspace))
      await readStatus()
      return t('已启用本地版本管理')
    })

  const switchBranch = (branch: string) =>
    execute('正在切换分支…', async () => {
      const snapshot = status.value
      if (!snapshot?.root || branch === snapshot.branch) return
      const root = snapshot.root
      const outcome = await runVersionWrite(
        root,
        async () => {
          const switched = await gitSwitchBranch(workspace, branch, snapshot.branch, snapshot.head)
          diffRequest++
          diff.value = ''
          diffPath.value = ''
          diffLoading.value = false
          await reloadVersionWorkspace(root)
          return switched
        },
        true,
      )
      if (outcome === 'switchedWithWarning')
        throw new Error(t('分支已切换，但 Git 切换后的操作失败。请检查工作区状态。'))
      await readStatus()
      return t('已切换到分支 {0}', branch)
    })

  const stage = (path: string, staged: boolean) =>
    execute(staged ? '正在暂存文件…' : '正在取消暂存…', async () => {
      await runVersionWrite(workspace, () => gitStage(workspace, path, staged), staged)
      await readStatus()
      diffRequest++
      diffPath.value = ''
      diff.value = ''
    })

  const commit = () =>
    execute('正在创建本地提交…', async () => {
      const expected = indexTree
      await runVersionWrite(workspace, () => gitCommit(workspace, message.value, expected))
      message.value = ''
      await readStatus()
      diffRequest++
      diffPath.value = ''
      diff.value = ''
      return t('已创建本地提交')
    })

  const configureAuthor = (name: string, email: string) =>
    execute('正在保存提交作者…', async () => {
      await runVersionWrite(workspace, () => gitAuthor(workspace, name, email))
      await readStatus()
      return t('作者信息已保存到当前仓库')
    })

  const push = (target: GitPushTarget) =>
    execute('正在推送提交…', async () => {
      const { branch, head } = status.value ?? {}
      if (!branch || !head) return
      await gitPush(workspace, branch, head, target)
      await readStatus()
      return t('已推送到 {0}', target.targetBranch)
    })

  const fetchRemote = (target: GitPushTarget) =>
    execute('正在获取远程状态…', async () => {
      const branch = status.value?.branch
      if (!branch) return
      await gitFetch(workspace, branch, target)
      await readStatus()
      return t('已更新远程状态')
    })

  const showDiff = async (path: string, staged: boolean) => {
    const request = ++diffRequest
    diffPath.value = path
    diffStaged.value = staged
    diff.value = ''
    diffLoading.value = true
    try {
      const content = await gitDiff(workspace, path, staged)
      if (!disposed && request === diffRequest) diff.value = content
    } catch (failure) {
      if (!disposed && request === diffRequest) diff.value = gitErrorMessage(failure)
    } finally {
      if (!disposed && request === diffRequest) diffLoading.value = false
    }
  }

  const handleFocus = () => {
    void refresh(false)
  }
  onMounted(() => {
    if (isTauri()) {
      void refresh()
      window.addEventListener('focus', handleFocus)
    } else feedback.value = { kind: 'error', message: t('版本管理仅在桌面应用中可用') }
  })
  onBeforeUnmount(() => {
    disposed = true
    diffRequest++
    window.clearTimeout(feedbackTimeout)
    window.removeEventListener('focus', handleFocus)
  })

  return {
    status,
    remote,
    remoteError,
    busy,
    feedback,
    dismissFeedback,
    message,
    writable,
    diff,
    diffPath,
    diffStaged,
    diffLoading,
    execute,
    readStatus,
    refresh,
    initialize,
    switchBranch,
    stage,
    commit,
    configureAuthor,
    push,
    fetchRemote,
    showDiff,
  }
}
