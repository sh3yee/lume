<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { CircleAlert, CircleCheck, GitBranch, LoaderCircle, X } from 'lucide-vue-next'
import SettingsSelect from '@/components/SettingsSelect.vue'
import { t } from '@/app/i18n'
import { useDocument } from '@/features/documents/model/useDocument'
import { isSameDocumentPath } from '@/features/documents/model/documentPath'
import { isTauri } from '@/platform/tauri/client'
import { gitRestore, gitRestorePreview, type GitRestorePreview } from '@/platform/tauri/git'
import {
  reloadVersionDocument,
  runVersionWrite,
} from '@/features/workspace/services/workspaceOperations'
import { useGitRepository } from '../useGitRepository'
import GitChanges from './GitChanges.vue'
import GitHistory from './GitHistory.vue'
import GitMergePanel from './GitMergePanel.vue'
import GitRemote from './GitRemote.vue'
import '../git.css'

const props = defineProps<{ workspace: string; autoPushRevision: number }>()
const emit = defineEmits<{ close: [] }>()
const repository = useGitRepository(props.workspace)
const {
  status,
  remote,
  remoteError,
  remoteStale,
  busy,
  feedback,
  message,
  writable,
  diff,
  diffPath,
  diffStaged,
  diffLoading,
} = repository
const tab = shallowRef<'changes' | 'history'>('changes')
const dialog = shallowRef<HTMLElement | null>(null)
const restoration = shallowRef<{
  revision: string
  path: string
  preview: GitRestorePreview
  documentSnapshot: string
} | null>(null)
const { documents } = useDocument()
const repositoryPath = computed(() => status.value?.root || props.workspace)
const repositoryName = computed(
  () => repositoryPath.value.split(/[\\/]/).filter(Boolean).pop() ?? repositoryPath.value,
)
const isMerging = computed(() => Boolean(status.value?.mergeHead && status.value.writable))
const branchOptions = computed(() => [
  ...(status.value?.branches ?? []).map((name) => ({
    value: name,
    label: name,
    group: t('本地分支'),
  })),
  ...(remote.value?.branches ?? []).map(({ refName, remoteName, name }) => ({
    value: `:${refName}`,
    label: `${remoteName}/${name}`,
    group: t('远程分支'),
  })),
])
const hasOtherBranches = computed(() =>
  branchOptions.value.some(({ value }) => value !== status.value?.branch),
)
let disposed = false
let previousFocus: HTMLElement | null = null

const getDocumentSnapshot = (path: string) =>
  JSON.stringify(
    documents.value
      .filter((document) => isSameDocumentPath(document.path, path))
      .map(({ id, content, savedContent, isDirty }) => ({ id, content, savedContent, isDirty })),
  )

const handlePrepareRestore = async (revision: string, path: string) => {
  const prepared = await repository.execute('正在检查要恢复的文件…', async () => {
    await runVersionWrite(
      props.workspace,
      async () => {
        const preview = await gitRestorePreview(props.workspace, path)
        if (!disposed)
          restoration.value = {
            revision,
            path,
            preview,
            documentSnapshot: getDocumentSnapshot(preview.absolutePath),
          }
      },
      true,
    )
  })
  if (prepared && !disposed) {
    await nextTick()
    dialog.value?.querySelector<HTMLButtonElement>('[data-restore-cancel]')?.focus()
  }
}

const handleRestore = () =>
  repository.execute('正在恢复文件…', async () => {
    const restore = restoration.value
    if (!restore) return
    await runVersionWrite(props.workspace, async () => {
      if (getDocumentSnapshot(restore.preview.absolutePath) !== restore.documentSnapshot)
        throw new Error(t('文档在确认后发生变化，请重新查看后再恢复。'))
      const path = await gitRestore(
        props.workspace,
        restore.revision,
        restore.path,
        restore.preview.fingerprint,
      )
      // 磁盘已经恢复成功，先退出确认状态，防止刷新失败后重复覆盖。
      restoration.value = null
      await reloadVersionDocument(path)
    })
    await repository.readStatus()
    return t('文件已恢复')
  })

const handleDismissFeedback = () => {
  repository.dismissFeedback()
  dialog.value?.focus()
}

const handleBranchChange = (branch: string) => {
  const fromRemote = branch.startsWith(':')
  void repository.switchBranch(fromRemote ? branch.slice(1) : branch, fromRemote)
}

const handleClose = () => {
  if (!busy.value) emit('close')
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (restoration.value && !busy.value) restoration.value = null
    else handleClose()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
    ) ?? [],
  ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0)
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first) {
    event.preventDefault()
    dialog.value?.focus()
    return
  }
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === dialog.value)
  ) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value?.focus()
})
watch(
  () => props.autoPushRevision,
  () => {
    void repository.execute(null, repository.readStatus)
  },
)
onBeforeUnmount(() => {
  disposed = true
  if (previousFocus?.isConnected) void nextTick(() => previousFocus?.focus())
})
</script>

<template>
  <Teleport to="body">
    <div class="lume-git-backdrop" @keydown.stop="handleKeydown">
      <section
        ref="dialog"
        class="lume-git"
        role="dialog"
        aria-modal="true"
        aria-labelledby="git-dialog-title"
        tabindex="-1"
      >
        <header class="lume-git__header">
          <GitBranch :size="18" aria-hidden="true" />
          <div class="lume-git__title">
            <h2 id="git-dialog-title">{{ t('版本管理') }}</h2>
            <span class="lume-git__title-separator" aria-hidden="true">/</span>
            <span class="lume-git__repository-name" :title="repositoryPath">{{
              repositoryName
            }}</span>
          </div>
          <button
            type="button"
            :disabled="busy"
            :aria-label="t('关闭')"
            :title="t('关闭')"
            @click="handleClose"
          >
            <X :size="18" />
          </button>
        </header>
        <div v-if="status && !status.root" class="lume-git__welcome">
          <GitBranch :size="36" :stroke-width="1.4" />
          <h3>{{ t('为这个工作区保存版本') }}</h3>
          <p>{{ t('创建本地 Git 仓库后，可以提交修改、查看历史和恢复文件。') }}</p>
          <button
            type="button"
            class="lume-git__primary"
            :disabled="busy"
            @click="repository.initialize()"
          >
            {{ t('启用本地版本管理') }}
          </button>
        </div>
        <template v-else-if="status">
          <div class="lume-git__repository-state">
            <div class="lume-git__local-state">
              <SettingsSelect
                v-if="hasOtherBranches"
                id="git-current-branch"
                class="lume-git__branch-select"
                :data-current-branch="!!status.branch"
                :label="t('当前分支')"
                :value="status.branch || t('独立 HEAD')"
                :options="branchOptions"
                :container="dialog"
                :disabled="busy || !writable || !!restoration"
                compact
                searchable
                @change="handleBranchChange"
              />
              <div v-else class="lume-git__branch-summary">
                <span class="lume-git__branch-label">{{ t('当前分支') }}</span>
                <span
                  class="lume-git__branch-badge"
                  :data-current-branch="!!status.branch"
                  :title="status.branch ?? undefined"
                >
                  {{ status.branch || t('独立 HEAD') }}
                </span>
              </div>
              <code :title="status.head ?? undefined">
                {{ status.head?.slice(0, 10) || t('尚无提交') }}
              </code>
            </div>
            <GitRemote
              v-if="
                remote &&
                ((status.branch && status.head) || remote.fetchRemotes.length) &&
                !restoration &&
                !isMerging
              "
              :key="status.branch"
              :branch="status.branch"
              :head="status.head"
              :remote="remote"
              :stale="remoteStale"
              :disabled="busy || !writable"
              @push="repository.push"
              @fetch="repository.fetchRemote"
              @update="repository.updateFromRemote"
            />
          </div>
          <p v-if="!status.writable" class="lume-git__warning">
            {{
              t(
                '当前工作区是仓库的子目录，仅可查看。请打开仓库根目录 {0} 以提交或恢复文件。',
                repositoryPath,
              )
            }}
          </p>
          <p v-if="status.operation && !status.mergeHead" class="lume-git__warning">
            {{ t('仓库有未完成操作或锁占用（{0}），请先在 Git 工具中处理。', status.operation) }}
          </p>
          <p
            v-else-if="!status.mergeHead && !writable && status.writable"
            class="lume-git__warning"
          >
            {{ t('仓库存在未解决冲突，请先在 Git 工具中处理。') }}
          </p>
          <p v-if="!status.branch" class="lume-git__warning">
            {{ t('当前处于独立 HEAD，请先切换到本地分支。') }}
          </p>
          <GitMergePanel
            v-if="isMerging"
            :key="status.mergeHead ?? undefined"
            :workspace="workspace"
            :status="status"
            :busy="busy"
            @resolve="repository.resolveConflict"
            @finish="repository.finishMerge"
            @author="repository.configureAuthor"
          />
          <template v-else>
            <p v-if="remoteError" class="lume-git__warning">{{ remoteError }}</p>
            <nav class="lume-git__tabs" :aria-label="t('版本管理')">
              <button
                type="button"
                :aria-pressed="tab === 'changes'"
                :disabled="busy || !!restoration"
                @click="tab = 'changes'"
              >
                {{ t('变更') }} {{ status.changes.length }}
              </button>
              <button
                type="button"
                :aria-pressed="tab === 'history'"
                :disabled="busy || !!restoration"
                @click="tab = 'history'"
              >
                {{ t('历史') }}
              </button>
            </nav>
            <div
              v-if="restoration"
              class="lume-git__restore"
              role="alertdialog"
              aria-labelledby="git-restore-title"
              aria-describedby="git-restore-description"
            >
              <h3 id="git-restore-title">{{ t('确认恢复文件') }}</h3>
              <p>
                {{ restoration.path }} · <code>{{ restoration.revision.slice(0, 10) }}</code>
              </p>
              <p id="git-restore-description">
                {{
                  t(
                    '将用此历史版本覆盖当前文件。当前内容已保存到磁盘，但未提交的内容可能被覆盖。恢复不会修改提交历史或暂存区。',
                  )
                }}
              </p>
              <div>
                <button
                  data-restore-cancel
                  type="button"
                  :disabled="busy"
                  @click="restoration = null"
                >
                  {{ t('取消') }}
                </button>
                <button
                  type="button"
                  class="lume-git__primary"
                  :disabled="busy"
                  @click="handleRestore"
                >
                  {{ t('确认恢复') }}
                </button>
              </div>
            </div>
            <div v-else class="lume-git__body" :aria-busy="busy">
              <GitChanges
                v-if="tab === 'changes'"
                v-model:message="message"
                :status="status"
                :busy="busy"
                :writable="writable"
                :diff="diff"
                :diff-path="diffPath"
                :diff-staged="diffStaged"
                :diff-loading="diffLoading"
                @stage="repository.stage"
                @diff="repository.showDiff"
                @commit="repository.commit()"
                @author="repository.configureAuthor"
              />
              <GitHistory
                v-else
                :key="`${status.branch}:${status.head}`"
                :workspace="workspace"
                :writable="writable"
                :busy="busy"
                @restore="handlePrepareRestore"
              />
            </div>
          </template>
        </template>
        <footer class="lume-git__feedback" :data-kind="feedback?.kind">
          <div class="lume-git__feedback-message" role="status" aria-atomic="true">
            <template v-if="feedback && feedback.kind !== 'error'">
              <LoaderCircle
                v-if="feedback.kind === 'pending'"
                class="lume-git__feedback-spinner"
                :size="15"
                aria-hidden="true"
              />
              <CircleCheck v-else :size="15" aria-hidden="true" />
              <p>{{ feedback.message }}</p>
            </template>
          </div>
          <div class="lume-git__feedback-message" role="alert" aria-atomic="true">
            <template v-if="feedback?.kind === 'error'">
              <CircleAlert :size="15" aria-hidden="true" />
              <p class="lume-git__error">{{ feedback.message }}</p>
            </template>
          </div>
          <button
            v-if="feedback?.kind === 'error' && !status && isTauri()"
            type="button"
            class="lume-git__feedback-retry"
            :disabled="busy"
            @click="repository.refresh()"
          >
            {{ t('重新读取仓库状态') }}
          </button>
          <button
            v-else-if="feedback?.kind === 'error'"
            type="button"
            class="lume-git__feedback-dismiss"
            :aria-label="t('关闭提示')"
            :title="t('关闭提示')"
            @click="handleDismissFeedback"
          >
            <X :size="14" aria-hidden="true" />
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
