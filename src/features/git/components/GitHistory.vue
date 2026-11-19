<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { language, t } from '@/app/i18n'
import {
  gitFileVersion,
  gitHistory,
  gitHistoryDiff,
  gitHistoryFiles,
  type GitCommit,
  type GitFileVersion,
  type GitHistoryFile,
} from '@/platform/tauri/git'
import { gitFileIndicator } from '../gitFileIndicators'
import { gitErrorMessage } from '../useGitRepository'
import GitDiff from './GitDiff.vue'

const props = defineProps<{ workspace: string; writable: boolean; busy: boolean }>()
const emit = defineEmits<{ restore: [revision: string, path: string] }>()
const commits = shallowRef<GitCommit[]>([])
const selected = shallowRef<GitCommit | null>(null)
const files = shallowRef<GitHistoryFile[]>([])
const path = shallowRef('')
const filter = shallowRef('')
const appliedFilter = shallowRef('')
const mode = shallowRef<'diff' | 'file'>('diff')
const diff = shallowRef('')
const version = shallowRef<GitFileVersion | null>(null)
const loading = shallowRef(false)
const filesLoading = shallowRef(false)
const previewLoading = shallowRef(false)
const hasMore = shallowRef(false)
const error = shallowRef('')
let disposed = false
let request = 0
let historyRequest = 0
const changedFiles = computed(() =>
  files.value.map((file) => {
    const parts = file.path.split('/')
    const name = parts.pop() ?? file.path
    return {
      ...file,
      name,
      directory: parts.join('/'),
      indicator: gitFileIndicator(file.status),
    }
  }),
)
const preview = computed(() =>
  mode.value === 'diff'
    ? diff.value
    : (version.value?.content ??
      t(version.value?.binary ? '二进制或较大文件不提供文本预览' : '此版本中没有可显示的普通文件')),
)

const load = async (append = false) => {
  if (loading.value) return
  const current = ++historyRequest
  loading.value = true
  error.value = ''
  if (!append) {
    request++
    selected.value = null
    files.value = []
    path.value = ''
    diff.value = ''
    version.value = null
    appliedFilter.value = filter.value.trim()
  }
  try {
    const page = await gitHistory(
      props.workspace,
      append ? commits.value.length : 0,
      appliedFilter.value || null,
    )
    if (disposed || current !== historyRequest) return
    commits.value = append ? [...commits.value, ...page.commits] : page.commits
    hasMore.value = page.hasMore
  } catch (failure) {
    if (!disposed && current === historyRequest) error.value = gitErrorMessage(failure)
  } finally {
    if (!disposed && current === historyRequest) loading.value = false
  }
}

const selectCommit = async (commit: GitCommit) => {
  const current = ++request
  selected.value = commit
  path.value = ''
  diff.value = ''
  version.value = null
  files.value = []
  filesLoading.value = true
  previewLoading.value = false
  error.value = ''
  try {
    const result = await gitHistoryFiles(props.workspace, commit.id)
    if (!disposed && current === request) files.value = result
  } catch (failure) {
    if (!disposed && current === request) error.value = gitErrorMessage(failure)
  } finally {
    if (!disposed && current === request) filesLoading.value = false
  }
}

const selectFile = async (filePath: string) => {
  if (!selected.value) return
  const current = ++request
  path.value = filePath
  diff.value = ''
  version.value = null
  previewLoading.value = true
  error.value = ''
  const results = await Promise.allSettled([
    gitHistoryDiff(props.workspace, selected.value.id, filePath),
    gitFileVersion(props.workspace, selected.value.id, filePath),
  ])
  if (disposed || current !== request) return
  diff.value =
    results[0].status === 'fulfilled' ? results[0].value : gitErrorMessage(results[0].reason)
  if (results[1].status === 'fulfilled') version.value = results[1].value
  else error.value = gitErrorMessage(results[1].reason)
  previewLoading.value = false
}

const formatDate = (date: string) => new Date(date).toLocaleString(language.value)
onMounted(() => {
  void load()
})
onBeforeUnmount(() => {
  disposed = true
  request++
  historyRequest++
})
</script>

<template>
  <div class="lume-git__history">
    <form class="lume-git__history-filter" @submit.prevent="load()">
      <input
        v-model="filter"
        :aria-label="t('按文件路径筛选历史')"
        :placeholder="t('仓库相对文件路径，留空查看全部历史')"
        :disabled="loading || busy"
      />
      <button type="submit" :disabled="loading || busy">{{ t('查看历史') }}</button>
    </form>
    <p v-if="error" class="lume-git__error" role="alert">{{ error }}</p>
    <div class="lume-git__columns">
      <div class="lume-git__list-pane">
        <p v-if="!commits.length && !loading" class="lume-git__empty">{{ t('暂无提交历史') }}</p>
        <button
          v-for="commit in commits"
          :key="commit.id"
          type="button"
          class="lume-git__commit-row"
          :class="{ 'is-selected': selected?.id === commit.id }"
          :disabled="busy"
          @click="selectCommit(commit)"
        >
          <strong :title="commit.message">{{ commit.message }}</strong>
          <code :title="commit.id">{{ commit.id.slice(0, 10) }}</code>
          <span>{{ commit.author }} · {{ formatDate(commit.date) }}</span>
        </button>
        <p v-if="loading" class="lume-git__empty" role="status">{{ t('正在读取…') }}</p>
        <button
          v-else-if="hasMore"
          type="button"
          class="lume-git__load-more"
          :disabled="busy"
          @click="load(true)"
        >
          {{ t('加载更多') }}
        </button>
      </div>
      <div class="lume-git__preview-pane">
        <p v-if="!selected" class="lume-git__empty">{{ t('选择提交查看变更文件') }}</p>
        <div v-else class="lume-git__history-files">
          <p v-if="filesLoading" class="lume-git__hint" role="status">{{ t('正在读取…') }}</p>
          <button
            v-for="file in changedFiles"
            :key="file.path"
            type="button"
            class="lume-git__file lume-git__history-file"
            :class="{ 'is-selected': path === file.path }"
            :aria-current="path === file.path ? 'true' : undefined"
            :aria-label="`${file.path} · ${t(file.indicator.label)}`"
            :title="file.path"
            :disabled="busy"
            @click="selectFile(file.path)"
          >
            <span class="lume-git__file-status" :data-tone="file.indicator.tone" aria-hidden="true">
              <component :is="file.indicator.icon" :size="14" />
            </span>
            <span class="lume-git__history-file-path">
              <span class="lume-git__history-file-name">{{ file.name }}</span>
              <small v-if="file.directory" class="lume-git__history-file-directory">
                {{ file.directory }}
              </small>
            </span>
            <small class="lume-git__history-file-label">{{ t(file.indicator.label) }}</small>
          </button>
          <p v-if="!filesLoading && !files.length" class="lume-git__hint">
            {{ t('此提交没有文件差异') }}
          </p>
        </div>
        <div v-if="path" class="lume-git__preview-heading">
          <span :title="path">{{ path }}</span>
          <button type="button" :aria-pressed="mode === 'diff'" @click="mode = 'diff'">
            {{ t('差异') }}
          </button>
          <button type="button" :aria-pressed="mode === 'file'" @click="mode = 'file'">
            {{ t('文件内容') }}
          </button>
          <button
            type="button"
            :disabled="busy || previewLoading || !writable || !version?.restorable"
            @click="selected && emit('restore', selected.id, path)"
          >
            {{ t('恢复此文件…') }}
          </button>
        </div>
        <GitDiff
          v-if="path"
          :content="preview"
          :loading="previewLoading"
          :plain="mode === 'file'"
        />
      </div>
    </div>
  </div>
</template>
