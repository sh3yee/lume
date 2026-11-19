use super::{
    history::{blob, commit_id, preview},
    remote::branch_option,
    repository::{
        current_branch, directory, display_path, ensure_idle, fingerprint, has_head,
        local_branches, repository, status, validate_path, GitStatus,
    },
    runner::{checked, error, value},
};
use crate::error::LumeResult;
use serde::Serialize;
use std::{
    fs::OpenOptions,
    io::Write,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static RESTORE_COUNTER: AtomicU64 = AtomicU64::new(0);

struct RestoreFile(PathBuf);
impl Drop for RestoreFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

pub fn initialize(workspace: &str) -> LumeResult<GitStatus> {
    let path = directory(workspace)?;
    if status(workspace)?.root.is_some() {
        return Err(error("此工作区已位于 Git 仓库中"));
    }
    checked(&path, &["init"])?;
    status(workspace)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitSwitchOutcome {
    Switched,
    SwitchedWithWarning,
}

pub fn switch_branch(
    workspace: &str,
    branch: &str,
    expected_branch: Option<&str>,
    expected_head: Option<&str>,
    remote: bool,
) -> LumeResult<GitSwitchOutcome> {
    let root = repository(workspace, true)?;
    ensure_idle(&root)?;
    let current = current_branch(&root)?;
    let head = if has_head(&root)? {
        Some(value(&root, &["rev-parse", "HEAD"])?)
    } else {
        None
    };
    if current.as_deref() != expected_branch || head.as_deref() != expected_head {
        return Err(error("当前分支或提交已变化，请刷新后重新确认。"));
    }
    if !remote && current.as_deref() == Some(branch) {
        return Ok(GitSwitchOutcome::Switched);
    }
    let local = local_branches(&root)?;
    let mut args = vec![
        "switch",
        "--no-guess",
        "--no-overwrite-ignore",
        "--no-recurse-submodules",
    ];
    let name = if remote {
        let target = branch_option(&root, branch)?
            .ok_or_else(|| error("目标远程分支不可用，请刷新后重试。"))?;
        let name = tracking_branch_name(&local, &target.remote_name, &target.name);
        args.extend(["--track", "-c"]);
        name
    } else {
        if branch.starts_with('-') || !local.iter().any(|name| name == branch) {
            return Err(error("目标本地分支不可用，请刷新后重试。"));
        }
        branch.to_owned()
    };
    if remote {
        args.push(&name);
    }
    args.extend(["--", branch]);
    let switched = checked(&root, &args);
    // post-checkout 失败时 Git 可能已经更新了 HEAD 和工作区，仍需刷新打开的文件。
    match switched {
        Ok(_) => Ok(GitSwitchOutcome::Switched),
        Err(_) if current_branch(&root)?.as_deref() == Some(name.as_str()) && has_head(&root)? => {
            Ok(GitSwitchOutcome::SwitchedWithWarning)
        }
        Err(failure) => Err(failure),
    }
}

fn tracking_branch_name(local: &[String], remote: &str, branch: &str) -> String {
    let available = |candidate: &str| {
        let folded = candidate.to_lowercase();
        !local.iter().any(|name| {
            let existing = name.to_lowercase();
            existing == folded
                || existing.strip_prefix(&folded).is_some_and(|rest| rest.starts_with('/'))
                || folded.strip_prefix(&existing).is_some_and(|rest| rest.starts_with('/'))
        })
    };
    if !branch.starts_with('-') && branch != "HEAD" && available(branch) {
        return branch.to_owned();
    }
    // 使用远程仓库名区分同名分支，必要时避开本地引用的目录冲突。
    let qualified = format!("{remote}/{branch}");
    if available(&qualified) {
        return qualified;
    }
    (2..)
        .map(|suffix| format!("{remote}-{suffix}/{branch}"))
        .find(|candidate| available(candidate))
        .expect("local branch names are finite")
}

pub fn stage(workspace: &str, path: &str, staged: bool) -> LumeResult<GitStatus> {
    let root = repository(workspace, true)?;
    ensure_idle(&root)?;
    validate_path(&root, path)?;
    if root.join(path).is_dir() {
        return Err(error("第一阶段不支持暂存目录或子模块，请在 Git 工具中处理。"));
    }
    // 只允许操作状态列表中的确切文件，避免目录递归暂存与路径模式扩张。
    let snapshot = status(workspace)?;
    let change = snapshot.changes.iter().find(|change| change.path == path)
        .ok_or_else(|| error("文件状态已变化，请刷新后重试。"))?;
    if change.index == "U" || change.working == "U" {
        return Err(error("仓库存在未解决冲突，请先在 Git 工具中处理。"));
    }
    let mut paths = vec![path];
    // 已暂存的重命名在索引中只保留新路径，再次暂存应以工作区变更为准。
    let change_code = if staged { &change.working } else { &change.index };
    if let Some(previous) = change
        .previous_path
        .as_deref()
        .filter(|_| matches!(change_code.as_str(), "R" | "C"))
    {
        validate_path(&root, previous)?;
        paths.push(previous);
    }
    let mut args = if staged {
        vec!["add", "--all", "--"]
    } else if has_head(&root)? {
        vec!["restore", "--staged", "--"]
    } else {
        vec!["rm", "--cached", "--force", "--"]
    };
    args.extend(paths);
    checked(&root, &args)?;
    status(workspace)
}

pub fn working_diff(workspace: &str, path: &str, staged: bool) -> LumeResult<String> {
    let root = repository(workspace, false)?;
    let target = validate_path(&root, path)?;
    let status = status(workspace)?;
    let change = status.changes.iter().find(|change| change.path == path)
        .ok_or_else(|| error("文件状态已变化，请刷新后重试。"))?;
    if change.index == "?" {
        if std::fs::metadata(&target)?.len() > 512 * 1024 {
            return Err(error("内容超过预览大小限制（512 KB）。"));
        }
        return preview(std::fs::read(target)?);
    }
    let mut args = vec!["diff", "--no-ext-diff", "--no-textconv"];
    if staged {
        args.push("--cached");
    }
    args.extend(["--", path]);
    if let Some(previous) = change.previous_path.as_deref() {
        args.push(previous);
    }
    preview(checked(&root, &args)?)
}

pub fn configure_author(workspace: &str, name: &str, email: &str) -> LumeResult<GitStatus> {
    let root = repository(workspace, true)?;
    if super::merge::merge_head(&root)?.is_none() {
        ensure_idle(&root)?;
    }
    if name.trim().is_empty()
        || email.trim().is_empty()
        || name.len() > 200
        || email.len() > 254
        || name.contains(['\r', '\n', '\0', '<', '>'])
        || email.contains(['\r', '\n', '\0', '<', '>'])
    {
        return Err(error("请填写有效的 Git 作者姓名和邮箱。"));
    }
    checked(&root, &["config", "--local", "user.name", name.trim()])?;
    checked(&root, &["config", "--local", "user.email", email.trim()])?;
    status(workspace)
}

pub fn commit(workspace: &str, message: &str, expected_tree: &str) -> LumeResult<GitStatus> {
    let root = repository(workspace, true)?;
    ensure_idle(&root)?;
    let current = status(workspace)?;
    if current.branch.is_none() {
        return Err(error("当前处于独立 HEAD，请先切换到本地分支。"));
    }
    if message.trim().is_empty() || message.len() > 10_000 || message.contains('\0') {
        return Err(error("请填写提交说明（最多 10000 字节）。"));
    }
    if current.author_name.is_empty() || current.author_email.is_empty() {
        return Err(error("请先配置 Git 作者姓名和邮箱。"));
    }
    if !current.changes.iter().any(|change| change.index != " " && change.index != "?") {
        return Err(error("没有已暂存的变更"));
    }
    if value(&root, &["write-tree"])? != expected_tree {
        return Err(error("暂存内容已变化，请重新检查后提交。"));
    }
    checked(&root, &["commit", "-m", message.trim()])?;
    status(workspace)
}

pub fn index_tree(workspace: &str) -> LumeResult<String> {
    let root = repository(workspace, false)?;
    ensure_idle(&root)?;
    value(&root, &["write-tree"])
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRestorePreview {
    pub fingerprint: Option<String>,
    pub absolute_path: String,
}

pub fn restore_preview(workspace: &str, path: &str) -> LumeResult<GitRestorePreview> {
    let root = repository(workspace, true)?;
    ensure_idle(&root)?;
    let target = validate_path(&root, path)?;
    Ok(GitRestorePreview {
        fingerprint: fingerprint(&root, path)?,
        absolute_path: display_path(&target),
    })
}

pub fn restore(
    workspace: &str,
    revision: &str,
    path: &str,
    expected: Option<&str>,
) -> LumeResult<String> {
    let root = repository(workspace, true)?;
    ensure_idle(&root)?;
    let revision = commit_id(&root, revision)?;
    let Some((mode, id)) = blob(&root, &revision, path)? else {
        return Err(error("此版本中没有可恢复的普通文件"));
    };
    if !["100644", "100755"].contains(&mode.as_str()) {
        return Err(error("不支持恢复符号链接或子模块"));
    }
    let bytes = checked(&root, &["cat-file", "blob", &id])?;
    replace_file(&root, path, &bytes, &mode, expected)
}

pub(super) fn replace_file(
    root: &std::path::Path,
    path: &str,
    bytes: &[u8],
    #[cfg_attr(not(unix), allow(unused_variables))] mode: &str,
    expected: Option<&str>,
) -> LumeResult<String> {
    let target = validate_path(root, path)?;
    if fingerprint(root, path)?.as_deref() != expected {
        return Err(error("文件在确认后发生变化，请重新查看后再恢复。"));
    }
    let parent = target.parent().ok_or_else(|| error("无法确定父目录"))?;
    std::fs::create_dir_all(parent)?;
    validate_path(root, path)?;
    let temporary_path = parent.join(format!(
        ".lume-restore-{}-{}.tmp",
        std::process::id(),
        RESTORE_COUNTER.fetch_add(1, Ordering::Relaxed),
    ));
    // 先完整写入同目录临时文件，再替换目标；写入失败时保留原文件。
    let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary_path)?;
    let temporary = RestoreFile(temporary_path);
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = std::fs::Permissions::from_mode(if mode == "100755" { 0o755 } else { 0o644 });
        std::fs::set_permissions(&temporary.0, permissions)?;
    }
    validate_path(root, path)?;
    if fingerprint(root, path)?.as_deref() != expected {
        return Err(error("文件在确认后发生变化，请重新查看后再恢复。"));
    }
    // 不经过 checkout，不修改暂存区，也不触发 smudge 过滤器。
    std::fs::rename(&temporary.0, &target)?;
    Ok(display_path(&target))
}
