# Git version control

The Lume desktop app can keep local versions of a folder workspace and push commits to a remote repository. Install Git and ensure `git` is available on the system PATH, then reopen Lume.

## Open version control

Open a folder, then click the branch icon at the top of the file sidebar, or choose **Version control** in the command palette.

Existing repositories show their branch, changes, and history. For a regular folder, choose **Enable local version control** to create a repository without changing existing files.

A workspace inside a larger repository is read-only in this panel. The actual repository root is shown; open that root as the workspace to commit or restore files.

## Switch branches

When another local branch is available, click the name next to **Current branch** to open the branch menu. After you choose a branch, Lume first saves open workspace documents. Git stops the switch and reports a reason if it would overwrite local changes.

After switching, the file tree, commit history, push status, and open workspace documents refresh. Clean tabs close if their files are absent on the target branch.

## Stage and commit

The Changes tab separates staged and unstaged files. Select a file to inspect its corresponding diff. A partially staged file appears in both groups.

1. Click **+** beside an unstaged file to stage all its current changes. Lume first saves workspace documents that have file paths. Saving failures or unresolved external edits stop staging.
2. Click **−** beside a staged file to unstage it while keeping its contents.
3. Review staged files, enter a commit message, and choose **Commit staged changes**.

Only staged contents are committed. Unsaved drafts are not assigned a path or added automatically. Opening the panel preserves existing staging. Staging a partially staged file includes all its current changes.

The author comes from existing Git configuration. To change it, open **Commit author**, enter a name and email, and choose **Save to this repository**. Global configuration is unchanged.

If another Git tool changes the index after review, Lume asks you to refresh and review it again before committing.

## Push commits to a remote

After creating a local commit, choose **Connect remote repository** in Version control. Select an existing remote or enter an HTTPS or SSH repository URL. Review the destination branch and choose **Confirm and push**. The first successful push sets the upstream for the current branch.

For branches with an upstream, the panel shows how many commits are ready to push. Choose **Push** to upload them. The counts reflect the last fetch or push. Choose **Fetch remote status** to refresh them. If the remote is ahead or the branches have diverged, integrate the updates using an external Git tool before pushing from Lume.

Lume uses system Git credentials or SSH configuration. After a failed push, you can keep editing and retry when the issue is resolved.

**Preferences → Git → Automatic push** is off by default. Open a workspace to set its interval from 1 to 1440 minutes, then enable automatic push when you need it. The default interval is 30 minutes. While Lume is running, it pushes local commits from the current branch to its configured upstream. Connect the remote and create local commits manually. Git preferences show any automatic push error.

## History and file restoration

The History tab lists commits on the current branch, with pagination. Enter a repository-relative file path to filter history, or leave it blank for all commits.

Select a commit and a changed file to see its diff or historical contents. Merge commits are compared against their first parent. Renames may appear as a deleted old path and an added new path in commit details.

**Restore this file…** first saves workspace documents and asks you to confirm the file and revision. Restoration replaces the file's current disk contents. Commit or back up uncommitted work first if you need to keep it.

Restoration does not move HEAD, rewrite history, or modify the index. Differences from the current commit become unstaged changes. Lume checks both the disk file and open document again before replacement, and updates the open document afterward.

## Current scope

- Markdown, images, and other regular files follow the repository's existing ignore rules.
- Text previews require valid UTF-8 and are limited to 512 KB. Binary and large files show version information. Each Git command has an 8 MB output limit, which also bounds file restoration.
- Repositories with more than 5,000 changed files require a smaller change scope.
- Symbolic links, submodules, Git metadata paths, and paths outside the repository cannot be restored. Use an external Git tool to stage directories or submodules.
- Detached HEAD allows history browsing. Switch to a local branch before committing.
- Resolve unfinished merges, rebases, conflicts, or repository locks in an external Git tool, then refresh.
- Git commands have a timeout. If hooks, signing, or other configuration cause a failure, Lume reports the error and reloads repository state.
- Use an external Git tool to clone a repository, apply remote updates to the workspace, or resolve merge conflicts.
