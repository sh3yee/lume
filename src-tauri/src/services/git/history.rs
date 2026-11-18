use super::{repository::{has_head, repository, validate_path}, runner::{checked, error, text, value}};
use crate::error::LumeResult;
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub id: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHistory {
    pub commits: Vec<GitCommit>,
    pub has_more: bool,
}

#[derive(Serialize)]
pub struct GitHistoryFile {
    pub path: String,
    pub status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileVersion {
    pub content: Option<String>,
    pub binary: bool,
    pub restorable: bool,
}

pub fn commit_id(root: &Path, revision: &str) -> LumeResult<String> {
    if ![40, 64].contains(&revision.len()) || !revision.bytes().all(|byte| byte.is_ascii_hexdigit()) { return Err(error("无效的提交版本")); }
    value(root, &["rev-parse", "--verify", &format!("{revision}^{{commit}}")])
}

pub fn history(workspace: &str, skip: u32, path: Option<&str>) -> LumeResult<GitHistory> {
    let root = repository(workspace, false)?;
    if skip > 100_000 { return Err(error("历史分页超出范围")); }
    if !has_head(&root)? { return Ok(GitHistory { commits: Vec::new(), has_more: false }); }
    let skip_arg = format!("--skip={skip}");
    let mut args = vec!["log", "-z", "--format=%H%x00%an%x00%aI%x00%s", "--max-count=31", &skip_arg];
    if let Some(path) = path {
        validate_path(&root, path)?;
        args.extend(["--follow", "--", path]);
    }
    let output = text(checked(&root, &args)?)?;
    let mut records: Vec<_> = output.split('\0').collect();
    if records.last() == Some(&"") { records.pop(); }
    if records.len() % 4 != 0 { return Err(error("无法解析 Git 提交历史")); }
    let mut commits = records.chunks_exact(4).map(|record| GitCommit { id: record[0].to_owned(), author: record[1].to_owned(), date: record[2].to_owned(), message: record[3].to_owned() }).collect::<Vec<_>>();
    let has_more = commits.len() > 30;
    commits.truncate(30);
    Ok(GitHistory { commits, has_more })
}

fn parent(root: &Path, revision: &str) -> LumeResult<Option<String>> {
    Ok(value(root, &["rev-list", "--parents", "-n", "1", revision])?.split_whitespace().nth(1).map(str::to_owned))
}

pub fn history_files(workspace: &str, revision: &str) -> LumeResult<Vec<GitHistoryFile>> {
    let root = repository(workspace, false)?;
    let revision = commit_id(&root, revision)?;
    let bytes = if let Some(parent) = parent(&root, &revision)? {
        checked(&root, &["diff", "--name-status", "--no-renames", "-z", &parent, &revision, "--"])?
    } else {
        checked(&root, &["diff-tree", "--root", "--no-commit-id", "--name-status", "--no-renames", "-r", "-z", &revision, "--"])?
    };
    let output = text(bytes)?;
    let fields: Vec<_> = output.split_terminator('\0').collect();
    if fields.len() % 2 != 0 { return Err(error("无法解析 Git 历史文件")); }
    if fields.len() > 10_000 { return Err(error("提交中的文件过多，无法显示。")); }
    Ok(fields.chunks_exact(2).map(|fields| GitHistoryFile { status: fields[0].to_owned(), path: fields[1].to_owned() }).collect())
}

pub fn history_diff(workspace: &str, revision: &str, path: &str) -> LumeResult<String> {
    let root = repository(workspace, false)?;
    validate_path(&root, path)?;
    let revision = commit_id(&root, revision)?;
    let bytes = if let Some(parent) = parent(&root, &revision)? {
        checked(&root, &["diff", "--no-ext-diff", "--no-textconv", "--no-renames", &parent, &revision, "--", path])?
    } else {
        checked(&root, &["show", "--format=", "--no-ext-diff", "--no-textconv", "--no-renames", &revision, "--", path])?
    };
    preview(bytes)
}

pub fn preview(bytes: Vec<u8>) -> LumeResult<String> {
    if bytes.contains(&0) { return Err(error("二进制文件无法按文本显示。")); }
    if bytes.len() > 512 * 1024 { return Err(error("内容超过预览大小限制（512 KB）。")); }
    text(bytes)
}

pub fn blob(root: &Path, revision: &str, path: &str) -> LumeResult<Option<(String, String)>> {
    let output = checked(root, &["ls-tree", "-z", revision, "--", path])?;
    if output.is_empty() { return Ok(None); }
    let output = text(output)?;
    let record = output.strip_suffix('\0').ok_or_else(|| error("无法解析历史文件"))?;
    let (metadata, found) = record.split_once('\t').ok_or_else(|| error("无法解析历史文件"))?;
    let fields: Vec<_> = metadata.split_whitespace().collect();
    if found != path || fields.len() != 3 || fields[1] != "blob" { return Ok(None); }
    Ok(Some((fields[0].to_owned(), fields[2].to_owned())))
}

pub fn file_version(workspace: &str, revision: &str, path: &str) -> LumeResult<GitFileVersion> {
    let root = repository(workspace, false)?;
    validate_path(&root, path)?;
    let revision = commit_id(&root, revision)?;
    let Some((mode, id)) = blob(&root, &revision, path)? else {
        return Ok(GitFileVersion { content: None, binary: false, restorable: false });
    };
    if !["100644", "100755"].contains(&mode.as_str()) { return Ok(GitFileVersion { content: None, binary: false, restorable: false }); }
    let bytes = checked(&root, &["cat-file", "blob", &id])?;
    let content = if bytes.contains(&0) || bytes.len() > 512 * 1024 { None } else { String::from_utf8(bytes).ok() };
    Ok(GitFileVersion { binary: content.is_none(), content, restorable: true })
}
