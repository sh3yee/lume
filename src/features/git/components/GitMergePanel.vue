<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { t } from '@/app/i18n'
import { gitConflict, type GitConflict, type GitConflictResolution } from '@/platform/tauri/git'
import { findConflictBlocks } from '../conflictBlocks'
import { isGitConflict } from '../gitConflictPaths'
import { gitErrorMessage } from '../useGitRepository'
import type { GitStatus } from '@/platform/tauri/git'

const props = defineProps<{ workspace: string; status: GitStatus; busy: boolean }>()
const emit = defineEmits<{
  resolve: [path: string, snapshot: string, resolution: GitConflictResolution]
  finish: [abort: boolean]
  author: [name: string, email: string]
}>()

const selectedPath = shallowRef('')
const conflict = shallowRef<GitConflict | null>(null)
const draft = shallowRef('')
const copyName = shallowRef('')
const error = shallowRef('')
const loading = shallowRef(false)
const confirmAbort = shallowRef(false)
const authorName = shallowRef(props.status.authorName)
const authorEmail = shallowRef(props.status.authorEmail)
let request = 0

const paths = computed(() => props.status.changes.filter(isGitConflict).map(({ path }) => path))
const staged = computed(() =>
  props.status.changes.filter(({ index }) => index !== ' ' && index !== '?'),
)
const canEdit = computed(() => {
  const value = conflict.value
  return (
    value &&
    value.worktree !== null &&
    value.local?.content != null &&
    value.remote?.content != null
  )
})
const versions = computed(() => [
  { label: t('共同版本'), value: conflict.value?.base },
  { label: t('本地版本'), value: conflict.value?.local },
  { label: t('远程版本'), value: conflict.value?.remote },
])
const blocks = computed(() => (canEdit.value ? findConflictBlocks(draft.value) : []))

const selectConflict = async (path: string) => {
  const current = ++request
  selectedPath.value = path
  conflict.value = null
  error.value = ''
  copyName.value = ''
  loading.value = Boolean(path)
  if (!path) return
  try {
    const result = await gitConflict(props.workspace, path)
    if (current !== request) return
    conflict.value = result
    draft.value = result.worktree ?? ''
  } catch (failure) {
    if (current === request) error.value = gitErrorMessage(failure)
  } finally {
    if (current === request) loading.value = false
  }
}

const chooseBlock = (block: (typeof blocks.value)[number], side: 'local' | 'remote') => {
  draft.value = draft.value.slice(0, block.start) + block[side] + draft.value.slice(block.end)
}

const resolve = (resolution: GitConflictResolution) => {
  if (conflict.value) emit('resolve', selectedPath.value, conflict.value.snapshot, resolution)
}

watch(
  paths,
  (current) => {
    if (!current.includes(selectedPath.value)) void selectConflict(current[0] ?? '')
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  request++
})
</script>

<template>
  <section class="git-merge">
    <header class="git-merge__header">
      <div>
        <h3>{{ t('合并远程分支') }}</h3>
        <p>
          {{
            paths.length
              ? t('还有 {0} 个文件需要解决冲突。', paths.length)
              : t('合并内容已暂存，可以创建合并提交。')
          }}
        </p>
      </div>
      <button v-if="!confirmAbort" type="button" :disabled="busy" @click="confirmAbort = true">
        {{ t('中止合并') }}
      </button>
      <button
        type="button"
        class="lume-git__primary"
        :disabled="
          busy || !status.mergeTree || !status.authorName || !status.authorEmail || confirmAbort
        "
        @click="emit('finish', false)"
      >
        {{ t('提交合并') }}
      </button>
    </header>
    <div v-if="confirmAbort" class="git-merge__confirm">
      <p>{{ t('中止合并会丢弃这次合并的结果和已处理的冲突。') }}</p>
      <button type="button" :disabled="busy" @click="confirmAbort = false">{{ t('取消') }}</button>
      <button type="button" :disabled="busy" @click="emit('finish', true)">
        {{ t('确认中止合并') }}
      </button>
    </div>
    <form
      v-if="!status.authorName || !status.authorEmail"
      class="git-merge__row"
      @submit.prevent="emit('author', authorName, authorEmail)"
    >
      <input
        v-model="authorName"
        :aria-label="t('姓名')"
        :placeholder="t('姓名')"
        required
        :disabled="busy"
      />
      <input
        v-model="authorEmail"
        :aria-label="t('邮箱')"
        :placeholder="t('邮箱')"
        required
        :disabled="busy"
      />
      <button type="submit" :disabled="busy">{{ t('保存到当前仓库') }}</button>
    </form>

    <details v-if="!paths.length && staged.length">
      <summary>{{ t('待提交文件（{0}）', staged.length) }}</summary>
      <ul>
        <li v-for="file in staged" :key="file.path">{{ file.path }}</li>
      </ul>
    </details>

    <div v-if="paths.length" class="git-merge__content">
      <nav class="git-merge__files" :aria-label="t('冲突文件')">
        <button
          v-for="path in paths"
          :key="path"
          type="button"
          :aria-pressed="path === selectedPath"
          :disabled="busy"
          :title="path"
          @click="selectConflict(path)"
        >
          {{ path }}
        </button>
      </nav>
      <div class="git-merge__editor" :aria-busy="loading">
        <p v-if="loading" role="status">{{ t('正在读取冲突文件…') }}</p>
        <p v-else-if="error" class="lume-git__error" role="alert">{{ error }}</p>
        <template v-else-if="conflict">
          <div class="git-merge__versions">
            <details v-for="version in versions" :key="version.label">
              <summary>{{ version.label }}</summary>
              <pre v-if="version.value?.content != null">{{ version.value.content }}</pre>
              <p v-else>
                {{ version.value ? t('此版本无法预览为文本') : t('此版本中没有该文件') }}
              </p>
            </details>
          </div>
          <div class="git-merge__row">
            <button type="button" :disabled="busy" @click="resolve({ kind: 'local' })">
              {{ t(conflict.local ? '保留本地版本' : '采用本地删除') }}
            </button>
            <button type="button" :disabled="busy" @click="resolve({ kind: 'remote' })">
              {{ t(conflict.remote ? '保留远程版本' : '采用远程删除') }}
            </button>
          </div>
          <template v-if="canEdit">
            <label class="git-merge__result">
              <span>{{ t('合并结果') }}</span>
              <textarea v-model="draft" :disabled="busy" spellcheck="false" />
            </label>
            <div v-for="(block, index) in blocks" :key="block.start" class="git-merge__row">
              <span>{{ t('冲突块 {0}', index + 1) }}</span>
              <button type="button" :disabled="busy" @click="chooseBlock(block, 'local')">
                {{ t('采用本地片段') }}
              </button>
              <button type="button" :disabled="busy" @click="chooseBlock(block, 'remote')">
                {{ t('采用远程片段') }}
              </button>
            </div>
            <div class="git-merge__row">
              <button
                type="button"
                class="lume-git__primary"
                :disabled="busy || !!blocks.length"
                @click="resolve({ kind: 'text', content: draft })"
              >
                {{ t('保存并标记为已解决') }}
              </button>
            </div>
          </template>
          <div v-else-if="conflict.local || conflict.remote" class="git-merge__row">
            <input
              v-model.trim="copyName"
              :aria-label="t('副本文件名')"
              :placeholder="t('副本文件名')"
              :disabled="busy"
            />
            <button
              v-if="conflict.local"
              type="button"
              :disabled="busy || !copyName"
              @click="resolve({ kind: 'copyLocal', name: copyName })"
            >
              {{ t('另存本地版本') }}
            </button>
            <button
              v-if="conflict.remote"
              type="button"
              :disabled="busy || !copyName"
              @click="resolve({ kind: 'copyRemote', name: copyName })"
            >
              {{ t('另存远程版本') }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.git-merge {
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-4);
  min-height: 0;
  padding: var(--lume-space-5);
  overflow: auto;
}
.git-merge__header,
.git-merge__row,
.git-merge__confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--lume-space-3);
}
.git-merge__header > div,
.git-merge__confirm > p {
  flex: 1;
}
.git-merge__header p,
.git-merge__row span,
.git-merge details p {
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-xs);
}
.git-merge__confirm {
  padding: var(--lume-space-3);
  background: var(--lume-color-warning-bg);
  border-radius: var(--lume-radius-md);
}
.git-merge__content {
  display: grid;
  grid-template-columns: minmax(115px, 1fr) minmax(0, 3fr);
  gap: var(--lume-space-4);
}
.git-merge__files,
.git-merge__editor,
.git-merge__result {
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-3);
  min-width: 0;
}
.git-merge__files button {
  text-align: left;
  overflow-wrap: anywhere;
}
.git-merge__files button[aria-pressed='true'] {
  color: var(--lume-accent-default);
  background: var(--lume-accent-subtle);
}
.git-merge__versions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--lume-space-3);
}
.git-merge details {
  padding: var(--lume-space-3);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
}
.git-merge pre {
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.git-merge textarea {
  width: 100%;
  min-height: 180px;
  padding: var(--lume-space-3);
  resize: vertical;
  color: var(--lume-text-primary);
  background: var(--lume-bg-surface);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  font-family: var(--lume-font-mono);
}
@media (max-width: 640px) {
  .git-merge__content,
  .git-merge__versions {
    grid-template-columns: 1fr;
  }
}
</style>
