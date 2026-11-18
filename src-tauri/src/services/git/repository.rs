use super::runner::{checked, error, run, text, value};
use crate::error::LumeResult;
use serde::Serialize;
use std::path::{Component, Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    pub path: String,
    pub previous_path: Option<String>,
    pub index: String,
    pub working: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub root: Option<String>,
    pub branch: Option<String>,
    pub branches: Vec<String>,
    pub head: Option<String>,
    pub writable: bool,
    pub operation: Option<String>,
    pub merge_head: Option<String>,
    pub merge_tree: Option<String>,
    pub changes: Vec<GitChange>,
    pub author_name: String,
    pub author_email: String,
}

pub fn directory(path: &str) -> LumeResult<PathBuf> {
    let root = std::fs::canonicalize(path)?;
    if !root.is_dir() { return Err(error("工作区路径必须是普通目录")); }
    Ok(root)
}

pub fn display_path(path: &Path) -> String {
    let path = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(network) = path.strip_prefix(r"\\?\UNC\") { return format!(r"\\{network}"); }
        if let Some(local) = path.strip_prefix(r"\\?\") { return local.to_owned(); }
    }
    path.into_owned()
}

pub fn repository(path: &str, writable: bool) -> LumeResult<PathBuf> {
    let workspace = directory(path)?;
    let root = directory(&value(&workspace, &["rev-parse", "--show-toplevel"])?)?;
    if writable && workspace != root {
        return Err(error("请打开仓库根目录后进行版本写操作。"));
    }
    Ok(root)
}

pub fn has_head(root: &Path) -> LumeResult<bool> {
    Ok(run(root, &["rev-parse", "--verify", "HEAD"])?.status.success())
}

pub fn current_branch(root: &Path) -> LumeResult<Option<String>> {
    let output = run(root, &["symbolic-ref", "--quiet", "HEAD"])?;
    if !output.status.success() {
        return Ok(None);
    }
    Ok(text(output.stdout)?
        .trim_end_matches(['\r', '\n'])
        .strip_prefix("refs/heads/")
        .map(str::to_owned))
}

pub fn local_branches(root: &Path) -> LumeResult<Vec<String>> {
    let output = checked(
        root,
        &["for-each-ref", "--format=%(refname:strip=2)", "refs/heads/"],
    )?;
    Ok(output
        .split(|byte| *byte == b'\n')
        .filter_map(|line| std::str::from_utf8(line).ok())
        .map(|line| line.trim_end_matches('\r'))
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect())
}

pub fn operation(root: &Path) -> LumeResult<Option<String>> {
    let git_dir = PathBuf::from(value(root, &["rev-parse", "--absolute-git-dir"])?);
    for (marker, name) in [("MERGE_HEAD", "merge"), ("rebase-merge", "rebase"), ("rebase-apply", "rebase"), ("CHERRY_PICK_HEAD", "cherry-pick"), ("REVERT_HEAD", "revert"), ("sequencer", "sequencer"), ("BISECT_START", "bisect"), ("index.lock", "locked")] {
        if git_dir.join(marker).exists() { return Ok(Some(name.to_owned())); }
    }
    Ok(None)
}

pub fn ensure_idle(root: &Path) -> LumeResult<()> {
    if operation(root)?.is_some() {
        return Err(error("仓库有未完成操作或被占用，请先在 Git 工具中处理。"));
    }
    let status = checked(root, &["diff", "--name-only", "--diff-filter=U", "-z"])?;
    if !status.is_empty() { return Err(error("仓库存在未解决冲突，请先在 Git 工具中处理。")); }
    Ok(())
}

pub fn find_root(workspace: &Path) -> LumeResult<Option<PathBuf>> {
    let output = run(workspace, &["rev-parse", "--show-toplevel"])?;
    if !output.status.success() {
        if String::from_utf8_lossy(&output.stderr).contains("not a git repository") {
            // 损坏的 .git 不能当成普通文件夹重新初始化。
            for ancestor in workspace.ancestors() {
                match std::fs::symlink_metadata(ancestor.join(".git")) {
                    Ok(_) => return Err(error("检测到 Git 元数据但仓库不可读取，请先修复仓库。")),
                    Err(failure) if failure.kind() == std::io::ErrorKind::NotFound => (),
                    Err(failure) => return Err(failure.into()),
                }
            }
            return Ok(None);
        }
        return Err(error(String::from_utf8_lossy(&output.stderr).trim().to_owned()));
    }
    directory(text(output.stdout)?.trim_end_matches(['\r', '\n'])).map(Some)
}

pub fn status(path: &str) -> LumeResult<GitStatus> {
    let workspace = directory(path)?;
    let mut status = GitStatus {
        root: None,
        branch: None,
        branches: Vec::new(),
        head: None,
        writable: false,
        operation: None,
        merge_head: None,
        merge_tree: None,
        changes: Vec::new(),
        author_name: String::new(),
        author_email: String::new(),
    };
    let Some(root) = find_root(&workspace)? else {
        return Ok(status);
    };
    status.root = Some(display_path(&root));
    status.writable = workspace == root;
    status.operation = operation(&root)?;
    if status.operation.as_deref() == Some("merge") {
        status.merge_head = super::merge::merge_head(&root)?;
    }
    status.branch = current_branch(&root)?;
    status.branches = local_branches(&root)?;
    if has_head(&root)? { status.head = Some(value(&root, &["rev-parse", "HEAD"])?); }
    for (key, target) in [("user.name", &mut status.author_name), ("user.email", &mut status.author_email)] {
        let output = run(&root, &["config", "--get", key])?;
        if output.status.success() { *target = text(output.stdout)?.trim().to_owned(); }
        else if output.status.code() != Some(1) { return Err(error("无法读取 Git 作者配置")); }
    }
    let bytes = checked(&root, &["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
    let mut records = bytes.split(|byte| *byte == 0).filter(|record| !record.is_empty());
    while let Some(record) = records.next() {
        if record.len() < 4 || record[2] != b' ' { return Err(error("无法解析 Git 文件状态")); }
        let previous_path = if [record[0], record[1]].iter().any(|code| [b'R', b'C'].contains(code)) {
            Some(text(records.next().ok_or_else(|| error("无法解析 Git 重命名状态"))?.to_vec())?)
        } else { None };
        status.changes.push(GitChange { path: text(record[3..].to_vec())?, previous_path, index: (record[0] as char).to_string(), working: (record[1] as char).to_string() });
        if status.changes.len() > 5000 { return Err(error("仓库变更超过 5000 项，请先缩小变更范围。")); }
    }
    if status.merge_head.is_some() && status.writable && super::merge::unmerged_paths(&root)?.is_empty() {
        status.merge_tree = Some(value(&root, &["write-tree"])?);
    }
    Ok(status)
}

pub fn validate_path(root: &Path, path: &str) -> LumeResult<PathBuf> {
    if path.is_empty() || path.contains('\0') || path.contains('\\') || path.starts_with('/') {
        return Err(error("无效的仓库相对路径"));
    }
    for segment in path.split('/') {
        let lower = segment.to_ascii_lowercase();
        if segment.is_empty() || segment == "." || segment == ".." || lower == ".git" || lower.starts_with("git~") || segment.contains(':') || segment.ends_with(['.', ' ']) {
            return Err(error("无效的仓库相对路径"));
        }
    }
    if Path::new(path).components().any(|part| !matches!(part, Component::Normal(_))) { return Err(error("无效的仓库相对路径")); }
    let mut target = root.to_path_buf();
    for segment in path.split('/') {
        target.push(segment);
        match std::fs::symlink_metadata(&target) {
            Ok(metadata) if metadata.file_type().is_symlink() => return Err(error("不支持对符号链接进行此操作")),
            Ok(_) => {
                if !std::fs::canonicalize(&target)?.starts_with(root) { return Err(error("不能操作工作区之外的路径")); }
            }
            Err(failure) if failure.kind() == std::io::ErrorKind::NotFound => (),
            Err(failure) => return Err(failure.into()),
        }
    }
    Ok(target)
}

pub fn fingerprint(root: &Path, path: &str) -> LumeResult<Option<String>> {
    let target = validate_path(root, path)?;
    if !target.exists() { return Ok(None); }
    if !target.is_file() { return Err(error("文件不存在或不是普通文件")); }
    Ok(Some(value(root, &["hash-object", "--no-filters", "--", path])?))
}
