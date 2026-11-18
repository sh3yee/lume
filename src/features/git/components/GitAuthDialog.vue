<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { t } from '@/app/i18n'
import { gitAuthReply } from '@/platform/tauri/git'
import { gitRemoteActivity, cancelGitRemote } from '../gitRemoteActivity'
import { gitErrorMessage } from '../useGitRepository'

interface AuthPrompt {
  id: number
  operationId: number
  prompt: string
  kind: 'username' | 'password' | 'confirm'
}

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const prompt = shallowRef<AuthPrompt | null>(null)
const value = shallowRef('')
const error = shallowRef('')
const busy = shallowRef(false)
const listeners: UnlistenFn[] = []
let disposed = false

const dismiss = () => {
  prompt.value = null
  value.value = ''
  error.value = ''
  busy.value = false
  dialog.value?.close()
}

const cancel = async () => {
  error.value = ''
  try {
    await cancelGitRemote()
  } catch (failure) {
    error.value = gitErrorMessage(failure)
  }
}

const submit = async () => {
  const current = prompt.value
  if (!current || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await gitAuthReply(current.id, current.kind === 'confirm' ? 'yes' : value.value)
    if (prompt.value?.id === current.id) dismiss()
  } catch (failure) {
    if (prompt.value?.id === current.id) {
      error.value = gitErrorMessage(failure)
      value.value = ''
      busy.value = false
    }
  }
}

const retain = (unlisten: UnlistenFn) => {
  if (disposed) unlisten()
  else listeners.push(unlisten)
}

onMounted(async () => {
  try {
    retain(
      await listen<{ id: number; active: boolean }>('lume-git-remote-activity', ({ payload }) => {
        if (disposed) return
        if (payload.active) gitRemoteActivity.value = payload.id
        else if (gitRemoteActivity.value === payload.id) {
          gitRemoteActivity.value = null
          dismiss()
        }
      }),
    )
    retain(
      await listen<AuthPrompt>('lume-git-auth-prompt', async ({ payload }) => {
        if (disposed) return
        gitRemoteActivity.value = payload.operationId
        prompt.value = payload
        value.value = ''
        error.value = ''
        busy.value = false
        await nextTick()
        if (prompt.value?.id !== payload.id) return
        if (!dialog.value?.open) dialog.value?.showModal()
        dialog.value?.querySelector('input')?.focus()
      }),
    )
  } catch (failure) {
    console.warn(t('无法接收 Git 认证请求'), failure)
  }
})

onBeforeUnmount(() => {
  disposed = true
  listeners.forEach((unlisten) => unlisten())
  dismiss()
})
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="git-auth" aria-labelledby="git-auth-title" @cancel.prevent="cancel">
      <form v-if="prompt" @submit.prevent="submit">
        <h2 id="git-auth-title">
          {{ t(prompt.kind === 'confirm' ? '确认 SSH 主机' : 'Git 身份验证') }}
        </h2>
        <p class="git-auth__prompt">{{ prompt.prompt }}</p>
        <label v-if="prompt.kind !== 'confirm'">
          <span>{{ t(prompt.kind === 'username' ? '用户名' : '密码或密钥口令') }}</span>
          <input
            v-model="value"
            :type="prompt.kind === 'username' ? 'text' : 'password'"
            autocomplete="off"
            :disabled="busy"
            maxlength="4096"
            autofocus
          />
        </label>
        <p v-if="error" class="git-auth__error" role="alert">{{ error }}</p>
        <footer>
          <button type="button" @click="cancel">{{ t('取消远程操作') }}</button>
          <button type="submit" class="git-auth__primary" :disabled="busy">
            {{ t(prompt.kind === 'confirm' ? '确认主机密钥' : '继续') }}
          </button>
        </footer>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.git-auth {
  position: fixed;
  inset: 0;
  margin: auto;
  width: min(510px, calc(100vw - 32px));
  padding: var(--lume-space-6);
  color: var(--lume-text-primary);
  background: var(--lume-bg-surface);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-xl);
  box-shadow: var(--lume-shadow-lg);
}
.git-auth::backdrop {
  background: rgb(0 0 0 / 36%);
}
.git-auth form,
.git-auth label {
  display: grid;
  gap: var(--lume-space-3);
}
.git-auth form {
  gap: var(--lume-space-5);
}
.git-auth h2 {
  font-size: var(--lume-font-size-base);
}
.git-auth__prompt {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--lume-text-secondary);
}
.git-auth__error {
  color: var(--lume-color-danger);
}
.git-auth button,
.git-auth input {
  min-height: 32px;
  padding: var(--lume-space-2) var(--lume-space-3);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  color: inherit;
  background: var(--lume-bg-surface-raised);
}
.git-auth button:disabled {
  opacity: 0.6;
}
.git-auth .git-auth__primary {
  background: var(--lume-accent-default);
  color: var(--lume-accent-contrast);
}
.git-auth footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--lume-space-3);
}
</style>
