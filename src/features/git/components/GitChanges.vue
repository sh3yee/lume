<script setup lang="ts">
import {
  ChevronRight,
  Copy,
  File,
  FileCog,
  FileMinus2,
  FilePenLine,
  FilePlus2,
  FileSymlink,
  FileWarning,
} from 'lucide-vue-next'
import { computed, shallowRef, watch, type Component } from 'vue'
import { t, type MessageKey } from '@/app/i18n'
import type { GitStatus } from '@/platform/tauri/git'
import GitDiff from './GitDiff.vue'

const props = defineProps<{
  status: GitStatus
  busy: boolean
  writable: boolean
  diff: string
  diffPath: string
  diffStaged: boolean
  diffLoading: boolean
}>()
const message = defineModel<string>('message', { required: true })
const emit = defineEmits<{
  stage: [path: string, staged: boolean]
  diff: [path: string, staged: boolean]
  commit: []
  author: [name: string, email: string]
}>()

interface FileIndicator {
  icon: Component
  label: MessageKey
  tone?: 'added' | 'alert'
}

const defaultIndicator: FileIndicator = { icon: File, label: '变更' }
const fileIndicators: Partial<Record<string, FileIndicator>> = {
  '?': { icon: FilePlus2, label: '未跟踪', tone: 'added' },
  A: { icon: FilePlus2, label: '已新增', tone: 'added' },
  M: { icon: FilePenLine, label: '已修改' },
  D: { icon: FileMinus2, label: '已删除', tone: 'alert' },
  R: { icon: FileSymlink, label: '已重命名' },
  C: { icon: Copy, label: '已复制' },
  T: { icon: FileCog, label: '文件类型已更改' },
  U: { icon: FileWarning, label: '未合并', tone: 'alert' },
}

const authorOpen = shallowRef(false)
const authorName = shallowRef('')
const authorEmail = shallowRef('')
const staged = computed(() =>
  props.status.changes.filter((change) => change.index !== ' ' && change.index !== '?'),
)
const unstaged = computed(() => props.status.changes.filter((change) => change.working !== ' '))
const plainPreview = computed(() =>
  props.status.changes.some((change) => change.path === props.diffPath && change.index === '?'),
)
const groups = computed(() =>
  [
    { label: t('已暂存'), staged: true, files: staged.value },
    { label: t('未暂存'), staged: false, files: unstaged.value },
  ].map((group) => ({
    ...group,
    files: group.files.map((file) => ({
      ...file,
      indicator: fileIndicators[group.staged ? file.index : file.working] ?? defaultIndicator,
    })),
  })),
)
watch(
  () => [props.status.authorName, props.status.authorEmail],
  ([name, email]) => {
    authorName.value = name
    authorEmail.value = email
  },
  { immediate: true },
)
</script>

<template>
  <div class="lume-git__columns">
    <div class="lume-git__list-pane">
      <p v-if="!status.changes.length" class="lume-git__empty">{{ t('工作区没有变更') }}</p>
      <section v-for="group in groups" :key="String(group.staged)" class="lume-git__group">
        <h3>
          {{ group.label }} <span>{{ group.files.length }}</span>
        </h3>
        <div v-for="file in group.files" :key="file.path" class="lume-git__file-row">
          <button
            type="button"
            class="lume-git__file"
            :class="{ 'is-selected': file.path === diffPath && group.staged === diffStaged }"
            :title="file.previousPath ? `${file.previousPath} → ${file.path}` : file.path"
            :aria-label="`${file.path} · ${t(file.indicator.label)}`"
            :disabled="busy"
            @click="emit('diff', file.path, group.staged)"
          >
            <span
              class="lume-git__file-status"
              :data-tone="file.indicator.tone"
              :title="t(file.indicator.label)"
              aria-hidden="true"
            >
              <component :is="file.indicator.icon" :size="14" />
            </span>
            <span>{{ file.path }}</span>
          </button>
          <button
            type="button"
            class="lume-git__small-action"
            :disabled="busy || !writable"
            :title="t(group.staged ? '取消暂存 {0}' : '暂存 {0}', file.path)"
            :aria-label="t(group.staged ? '取消暂存 {0}' : '暂存 {0}', file.path)"
            @click="emit('stage', file.path, !group.staged)"
          >
            {{ group.staged ? '−' : '+' }}
          </button>
        </div>
      </section>
      <form class="lume-git__commit" @submit.prevent="emit('commit')">
        <label for="git-commit-message">{{ t('提交说明') }}</label>
        <textarea
          id="git-commit-message"
          v-model="message"
          :disabled="busy"
          rows="3"
          :placeholder="t('描述这次修改')"
        ></textarea>
        <p class="lume-git__hint">{{ t('仅提交已暂存内容；保存后的新修改仍需暂存。') }}</p>
        <button
          type="submit"
          class="lume-git__primary"
          :disabled="
            busy ||
            !writable ||
            !status.branch ||
            !staged.length ||
            !message.trim() ||
            !status.authorName ||
            !status.authorEmail
          "
        >
          {{ t('提交已暂存内容') }}
        </button>
      </form>
      <details
        :open="authorOpen || !status.authorName || !status.authorEmail"
        class="lume-git__author"
      >
        <summary @click.prevent="authorOpen = !authorOpen">
          <ChevronRight class="lume-git__author-chevron" :size="14" aria-hidden="true" />
          {{ t('提交作者') }}
        </summary>
        <form @submit.prevent="emit('author', authorName, authorEmail)">
          <label for="git-author-name">{{ t('姓名') }}</label>
          <input
            id="git-author-name"
            v-model="authorName"
            autocomplete="name"
            :disabled="busy || !writable"
          />
          <label for="git-author-email">{{ t('邮箱') }}</label>
          <input
            id="git-author-email"
            v-model="authorEmail"
            type="email"
            autocomplete="email"
            :disabled="busy || !writable"
          />
          <button
            type="submit"
            :disabled="busy || !writable || !authorName.trim() || !authorEmail.trim()"
          >
            {{ t('保存到当前仓库') }}
          </button>
        </form>
      </details>
    </div>
    <div class="lume-git__preview-pane">
      <div class="lume-git__preview-heading">
        <span>{{ diffPath || t('选择文件查看差异') }}</span>
        <small v-if="diffPath">{{ t(diffStaged ? '已暂存' : '未暂存') }}</small>
      </div>
      <GitDiff :content="diff" :loading="diffLoading" :plain="plainPreview" />
    </div>
  </div>
</template>
