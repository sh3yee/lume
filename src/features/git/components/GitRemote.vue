<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { t } from '@/app/i18n'
import type { GitPushTarget, GitRemoteStatus, GitUpdateTarget } from '@/platform/tauri/git'

const props = defineProps<{
  branch: string
  head: string | null
  remote: GitRemoteStatus
  stale: boolean
  disabled: boolean
}>()
const emit = defineEmits<{
  push: [target: GitPushTarget]
  fetch: [target: GitPushTarget]
  update: [target: GitUpdateTarget]
}>()

const connectButton = useTemplateRef<HTMLButtonElement>('connectButton')
const form = useTemplateRef<HTMLFormElement>('form')
const connecting = shallowRef(false)
const remoteName = shallowRef('')
const url = shallowRef('')
const targetBranch = shallowRef('')
const updating = shallowRef<GitUpdateTarget | null>(null)

const upstreamTarget = computed<GitPushTarget | null>(() => {
  const upstream = props.remote.upstream
  const address = props.remote.remotes.find(({ name }) => name === upstream?.remoteName)?.url
  if (!upstream || !address) return null
  return { remoteName: upstream.remoteName, url: address, targetBranch: upstream.targetBranch }
})

const upstreamRef = computed(() => {
  const upstream = props.remote.upstream
  return upstream ? `${upstream.remoteName}/${upstream.targetBranch}` : ''
})

const selectedRemote = computed(() =>
  props.remote.remotes.find(({ name }) => name === remoteName.value),
)

const firstTarget = computed<GitPushTarget>(() => ({
  remoteName: selectedRemote.value?.name ?? null,
  url: selectedRemote.value?.url ?? url.value.trim(),
  targetBranch: targetBranch.value.trim(),
}))

const statusLabel = computed(() => {
  const upstream = props.remote.upstream
  if (!upstream) return t('当前分支尚未连接远程')
  const { ahead, behind } = upstream
  if (ahead === null || behind === null) return t('等待获取远程状态')
  if (behind > 0 && ahead > 0)
    return t('本地有 {0} 个提交待推送，远程有 {1} 个新提交，请先整合更新。', ahead, behind)
  if (behind > 0) return t('远程有 {0} 个新提交，请先整合更新。', behind)
  if (ahead > 0) return t('{0} 个提交待推送', ahead)
  return t('无待推送提交')
})

const canPush = computed(() => {
  const upstream = props.remote.upstream
  return upstream && upstream.ahead !== 0 && !upstream.behind
})
const noPendingPush = computed(() => {
  const upstream = props.remote.upstream
  return upstream?.ahead === 0 && upstream.behind === 0
})
const updateTarget = computed<GitUpdateTarget | null>(() => {
  const upstream = props.remote.upstream
  if (!props.head || !upstream?.head || !upstream.behind || upstream.ahead === null) return null
  return {
    branch: props.branch,
    head: props.head,
    upstreamHead: upstream.head,
    merge: upstream.ahead > 0,
  }
})
const canConfirm = computed(
  () => !props.disabled && Boolean(firstTarget.value.url && firstTarget.value.targetBranch),
)

const handleConnect = async () => {
  remoteName.value = props.remote.remotes.length === 1 ? (props.remote.remotes[0]?.name ?? '') : ''
  url.value = ''
  targetBranch.value = props.branch
  connecting.value = true
  await nextTick()
  form.value?.querySelector<HTMLElement>('select, input')?.focus()
}

const handleCancel = () => {
  connecting.value = false
  connectButton.value?.focus()
}

const handleConfirm = () => {
  if (canConfirm.value) emit('push', firstTarget.value)
}

const handleUpdate = () => {
  if (!updating.value || props.disabled) return
  emit('update', updating.value)
  updating.value = null
}

watch(
  () => Boolean(upstreamTarget.value),
  (hasUpstream) => {
    if (hasUpstream) connecting.value = false
  },
)
</script>

<template>
  <section class="git-remote" :aria-label="t('远程仓库')">
    <div class="git-remote__row">
      <span
        v-if="!noPendingPush"
        class="git-remote__summary"
        aria-live="polite"
        :title="upstreamTarget ? t('根据上次获取或推送的结果显示。') : undefined"
      >
        {{ statusLabel }}
      </span>
      <div v-if="upstreamTarget" class="git-remote__buttons">
        <button
          type="button"
          :disabled="disabled"
          :title="`${upstreamRef}\n${upstreamTarget.url}`"
          :aria-label="`${t('获取远程状态')} · ${upstreamRef}`"
          @click="emit('fetch', upstreamTarget)"
        >
          {{ t('获取远程状态') }}
        </button>
        <button
          v-if="updateTarget"
          type="button"
          class="lume-git__primary"
          :disabled="disabled || !!updating"
          :aria-expanded="!!updating"
          @click="updating = updateTarget"
        >
          {{ t(updateTarget.merge ? '合并远程分支' : '应用远程更新') }}
        </button>
        <span v-else class="git-remote__push" :title="noPendingPush ? statusLabel : undefined">
          <button
            type="button"
            :class="{ 'lume-git__primary': !disabled && canPush }"
            :aria-label="noPendingPush ? `${t('推送')} · ${statusLabel}` : undefined"
            :disabled="disabled || !canPush"
            @click="emit('push', upstreamTarget)"
          >
            {{ t('推送') }}
          </button>
        </span>
      </div>
      <button
        v-else
        ref="connectButton"
        type="button"
        :disabled="disabled || connecting"
        :aria-expanded="connecting"
        @click="handleConnect"
      >
        {{ t('连接远程仓库') }}
      </button>
    </div>
    <p v-if="stale" class="git-remote__hint" role="status">
      {{ t('远程状态可能已过期，请重新获取。') }}
    </p>
    <div v-if="updating" class="git-remote__form">
      <p>
        {{
          updating.merge
            ? t('将合并远程提交和本地提交。请先提交或移走未提交的文件改动。')
            : t('将把当前分支快进到已获取的远程提交。请先提交或移走未提交的文件改动。')
        }}
      </p>
      <div class="git-remote__actions">
        <button type="button" :disabled="disabled" @click="updating = null">{{ t('取消') }}</button>
        <button type="button" class="lume-git__primary" :disabled="disabled" @click="handleUpdate">
          {{ t(updating.merge ? '开始合并' : '确认更新') }}
        </button>
      </div>
    </div>
    <form v-if="connecting" ref="form" class="git-remote__form" @submit.prevent="handleConfirm">
      <label v-if="remote.remotes.length" class="git-remote__field">
        <span>{{ t('远程仓库') }}</span>
        <select v-model="remoteName" :disabled="disabled">
          <option value="">{{ t('添加远程仓库') }}</option>
          <option v-for="item in remote.remotes" :key="item.name" :value="item.name">
            {{ item.name }}
          </option>
        </select>
      </label>
      <label v-if="!selectedRemote" class="git-remote__field git-remote__address">
        <span>{{ t('仓库地址') }}</span>
        <input
          v-model="url"
          placeholder="https://host/owner/repo.git"
          autocomplete="off"
          spellcheck="false"
          required
          :disabled="disabled"
        />
      </label>
      <label class="git-remote__field">
        <span>{{ t('目标分支') }}</span>
        <input
          v-model="targetBranch"
          autocomplete="off"
          spellcheck="false"
          required
          :disabled="disabled"
        />
      </label>
      <p v-if="selectedRemote" class="git-remote__hint">{{ selectedRemote.url }}</p>
      <p class="git-remote__hint">{{ t('将把当前分支的已提交记录推送到目标分支。') }}</p>
      <div class="git-remote__actions">
        <button type="button" :disabled="disabled" @click="handleCancel">{{ t('取消') }}</button>
        <button type="submit" class="lume-git__primary" :disabled="!canConfirm">
          {{ t('确认并推送') }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.git-remote {
  flex: 1 1 380px;
  min-width: 0;
}

.git-remote__row,
.git-remote__buttons,
.git-remote__form,
.git-remote__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.git-remote__row {
  min-height: 30px;
  justify-content: flex-end;
  gap: 6px 12px;
}

.git-remote__row button {
  padding: 4px 8px;
}

.git-remote__push[title] > button:disabled {
  pointer-events: none;
}

.git-remote__summary {
  min-width: 0;
  color: var(--lume-text-secondary);
  overflow-wrap: anywhere;
}

.git-remote__form {
  margin-top: 10px;
  align-items: end;
}

.git-remote__field {
  display: flex;
  flex: 1 1 125px;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.git-remote__address {
  flex-grow: 2;
}

.git-remote__hint {
  flex-basis: 100%;
  font-size: 12px;
  color: var(--lume-text-secondary);
  overflow-wrap: anywhere;
}

.git-remote__actions {
  flex-basis: 100%;
  justify-content: flex-end;
}

@media (max-width: 680px) {
  .git-remote__row {
    justify-content: flex-start;
  }
}
</style>
