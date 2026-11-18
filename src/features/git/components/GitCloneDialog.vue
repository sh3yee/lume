<script setup lang="ts">
import { onMounted, shallowRef, useTemplateRef } from 'vue'
import { t } from '@/app/i18n'
import { useWorkspaceCommands } from '@/features/workspace/commands/useWorkspaceCommands'
import { selectWorkspace } from '@/features/workspace/services/workspaceService'
import { runVersionWrite } from '@/features/workspace/services/workspaceOperations'
import { gitClone } from '@/platform/tauri/git'
import { gitErrorMessage } from '../useGitRepository'
import { cancelGitRemote, gitRemoteActivity } from '../gitRemoteActivity'

const emit = defineEmits<{ close: [] }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const url = shallowRef('')
const name = shallowRef('')
const parent = shallowRef('')
const busy = shallowRef(false)
const error = shallowRef('')
const clonedPath = shallowRef('')
const workspace = useWorkspaceCommands()

const chooseParent = async () => {
  try {
    const selected = await selectWorkspace()
    if (selected) parent.value = selected
  } catch (failure) {
    error.value = gitErrorMessage(failure)
  }
}

const suggestName = () => {
  if (name.value) return
  name.value = url.value.match(/(?:\/|:)([\w.-]+)\/?$/)?.[1]?.replace(/\.git$/i, '') ?? ''
}

const close = () => {
  if (busy.value) {
    void cancelGitRemote()
    return
  }
  dialog.value?.close()
}

const clone = async () => {
  if (busy.value || (!clonedPath.value && (!parent.value || !url.value || !name.value))) return
  busy.value = true
  error.value = ''
  let opened = false
  try {
    await runVersionWrite(parent.value, async () => {
      if (!clonedPath.value) clonedPath.value = await gitClone(parent.value, name.value, url.value)
      if (!(await workspace.loadWorkspace(clonedPath.value))) {
        throw new Error(t('已克隆到 {0}，但无法打开工作区。', clonedPath.value))
      }
      opened = true
    })
  } catch (failure) {
    error.value = gitErrorMessage(failure)
  } finally {
    busy.value = false
  }
  if (opened) close()
}

onMounted(() => dialog.value?.showModal())
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="lume-git-clone"
      aria-labelledby="git-clone-title"
      @cancel.prevent="close"
      @close="emit('close')"
    >
      <form @submit.prevent="clone">
        <h2 id="git-clone-title">{{ t('克隆仓库') }}</h2>
        <label>
          <span>{{ t('仓库地址') }}</span>
          <input
            v-model.trim="url"
            placeholder="https://host/owner/repo.git"
            autocomplete="off"
            spellcheck="false"
            required
            :disabled="busy || !!clonedPath"
            @blur="suggestName"
          />
        </label>
        <div class="lume-git-clone__destination">
          <button type="button" :disabled="busy || !!clonedPath" @click="chooseParent">
            {{ t('选择存放位置…') }}
          </button>
          <span v-if="parent" :title="parent">{{ parent }}</span>
        </div>
        <label>
          <span>{{ t('新文件夹名称') }}</span>
          <input v-model.trim="name" required :disabled="busy || !!clonedPath" />
        </label>
        <p v-if="busy" role="status">{{ t('正在克隆仓库…') }}</p>
        <p v-if="error" class="lume-git-clone__error" role="alert">{{ error }}</p>
        <footer>
          <button
            v-if="busy"
            type="button"
            :disabled="gitRemoteActivity === null"
            @click="cancelGitRemote"
          >
            {{ t('取消远程操作') }}
          </button>
          <button v-else type="button" @click="close">{{ t('取消') }}</button>
          <button
            type="submit"
            class="lume-git-clone__primary"
            :disabled="busy || !parent || !url || !name"
          >
            {{ t(clonedPath ? '打开工作区' : '克隆并打开') }}
          </button>
        </footer>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.lume-git-clone {
  position: fixed;
  inset: 0;
  margin: auto;
  width: min(460px, calc(100vw - 32px));
  padding: var(--lume-space-6);
  color: var(--lume-text-primary);
  background: var(--lume-bg-surface);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-xl);
  box-shadow: var(--lume-shadow-lg);
}
.lume-git-clone::backdrop {
  background: rgb(0 0 0 / 32%);
  backdrop-filter: blur(4px);
}
.lume-git-clone form,
.lume-git-clone label {
  display: grid;
  gap: var(--lume-space-3);
}
.lume-git-clone form {
  gap: var(--lume-space-5);
}
.lume-git-clone h2 {
  font-size: var(--lume-font-size-base);
}
.lume-git-clone button,
.lume-git-clone input {
  min-height: 32px;
  padding: var(--lume-space-2) var(--lume-space-3);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  color: inherit;
  background: var(--lume-bg-surface-raised);
}
.lume-git-clone button:disabled {
  opacity: 0.6;
  cursor: default;
}
.lume-git-clone .lume-git-clone__primary {
  background: var(--lume-accent-default);
  color: var(--lume-accent-contrast);
}
.lume-git-clone__destination,
.lume-git-clone footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--lume-space-3);
}
.lume-git-clone__destination span,
.lume-git-clone__error {
  overflow-wrap: anywhere;
}
.lume-git-clone__error {
  color: var(--lume-color-danger);
}
.lume-git-clone footer {
  justify-content: flex-end;
}
</style>
