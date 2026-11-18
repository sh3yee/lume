<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { GitBranch, RefreshCw, X } from 'lucide-vue-next'
import { t } from '@/app/i18n'
import { useDocument } from '@/features/documents/model/useDocument'
import { isSameDocumentPath } from '@/features/documents/model/documentPath'
import { gitRestore, gitRestorePreview, type GitRestorePreview } from '@/platform/tauri/git'
import {
  reloadVersionDocument,
  runVersionWrite,
} from '@/features/workspace/services/workspaceOperations'
import { useGitRepository } from '../useGitRepository'
import GitChanges from './GitChanges.vue'
import GitHistory from './GitHistory.vue'
import GitRemote from './GitRemote.vue'
import '../git.css'

const props = defineProps<{ workspace: string }>()
const emit = defineEmits<{ close: [] }>()
const repository = useGitRepository(props.workspace)
const {
  status,
  remote,
  remoteError,
  busy,
  error,
  notice,
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
let disposed = false
let previousFocus: HTMLElement | null = null

const getDocumentSnapshot = (path: string) =>
  JSON.stringify(
    documents.value
      .filter((document) => isSameDocumentPath(document.path, path))
      .map(({ id, content, savedContent, isDirty }) => ({ id, content, savedContent, isDirty })),
  )

const handlePrepareRestore = async (revision: string, path: string) => {
  const prepared = await repository.execute(async () => {
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
  repository.execute(async () => {
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
    notice.value = t('文件已恢复为未暂存修改，历史与暂存区保持原样。')
  })

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
  ).filter((element) => element.getClientRects().length > 0)
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
        :aria-busy="busy"
      >
        <header class="lume-git__header">
          <GitBranch :size="20" />
          <div>
            <h2 id="git-dialog-title">{{ t('版本管理') }}</h2>
            <p :title="status?.root || workspace">{{ status?.root || workspace }}</p>
          </div>
          <button
            type="button"
            :disabled="busy"
            :aria-label="t('刷新')"
            :title="t('刷新')"
            @click="repository.refresh()"
          >
            <RefreshCw :size="16" />
          </button>
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
        <div class="lume-git__feedback" aria-live="polite">
          <p v-if="error" class="lume-git__error" role="alert">{{ error }}</p>
          <p v-else-if="busy" class="lume-git__hint">{{ t('正在处理版本操作…') }}</p>
          <p v-else-if="notice" class="lume-git__notice">{{ notice }}</p>
        </div>
        <div v-if="!status" class="lume-git__empty">
          {{ busy ? t('正在读取…') : t('点击刷新重新检查 Git 环境') }}
        </div>
        <div v-else-if="!status.root" class="lume-git__welcome">
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
        <template v-else>
          <div class="lume-git__repository-state">
            <span><GitBranch :size="14" /> {{ status.branch || t('独立 HEAD') }}</span>
            <code>{{ status.head?.slice(0, 10) || t('尚无提交') }}</code>
          </div>
          <p v-if="!status.writable" class="lume-git__warning">
            {{ t('当前工作区是仓库的子目录，仅可查看。请打开上方仓库根目录以提交或恢复文件。') }}
          </p>
          <p v-if="status.operation" class="lume-git__warning">
            {{ t('仓库有未完成操作或锁占用（{0}），请先在 Git 工具中处理。', status.operation) }}
          </p>
          <p v-else-if="!writable && status.writable" class="lume-git__warning">
            {{ t('仓库存在未解决冲突，请先在 Git 工具中处理。') }}
          </p>
          <p v-if="!status.branch" class="lume-git__warning">
            {{ t('当前处于独立 HEAD，请先在 Git 工具中切换到分支。') }}
          </p>
          <GitRemote
            v-if="remote && status.branch && !restoration"
            :key="status.branch"
            :branch="status.branch"
            :remote="remote"
            :disabled="busy || !writable"
            @push="repository.push"
            @fetch="repository.fetchRemote"
          />
          <p v-else-if="remoteError" class="lume-git__warning">{{ remoteError }}</p>
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
          <div v-else class="lume-git__body">
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
              :workspace="workspace"
              :writable="writable"
              :busy="busy"
              @restore="handlePrepareRestore"
            />
          </div>
        </template>
      </section>
    </div>
  </Teleport>
</template>
