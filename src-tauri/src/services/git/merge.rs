use super::{
    actions::replace_file,
    remote::checked_upstream,
    repository::{current_branch, directory, ensure_idle, find_root, fingerprint, operation, repository, validate_path},
    runner::{checked, error, run, text, value, write_blob},
};
use crate::error::LumeResult;
use serde::{Deserialize, Serialize};
use std::path::Path;

const TEXT_LIMIT: usize = 512 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdateOutcome {
    FastForwarded,
    MergeStarted,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTarget {
    branch: String,
    head: String,
    upstream_head: String,
    merge: bool,
}

pub fn update(workspace: &str, target: UpdateTarget) -> LumeResult<UpdateOutcome> {
    let root = repository(workspace, true)?;
    ensure_idle(&root)?;
    if current_branch(&root)?.as_deref() != Some(target.branch.as_str())
        || value(&root, &["rev-parse", "HEAD"])? != target.head
    {
        return Err(error("当前分支或提交已变化，请刷新后重新确认。"));
    }
    if !checked(&root, &["status", "--porcelain", "-z", "--untracked-files=all"])?.is_empty() {
        return Err(error("请先提交或移走工作区和暂存区中的修改，再应用远程更新。"));
    }
    let upstream = checked_upstream(&root, &target.branch, &target.upstream_head)?;
    let base = run(&root, &["merge-base", &target.head, &upstream])?;
    if base.status.code() == Some(1) {
        return Err(error("本地和远程没有共同历史，请克隆远程仓库后导入文件。"));
    }
    if !base.status.success() {
        return Err(error("无法读取本地和远程的共同提交。"));
    }
    let base = text(base.stdout)?;
    let base = base.trim_end();
    if base == upstream || (target.merge == (base == target.head)) {
        return Err(error("分支状态已变化，请刷新后重新确认。"));
    }

    let mut args = vec![
        "-c", "merge.conflictStyle=diff3", "-c", "rerere.enabled=false", "merge",
        "--no-edit", "--no-stat", "--no-autostash", "--no-overwrite-ignore",
    ];
    args.extend(if target.merge { ["--no-ff", "--no-commit"] } else { ["--ff-only", "--no-commit"] });
    args.extend(["--", &upstream]);
    let result = checked(&root, &args);
    if target.merge && merge_head(&root)?.as_deref() == Some(upstream.as_str()) {
        return Ok(UpdateOutcome::MergeStarted);
    }
    result?;
    Ok(UpdateOutcome::FastForwarded)
}

pub(super) fn merge_head(root: &Path) -> LumeResult<Option<String>> {
    if operation(root)?.as_deref() != Some("merge") {
        return Ok(None);
    }
    value(root, &["rev-parse", "--verify", "MERGE_HEAD"]).map(Some)
}

#[derive(Serialize)]
pub struct MergePaths {
    root: String,
    paths: Vec<String>,
}

pub fn paths(workspace: &str) -> LumeResult<Option<MergePaths>> {
    let workspace = directory(workspace)?;
    let Some(root) = find_root(&workspace)? else { return Ok(None); };
    let paths = if merge_head(&root)?.is_some() { unmerged_paths(&root)? } else { Vec::new() };
    Ok(Some(MergePaths { root: super::repository::display_path(&root), paths }))
}

pub(super) fn unmerged_paths(root: &Path) -> LumeResult<Vec<String>> {
    let paths = text(checked(root, &["diff", "--name-only", "--diff-filter=U", "-z"])?)?;
    Ok(paths.split_terminator('\0').map(str::to_owned).collect())
}

fn verify_merge(root: &Path, head: &str, merged: &str) -> LumeResult<()> {
    if merge_head(root)?.as_deref() != Some(merged)
        || value(root, &["rev-parse", "HEAD"])? != head
    {
        return Err(error("合并状态已变化，请刷新后重新确认。"));
    }
    Ok(())
}

pub fn finish(workspace: &str, head: &str, merged: &str, abort: bool, expected_tree: Option<&str>) -> LumeResult<()> {
    let root = repository(workspace, true)?;
    verify_merge(&root, head, merged)?;
    if abort {
        checked(&root, &["merge", "--abort"])?;
    } else {
        if !unmerged_paths(&root)?.is_empty() {
            return Err(error("请先解决并暂存全部合并冲突。"));
        }
        if Some(value(&root, &["write-tree"])?.as_str()) != expected_tree {
            return Err(error("合并暂存内容已变化，请刷新后重新检查。"));
        }
        checked(&root, &["commit", "--no-edit"])?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct ConflictVersion {
    content: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    base: Option<ConflictVersion>,
    local: Option<ConflictVersion>,
    remote: Option<ConflictVersion>,
    worktree: Option<String>,
    snapshot: String,
}

struct Entry<'a> {
    mode: &'a str,
    id: &'a str,
}

fn entries<'a>(index: &'a str, path: &str) -> LumeResult<[Option<Entry<'a>>; 3]> {
    let mut entries = [None, None, None];
    for record in index.split_terminator('\0') {
        let (metadata, found) = record.split_once('\t').ok_or_else(invalid_index)?;
        let mut fields = metadata.split_ascii_whitespace();
        let mode = fields.next().ok_or_else(invalid_index)?;
        let id = fields.next().ok_or_else(invalid_index)?;
        let stage = match fields.next() {
            Some("1") => 0,
            Some("2") => 1,
            Some("3") => 2,
            _ => return Err(invalid_index()),
        };
        if found != path || !["100644", "100755"].contains(&mode) {
            return Err(error("此冲突包含目录、符号链接或子模块，请在系统 Git 中处理。"));
        }
        entries[stage] = Some(Entry { mode, id });
    }
    Ok(entries)
}

fn invalid_index() -> crate::error::LumeError {
    error("无法读取合并索引。")
}

fn conflict_index(root: &Path, path: &str) -> LumeResult<String> {
    let target = validate_path(root, path)?;
    if target.exists() && !target.is_file() {
        return Err(error("此冲突的路径不是普通文件。"));
    }
    let index = text(checked(root, &["ls-files", "--unmerged", "-z", "--", path])?)?;
    if index.is_empty() {
        return Err(error("此文件的冲突已变化，请刷新后重新选择。"));
    }
    Ok(index)
}

fn preview(bytes: Vec<u8>) -> Option<String> {
    if bytes.contains(&0) || bytes.len() > TEXT_LIMIT {
        return None;
    }
    String::from_utf8(bytes).ok()
}

fn version(root: &Path, entry: Option<Entry<'_>>) -> LumeResult<Option<ConflictVersion>> {
    entry.map(|entry| {
        let size = value(root, &["cat-file", "-s", entry.id])?
            .parse::<usize>().map_err(|_| invalid_index())?;
        let content = if size <= TEXT_LIMIT {
            preview(checked(root, &["cat-file", "blob", entry.id])?)
        } else {
            None
        };
        Ok(ConflictVersion { content })
    }).transpose()
}

fn snapshot(merged: &str, index: &str, file: Option<&str>) -> String {
    format!("{merged}\0{}\0{index}", file.unwrap_or_default())
}

pub fn conflict(workspace: &str, path: &str) -> LumeResult<Conflict> {
    let root = repository(workspace, true)?;
    let merged = merge_head(&root)?.ok_or_else(|| error("当前没有正在进行的合并。"))?;
    let index = conflict_index(&root, path)?;
    let [base, local, remote] = entries(&index, path)?;
    let file = fingerprint(&root, path)?;
    let worktree = if file.is_some() && std::fs::metadata(root.join(path))?.len() <= TEXT_LIMIT as u64 {
        preview(std::fs::read(root.join(path))?)
    } else {
        None
    };
    if file != fingerprint(&root, path)?
        || index != conflict_index(&root, path)? || merge_head(&root)?.as_deref() != Some(merged.as_str())
    {
        return Err(error("此文件的冲突已变化，请刷新后重新选择。"));
    }
    Ok(Conflict {
        base: version(&root, base)?,
        local: version(&root, local)?,
        remote: version(&root, remote)?,
        worktree,
        snapshot: snapshot(&merged, &index, file.as_deref()),
    })
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Resolution {
    Local,
    Remote,
    Text { content: String },
    CopyLocal { name: String },
    CopyRemote { name: String },
}

pub fn resolve(workspace: &str, path: &str, expected: &str, resolution: Resolution) -> LumeResult<()> {
    let root = repository(workspace, true)?;
    let merged = merge_head(&root)?.ok_or_else(|| error("当前没有正在进行的合并。"))?;
    let index = conflict_index(&root, path)?;
    let [base, local, remote] = entries(&index, path)?;
    let file = fingerprint(&root, path)?;
    if snapshot(&merged, &index, file.as_deref()) != expected {
        return Err(error("此文件的冲突已变化，请刷新后重新选择。"));
    }
    match resolution {
        Resolution::Local | Resolution::Remote => {
            let (entry, option) = if matches!(resolution, Resolution::Local) {
                (local, "--ours")
            } else {
                (remote, "--theirs")
            };
            if entry.is_none() {
                checked(&root, &["rm", "--force", "--", path])?;
                return Ok(());
            }
            checked(&root, &["checkout", option, "--", path])?;
        }
        Resolution::Text { content } => {
            if content.len() > TEXT_LIMIT || content.contains('\0') {
                return Err(error("合并结果必须是 512 KB 以内的文本。"));
            }
            let entry = local.or(remote).or(base).ok_or_else(invalid_index)?;
            replace_file(&root, path, content.as_bytes(), entry.mode, file.as_deref())?;
        }
        Resolution::CopyLocal { ref name } | Resolution::CopyRemote { ref name } => {
            let entry = if matches!(resolution, Resolution::CopyLocal { .. }) { local } else { remote };
            let entry = entry.ok_or_else(|| error("所选版本中没有此文件。"))?;
            if name.is_empty() || name.contains(['/', '\\', '<', '>', '"', '|', '?', '*'])
                || name.chars().any(char::is_control) {
                return Err(error("请输入有效的新文件名。"));
            }
            let path = path.rsplit_once('/').map_or_else(|| name.to_owned(), |(parent, _)| format!("{parent}/{name}"));
            let destination = validate_path(&root, &path)?;
            let copy = std::fs::OpenOptions::new().write(true).create_new(true).open(&destination)?;
            if let Err(failure) = copy.try_clone().map_err(crate::error::LumeError::from)
                .and_then(|file| write_blob(&root, entry.id, file))
                .and_then(|()| copy.sync_all().map_err(crate::error::LumeError::from)) {
                drop(copy);
                let _ = std::fs::remove_file(destination);
                return Err(failure);
            }
            return Ok(());
        }
    }
    checked(&root, &["add", "--all", "--", path])?;
    Ok(())
}
