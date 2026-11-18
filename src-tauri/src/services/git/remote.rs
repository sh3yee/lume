use super::{
    repository::{current_branch, ensure_idle, has_head, repository},
    runner::{checked, error, run, run_remote, value},
};
use crate::error::LumeResult;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, net::Ipv6Addr, path::Path};

#[derive(Serialize)]
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
}

#[derive(Serialize)]
pub struct GitRemoteStatus {
    pub remotes: Vec<GitRemote>,
    pub upstream: Option<GitUpstream>,
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
    let mut urls = BTreeMap::<_, Vec<_>>::new();
    let output = value(root, &["remote", "-v"])?;
    for line in output.lines() {
        if let Some((name, url)) = line
            .strip_suffix(" (push)")
            .and_then(|line| line.split_once('\t'))
        {
            urls.entry(name).or_default().push(url);
        }
    }
    // 一个操作只推送到界面上展示的一个地址。
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

pub fn status(workspace: &str, branch: &str) -> LumeResult<GitRemoteStatus> {
    let root = repository(workspace, false)?;
    let remotes = push_remotes(&root)?;
    let mut result = GitRemoteStatus {
        remotes,
        upstream: None,
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

    let mut ahead = None;
    let mut behind = None;
    let reference = run(&root, &["show-ref", "--verify", "--quiet", &tracking.tracking_ref])?;
    if reference.status.success() {
        let range = format!("refs/heads/{branch}...{}", tracking.tracking_ref);
        let counts = value(&root, &["rev-list", "--left-right", "--count", &range, "--"])?;
        let (local, remote) = counts
            .split_once('\t')
            .ok_or_else(|| error("无法读取远程分支状态。"))?;
        ahead = Some(local.parse().map_err(|_| error("无法读取远程分支状态。"))?);
        behind = Some(remote.parse().map_err(|_| error("无法读取远程分支状态。"))?);
    } else if reference.status.code() != Some(1) {
        return Err(error("无法读取远程分支状态。"));
    }
    result.upstream = Some(GitUpstream {
        remote_name: tracking.remote_name,
        target_branch: tracking.branch,
        ahead,
        behind,
    });
    Ok(result)
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
    let refspec = format!("refs/heads/{branch}:{target_ref}");
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
        "--set-upstream",
        "--",
        &name,
        &refspec,
    ]);
    network_command(
        &root,
        &args,
        "推送失败，请检查远程地址、写入权限或仓库规则后重试。",
    )
}

pub fn fetch(workspace: &str, branch: &str, target: GitPushTarget) -> LumeResult<()> {
    let root = repository(workspace, true)?;
    if current_branch(&root)?.as_deref() != Some(branch) {
        return Err(error("当前分支或提交已变化，请刷新后重新确认。"));
    }
    let tracking = upstream(&root, branch)?
        .filter(|tracking| {
            Some(tracking.remote_name.as_str()) == target.remote_name.as_deref()
                && tracking.branch == target.target_branch
        })
        .ok_or_else(|| error("远程地址已变化或无法使用，请刷新后重新确认。"))?;
    confirm_remote(&push_remotes(&root)?, &tracking.remote_name, &target.url)?;
    let fetch_url = value(&root, &["remote", "get-url", "--", &tracking.remote_name])?;
    if !supported_url(&fetch_url) {
        return Err(error("请输入不含凭据的 HTTPS 或 SSH 仓库地址。"));
    }
    // 仅更新当前上游的本地跟踪引用。
    let refspec = format!("+refs/heads/{}:{}", tracking.branch, tracking.tracking_ref);
    network_command(
        &root,
        &[
            "fetch",
            "--no-tags",
            "--no-prune",
            "--no-prune-tags",
            "--recurse-submodules=no",
            "--no-write-fetch-head",
            "--refmap=",
            "--",
            &tracking.remote_name,
            &refspec,
        ],
        "无法获取远程状态，请检查远程地址和访问权限后重试。",
    )
}

fn network_command(root: &Path, args: &[&str], fallback: &str) -> LumeResult<()> {
    let output = run_remote(root, args)?;
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
        "远程分支有新提交，请用 Git 工具获取并整合更新后重试。"
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
