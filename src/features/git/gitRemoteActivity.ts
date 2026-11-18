import { shallowRef } from 'vue'
import { gitCancelRemote } from '@/platform/tauri/git'

export const gitRemoteActivity = shallowRef<number | null>(null)

export const cancelGitRemote = () => {
  const id = gitRemoteActivity.value
  if (id !== null) return gitCancelRemote(id)
}
