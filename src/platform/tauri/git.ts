import { invokeCommand } from './client'

export interface GitChange {
  path: string
  previousPath: string | null
  index: string
  working: string
}

export interface GitStatus {
  root: string | null
  branch: string | null
  branches: string[]
  head: string | null
  writable: boolean
  operation: string | null
  mergeHead: string | null
  mergeTree: string | null
  changes: GitChange[]
  authorName: string
  authorEmail: string
}

export interface GitCommit {
  id: string
  author: string
  date: string
  message: string
}

export interface GitHistory {
  commits: GitCommit[]
  hasMore: boolean
}

export interface GitHistoryFile {
  path: string
  status: string
}

export interface GitFileVersion {
  content: string | null
  binary: boolean
  restorable: boolean
}

export interface GitRestorePreview {
  fingerprint: string | null
  absolutePath: string
}

export interface GitRemoteStatus {
  remotes: { name: string; url: string }[]
  upstream: {
    remoteName: string
    targetBranch: string
    ahead: number | null
    behind: number | null
    head: string | null
  } | null
}

export interface GitPushTarget {
  remoteName: string | null
  url: string
  targetBranch: string
}

export interface GitUpdateTarget {
  branch: string
  head: string
  upstreamHead: string
  merge: boolean
}

export interface GitConflict {
  base: { content: string | null } | null
  local: { content: string | null } | null
  remote: { content: string | null } | null
  worktree: string | null
  snapshot: string
}

export type GitConflictResolution =
  | { kind: 'local' | 'remote' }
  | { kind: 'text'; content: string }
  | { kind: 'copyLocal' | 'copyRemote'; name: string }

export const gitStatus = (workspace: string) =>
  invokeCommand<GitStatus>('lume_git_status', { workspace })
export const gitInit = (workspace: string) =>
  invokeCommand<GitStatus>('lume_git_init', { workspace })
export const gitSwitchBranch = (
  workspace: string,
  branch: string,
  expectedBranch: string | null,
  expectedHead: string | null,
) =>
  invokeCommand<'switched' | 'switchedWithWarning'>('lume_git_switch_branch', {
    workspace,
    branch,
    expectedBranch,
    expectedHead,
  })
export const gitStage = (workspace: string, path: string, staged: boolean) =>
  invokeCommand<GitStatus>('lume_git_stage', { workspace, path, staged })
export const gitDiff = (workspace: string, path: string, staged: boolean) =>
  invokeCommand<string>('lume_git_diff', { workspace, path, staged })
export const gitAuthor = (workspace: string, name: string, email: string) =>
  invokeCommand<GitStatus>('lume_git_author', { workspace, name, email })
export const gitIndexTree = (workspace: string) =>
  invokeCommand<string>('lume_git_index_tree', { workspace })
export const gitCommit = (workspace: string, message: string, expectedTree: string) =>
  invokeCommand<GitStatus>('lume_git_commit', { workspace, message, expectedTree })
export const gitRemoteStatus = (workspace: string, branch: string) =>
  invokeCommand<GitRemoteStatus>('lume_git_remote_status', { workspace, branch })
export const gitPush = (workspace: string, branch: string, head: string, target: GitPushTarget) =>
  invokeCommand<void>('lume_git_push', { workspace, branch, head, target })
export const gitAutoPush = (workspace: string) =>
  invokeCommand<boolean>('lume_git_auto_push', { workspace })
export const gitFetch = (workspace: string, branch: string, target: GitPushTarget) =>
  invokeCommand<void>('lume_git_fetch', { workspace, branch, target })
export const gitClone = (parent: string, name: string, url: string) =>
  invokeCommand<string>('lume_git_clone', { parent, name, url })
export const gitAuthReply = (id: number, value: string) =>
  invokeCommand<void>('lume_git_auth_reply', { id, value })
export const gitCancelRemote = (id: number) => invokeCommand<void>('lume_git_cancel_remote', { id })
export const gitUpdate = (workspace: string, target: GitUpdateTarget) =>
  invokeCommand<'fastForwarded' | 'mergeStarted'>('lume_git_update', { workspace, target })
export const gitMergePaths = (workspace: string) =>
  invokeCommand<{ root: string; paths: string[] } | null>('lume_git_merge_paths', { workspace })
export const gitConflict = (workspace: string, path: string) =>
  invokeCommand<GitConflict>('lume_git_conflict', { workspace, path })
export const gitResolve = (
  workspace: string,
  path: string,
  snapshot: string,
  resolution: GitConflictResolution,
) => invokeCommand<void>('lume_git_resolve', { workspace, path, snapshot, resolution })
export const gitFinishMerge = (
  workspace: string,
  head: string,
  merged: string,
  abort: boolean,
  expectedTree: string | null,
) => invokeCommand<void>('lume_git_finish_merge', { workspace, head, merged, abort, expectedTree })
export const gitHistory = (workspace: string, skip = 0, path: string | null = null) =>
  invokeCommand<GitHistory>('lume_git_history', { workspace, skip, path })
export const gitHistoryFiles = (workspace: string, revision: string) =>
  invokeCommand<GitHistoryFile[]>('lume_git_history_files', { workspace, revision })
export const gitHistoryDiff = (workspace: string, revision: string, path: string) =>
  invokeCommand<string>('lume_git_history_diff', { workspace, revision, path })
export const gitFileVersion = (workspace: string, revision: string, path: string) =>
  invokeCommand<GitFileVersion>('lume_git_file_version', { workspace, revision, path })
export const gitRestorePreview = (workspace: string, path: string) =>
  invokeCommand<GitRestorePreview>('lume_git_restore_preview', { workspace, path })
export const gitRestore = (
  workspace: string,
  revision: string,
  path: string,
  expected: string | null,
) => invokeCommand<string>('lume_git_restore', { workspace, revision, path, expected })
