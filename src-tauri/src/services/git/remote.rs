use super::{
    repository::{current_branch, directory, display_path, ensure_idle, find_root, has_head, operation, repository, validate_path},
    runner::{checked, error, run, run_remote, text, value, RemoteMode},
};
use crate::error::LumeResult;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    io::ErrorKind,
    net::Ipv6Addr,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU32, Ordering},
};

const REMOTE_AHEAD: &str = "远程分支有新提交，请获取远程状态并整合更新后重试。";
static CLONE_SEQUENCE: AtomicU32 = AtomicU32::new(0);

struct CloneStaging(PathBuf);

impl Drop for CloneStaging {
    fn drop(&mut self) {
        // 只清理本次专用目录，不进入目标目录或被替换的链接。
        if std::fs::canonicalize(&self.0).as_ref().ok() == Some(&self.0)
            && std::fs::symlink_metadata(&self.0).is_ok_and(|meta| !meta.file_type().is_symlink())
        {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}

#[derive(Deserialize, PartialEq, Serialize)]
pub struct GitRemote {
    pub name: String,
    pub url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitUpstream {
    pub remote_name: String,
    pub target_branch: String,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub head: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteStatus {
    pub remotes: Vec<GitRemote>,
    pub fetch_remotes: Vec<GitRemote>,
    pub branches: Vec<GitRemoteBranch>,
    pub upstream: Option<GitUpstream>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteBranch {
    pub ref_name: String,
    pub remote_name: String,
    pub name: String,
}

struct FetchRemote {
    address: GitRemote,
    refspecs: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPushTarget {
    pub remote_name: Option<String>,
    pub url: String,
    pub target_branch: String,
}

struct Upstream {
    remote_name: String,
    branch: String,
    tracking_ref: String,
}

fn supported_url(address: &str) -> bool {
    if address.is_empty()
        || address.starts_with('-')
        || address.contains(['\\', '?', '#'])
        || address.chars().any(|character| character.is_control() || character.is_whitespace())
    {
        return false;
    }

    if address.contains("://") {
        let Ok(url) = tauri::Url::parse(address) else {
            return false;
        };
        return url.host().is_some()
            && url.password().is_none()
            && match url.scheme() {
                "https" => url.username().is_empty(),
                "ssh" => true,
                _ => false,
            };
    }

    // Git 也接受 SSH 的 [user@]host:path 写法。
    let endpoint_and_path = address
        .split_once("]:")
        .map(|(endpoint, path)| (&address[..endpoint.len() + 1], path))
        .or_else(|| address.split_once(':'));
    let Some((endpoint, path)) = endpoint_and_path else {
        return false;
    };
    let valid_name = |part: &str| {
        part.starts_with(|character: char| character.is_ascii_alphanumeric())
            && part
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    };
    let host = if let Some((user, host)) = endpoint.split_once('@') {
        if !valid_name(user) {
            return false;
        }
        host
    } else {
        if endpoint.len() == 1 && cfg!(windows) {
            return false;
        }
        endpoint
    };
    let valid_host = host
        .strip_prefix('[')
        .and_then(|host| host.strip_suffix(']'))
        .map_or_else(|| valid_name(host), |host| host.parse::<Ipv6Addr>().is_ok());
    valid_host && !path.is_empty() && !path.starts_with(':')
}

fn push_remotes(root: &Path) -> LumeResult<Vec<GitRemote>> {
    remote_addresses(root, " (push)")
}

fn remote_addresses(root: &Path, suffix: &str) -> LumeResult<Vec<GitRemote>> {
    let mut urls = BTreeMap::<_, Vec<_>>::new();
    let output = value(root, &["remote", "-v"])?;
    for line in output.lines() {
        if let Some((name, url)) = line
            .strip_suffix(suffix)
            .and_then(|line| line.split_once('\t'))
        {
            urls.entry(name).or_default().push(url);
        }
    }
    // 使用界面上展示的唯一地址。
    Ok(urls
        .into_iter()
        .filter_map(|(name, urls)| match urls.as_slice() {
            [url] if !name.starts_with('-') && supported_url(url) => Some(GitRemote {
                name: name.to_owned(),
                url: (*url).to_owned(),
            }),
            _ => None,
        })
        .collect())
}

fn fetch_remotes(root: &Path) -> LumeResult<Vec<FetchRemote>> {
    let mut remotes = Vec::new();
    for address in remote_addresses(root, " (fetch)")? {
        let key = format!("remote.{}.fetch", address.name);
        let output = run(root, &["config", "--get-all", "--", &key])?;
        if output.status.code() == Some(1) {
            continue;
        }
        if !output.status.success() {
            return Err(error("无法读取远程仓库的获取配置。"));
        }
        let config = text(output.stdout)?;
        let mut refspecs = Vec::new();
        for spec in config.lines() {
            if spec.starts_with('^') {
                refspecs.push(spec.to_owned());
            } else if let Some((source, destination)) = spec.strip_prefix('+').unwrap_or(spec).split_once(':') {
                // 只更新远程跟踪引用，保留单分支克隆和自定义的分支映射。
                if source.starts_with("refs/heads/") && destination.starts_with("refs/remotes/") {
                    refspecs.push(format!("+{source}:{destination}"));
                } else if source == "refs/*" && destination.starts_with("refs/remotes/") {
                    refspecs.push(format!("+refs/heads/*:{}", destination.replace('*', "heads/*")));
                }
            }
        }
        if refspecs.iter().any(|spec| spec.starts_with('+')) {
            remotes.push(FetchRemote { address, refspecs });
        }
    }
    Ok(remotes)
}

fn refspec_match<'a>(pattern: &str, reference: &'a str) -> Option<&'a str> {
    if let Some((prefix, suffix)) = pattern.split_once('*') {
        return reference.strip_prefix(prefix)?.strip_suffix(suffix);
    }
    (pattern == reference).then_some("")
}

fn source_branch(remote: &FetchRemote, reference: &str) -> Option<String> {
    remote.refspecs.iter().find_map(|spec| {
        let (source, destination) = spec.strip_prefix('+')?.split_once(':')?;
        let source = source.replace('*', refspec_match(destination, reference)?);
        if remote.refspecs.iter().any(|spec| {
            spec.strip_prefix('^').and_then(|pattern| refspec_match(pattern, &source)).is_some()
        }) {
            return None;
        }
        source.strip_prefix("refs/heads/").map(str::to_owned)
    })
}

fn branch_options(root: &Path, remotes: &[FetchRemote]) -> LumeResult<Vec<GitRemoteBranch>> {
    let refs = value(
        root,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(symref)%00%(upstream)",
            "refs/heads/",
            "refs/remotes/",
        ],
    )?;
    let mut tracked = HashSet::new();
    let mut references = Vec::new();
    for line in refs.lines() {
        let mut fields = line.split('\0');
        let (Some(reference), Some(symbolic), Some(upstream)) =
            (fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        if reference.starts_with("refs/heads/") {
            tracked.insert(upstream);
        } else if symbolic.is_empty() {
            references.push(reference);
        }
    }

    let mut branches = Vec::new();
    for reference in references.into_iter().filter(|reference| !tracked.contains(reference)) {
        let mut matches = remotes.iter().filter_map(|remote| {
            source_branch(remote, reference).map(|name| (&remote.address.name, name))
        });
        let Some((remote_name, name)) = matches.next() else {
            continue;
        };
        // 一个跟踪引用有多个来源时，Git 无法可靠地设置上游。
        if matches.next().is_none() {
            branches.push(GitRemoteBranch {
                ref_name: reference.to_owned(),
                remote_name: remote_name.clone(),
                name,
            });
        }
    }
    Ok(branches)
}

pub fn branch_option(root: &Path, reference: &str) -> LumeResult<Option<GitRemoteBranch>> {
    Ok(branch_options(root, &fetch_remotes(root)?)?
        .into_iter()
        .find(|branch| branch.ref_name == reference))
}

fn upstream(root: &Path, branch: &str) -> LumeResult<Option<Upstream>> {
    let local_ref = format!("refs/heads/{branch}");
    let result = value(
        root,
        &[
            "for-each-ref",
            "--count=1",
            "--format=%(refname)%00%(upstream:remotename)%00%(upstream:remoteref)%00%(upstream)",
            "--",
            &local_ref,
        ],
    )?;
    let mut fields = result.split('\0');
    let (Some(local), Some(remote_name), Some(remote_ref), Some(tracking_ref)) =
        (fields.next(), fields.next(), fields.next(), fields.next())
    else {
        return Ok(None);
    };
    if local != local_ref || remote_name.is_empty() || !tracking_ref.starts_with("refs/remotes/") {
        return Ok(None);
    }
    Ok(remote_ref.strip_prefix("refs/heads/").map(|branch| Upstream {
        remote_name: remote_name.to_owned(),
        branch: branch.to_owned(),
        tracking_ref: tracking_ref.to_owned(),
    }))
}

pub fn status(workspace: &str, branch: Option<&str>) -> LumeResult<GitRemoteStatus> {
    let root = repository(workspace, false)?;
    let fetch_remotes = fetch_remotes(&root)?;
    let mut result = GitRemoteStatus {
        remotes: push_remotes(&root)?,
        branches: branch_options(&root, &fetch_remotes)?,
        fetch_remotes: fetch_remotes.into_iter().map(|remote| remote.address).collect(),
        upstream: None,
    };
    let Some(branch) = branch else {
        return Ok(result);
    };
    let Some(tracking) = upstream(&root, branch)? else {
        return Ok(result);
    };
    if !result
        .remotes
        .iter()
        .any(|remote| remote.name == tracking.remote_name)
    {
        return Ok(result);
    }

    let counts = tracking_counts(&root, &format!("refs/heads/{branch}"), &tracking.tracking_ref)?;
    let head = counts.map(|_| value(&root, &["rev-parse", "--verify", &tracking.tracking_ref])).transpose()?;
    result.upstream = Some(GitUpstream {
        remote_name: tracking.remote_name,
        target_branch: tracking.branch,
        ahead: counts.map(|(ahead, _)| ahead),
        behind: counts.map(|(_, behind)| behind),
        head,
    });
    Ok(result)
}

pub fn clone_repository(parent: &str, name: &str, address: &str) -> LumeResult<String> {
    let parent = directory(parent)?;
    let address = address.trim();
    if !supported_url(address) {
        return Err(error("请输入不含凭据的 HTTPS 或 SSH 仓库地址。"));
    }
    if name.trim() != name || name.contains(['/', '\\', '<', '>', '"', '|', '?', '*'])
        || name.chars().any(char::is_control)
    {
        return Err(error("请输入有效的新文件夹名称。"));
    }
    let destination = validate_path(&parent, name)?;
    match std::fs::symlink_metadata(&destination) {
        Ok(_) => return Err(error("目标文件夹已存在，请选择新名称。")),
        Err(failure) if failure.kind() == ErrorKind::NotFound => (),
        Err(failure) => return Err(failure.into()),
    }
    let staging_path = parent.join(format!(
        ".lume-clone-{}-{}",
        std::process::id(),
        CLONE_SEQUENCE.fetch_add(1, Ordering::Relaxed),
    ));
    std::fs::create_dir(&staging_path)?;
    let staging = CloneStaging(staging_path);
    let source = display_path(&staging.0);
    network_command(
        &parent,
        &["clone", "--no-recurse-submodules", "--", address, &source],
        "无法克隆仓库，请检查远程地址和访问权限后重试。",
        RemoteMode::Interactive,
    )?;
    // 克隆期间目标名保持可用，发布前独占创建，避免替换已有仓库。
    std::fs::create_dir(&destination).map_err(|failure| {
        if failure.kind() == ErrorKind::AlreadyExists {
            error("目标文件夹已存在，请选择新名称。")
        } else {
            failure.into()
        }
    })?;
    #[cfg(windows)]
    std::fs::remove_dir(&destination)?;
    if let Err(failure) = std::fs::rename(&staging.0, &destination) {
        #[cfg(not(windows))]
        let _ = std::fs::remove_dir(&destination);
        return Err(failure.into());
    }
    Ok(display_path(&destination))
}

pub(super) fn checked_upstream(root: &Path, branch: &str, expected: &str) -> LumeResult<String> {
    let tracking = upstream(root, branch)?
        .ok_or_else(|| error("当前分支没有配置远程跟踪分支。"))?;
    let commit = value(root, &["rev-parse", "--verify", &format!("{}^{{commit}}", tracking.tracking_ref)])?;
    if commit != expected {
        return Err(error("远程跟踪分支已变化，请刷新后重新确认。"));
    }
    Ok(commit)
}

fn tracking_counts(root: &Path, source: &str, tracking_ref: &str) -> LumeResult<Option<(u32, u32)>> {
    let reference = run(root, &["show-ref", "--verify", "--quiet", tracking_ref])?;
    if reference.status.code() == Some(1) {
        return Ok(None);
    }
    if !reference.status.success() {
        return Err(error("无法读取远程分支状态。"));
    }
    let range = format!("{source}...{tracking_ref}");
    let counts = value(root, &["rev-list", "--left-right", "--count", &range, "--"])?;
    let (ahead, behind) = counts
        .split_once('\t')
        .ok_or_else(|| error("无法读取远程分支状态。"))?;
    Ok(Some((
        ahead.parse().map_err(|_| error("无法读取远程分支状态。"))?,
        behind.parse().map_err(|_| error("无法读取远程分支状态。"))?,
    )))
}

fn confirm_remote(remotes: &[GitRemote], name: &str, url: &str) -> LumeResult<()> {
    if !remotes.iter().any(|remote| remote.name == name && remote.url == url) {
        return Err(error("远程地址已变化或无法使用，请刷新后重新确认。"));
    }
    Ok(())
}

fn connect_remote(root: &Path, remotes: &[GitRemote], url: &str) -> LumeResult<String> {
    // 上次推送可能已保存远程配置，重试时直接使用该连接。
    if let Some(remote) = remotes.iter().find(|remote| remote.url == url) {
        return Ok(remote.name.clone());
    }

    let names = value(root, &["remote"])?;
    let mut name = "origin".to_owned();
    let mut suffix = 2;
    while names.lines().any(|existing| existing == name) {
        name = format!("origin-{suffix}");
        suffix += 1;
    }
    checked(root, &["remote", "add", "--", &name, url])?;
    confirm_remote(&push_remotes(root)?, &name, url)?;
    Ok(name)
}

pub fn push(workspace: &str, branch: &str, head: &str, target: GitPushTarget) -> LumeResult<()> {
    let root = repository(workspace, true)?;
    ensure_idle(&root)?;
    if current_branch(&root)?.as_deref() != Some(branch)
        || !has_head(&root)?
        || value(&root, &["rev-parse", "HEAD"])? != head
    {
        return Err(error("当前分支或提交已变化，请刷新后重新确认。"));
    }

    let url = target.url.trim();
    if !supported_url(url) {
        return Err(error("请输入不含凭据的 HTTPS 或 SSH 仓库地址。"));
    }

    let target_ref = format!("refs/heads/{}", target.target_branch.trim());
    if !run(&root, &["check-ref-format", &target_ref])?.status.success() {
        return Err(error("请输入有效的目标分支名。"));
    }
    let remotes = push_remotes(&root)?;
    let name = if let Some(name) = target.remote_name {
        confirm_remote(&remotes, &name, url)?;
        name
    } else {
        connect_remote(&root, &remotes, url)?
    };
    push_ref(
        &root,
        &format!("refs/heads/{branch}:{target_ref}"),
        &name,
        RemoteMode::Interactive,
    )
}

pub fn auto_push(workspace: &str) -> LumeResult<bool> {
    let workspace = directory(workspace)?;
    let Some(root) = find_root(&workspace)?.filter(|root| root == &workspace) else {
        return Ok(false);
    };
    if operation(&root)?.is_some() {
        return Ok(false);
    }
    let Some(branch) = current_branch(&root)? else {
        return Ok(false);
    };
    let Some(tracking) = upstream(&root, &branch)? else {
        return Ok(false);
    };
    if !push_remotes(&root)?
        .iter()
        .any(|remote| remote.name == tracking.remote_name)
    {
        return Ok(false);
    }

    let source_ref = format!("refs/heads/{branch}");
    let head = value(&root, &["rev-parse", "--verify", &source_ref])?;
    let Some((ahead, behind)) = tracking_counts(&root, &head, &tracking.tracking_ref)? else {
        return Ok(false);
    };
    if ahead == 0 {
        return Ok(false);
    }
    if behind > 0 {
        return Err(error(REMOTE_AHEAD));
    }
    ensure_idle(&root)?;
    if current_branch(&root)?.as_deref() != Some(branch.as_str())
        || value(&root, &["rev-parse", "HEAD"])? != head
    {
        return Ok(false);
    }
    // 固定这次检查过的提交，避免外部 Git 在推送前改变分支指向。
    let refspec = format!("{head}:refs/heads/{}", tracking.branch);
    push_ref(&root, &refspec, &tracking.remote_name, RemoteMode::Background)?;
    Ok(true)
}

fn push_ref(root: &Path, refspec: &str, name: &str, mode: RemoteMode) -> LumeResult<()> {
    let mut args = Vec::new();
    let mirror_override = format!("remote.{name}.mirror=false");
    // Git 会读取远程的镜像配置，显式关闭它以保证只更新目标分支。
    if !name.contains('=') {
        args.extend(["-c", &mirror_override]);
    }
    args.extend([
        "push",
        "--porcelain",
        "--no-follow-tags",
        "--recurse-submodules=no",
    ]);
    if matches!(mode, RemoteMode::Interactive) {
        args.push("--set-upstream");
    }
    args.extend(["--", name, refspec]);
    network_command(
        root,
        &args,
        "推送失败，请检查远程地址、写入权限或仓库规则后重试。",
        mode,
    )
}

pub fn fetch(workspace: &str, target: GitRemote) -> LumeResult<()> {
    let root = repository(workspace, true)?;
    let remote = fetch_remotes(&root)?
        .into_iter()
        .find(|remote| remote.address == target)
        .ok_or_else(|| error("远程地址已变化或无法使用，请刷新后重新确认。"))?;
    let mut args = vec![
        "fetch",
        "--atomic",
        "--no-tags",
        "--prune",
        "--no-prune-tags",
        "--recurse-submodules=no",
        "--no-write-fetch-head",
        "--refmap=",
        "--",
        &remote.address.name,
    ];
    args.extend(remote.refspecs.iter().map(String::as_str));
    network_command(
        &root,
        &args,
        "无法获取远程状态，请检查远程地址和访问权限后重试。",
        RemoteMode::Interactive,
    )
}

fn network_command(root: &Path, args: &[&str], fallback: &str, mode: RemoteMode) -> LumeResult<()> {
    let output = run_remote(root, args, mode)?;
    if output.status.success() {
        return Ok(());
    }

    // 远端和凭据工具的输出可能包含敏感信息，只返回可处理的错误原因。
    let detail = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    )
    .to_ascii_lowercase();
    let contains = |patterns: &[&str]| patterns.iter().any(|pattern| detail.contains(pattern));
    let message = if contains(&["non-fast-forward", "(fetch first)"]) {
        REMOTE_AHEAD
    } else if contains(&[
        "host key verification failed",
        "remote host identification has changed",
    ]) {
        "SSH 主机验证失败，请在系统 Git 中检查并确认主机密钥后重试。"
    } else if contains(&[
        "authentication failed",
        "permission denied (publickey",
        "could not read username",
        "could not read password",
        "terminal prompts disabled",
        "the requested url returned error: 401",
    ]) {
        "远程身份验证失败，请检查系统 Git 凭据或 SSH 密钥后重试。"
    } else if contains(&[
        "could not resolve",
        "failed to connect",
        "connection timed out",
        "connection refused",
        "network is unreachable",
        "connection reset",
        "operation timed out",
    ]) {
        "无法连接远程仓库，请检查网络后重试。"
    } else if contains(&["repository not found", "does not appear to be a git repository"]) {
        "找不到远程仓库，请检查地址和访问权限。"
    } else if contains(&["couldn't find remote ref"]) {
        "找不到远程分支，请检查目标分支。"
    } else if contains(&["[remote rejected]", "protected branch"]) {
        "远程拒绝推送，请检查写入权限或分支保护规则。"
    } else if contains(&["error: 403"]) {
        "远程仓库拒绝访问，请检查当前凭据的权限。"
    } else {
        fallback
    };
    Err(error(message))
}
