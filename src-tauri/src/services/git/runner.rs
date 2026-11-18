use crate::error::{LumeError, LumeResult};
use std::{
    io::Read,
    path::Path,
    process::{Command, Output, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    thread,
    time::{Duration, Instant},
};

const MAX_OUTPUT: usize = 8 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(30);
const REMOTE_TIMEOUT: Duration = Duration::from_secs(120);

pub fn error(message: impl Into<String>) -> LumeError {
    LumeError::Generic(message.into())
}

fn read_output(
    mut pipe: impl Read + Send + 'static,
    exceeded: Arc<AtomicBool>,
) -> mpsc::Receiver<Vec<u8>> {
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut chunk = [0; 8192];
        while let Ok(size) = pipe.read(&mut chunk) {
            if size == 0 {
                break;
            }
            if bytes.len() + size > MAX_OUTPUT {
                exceeded.store(true, Ordering::Relaxed);
                break;
            }
            bytes.extend_from_slice(&chunk[..size]);
        }
        let _ = sender.send(bytes);
    });
    receiver
}

pub fn run(directory: &Path, args: &[&str]) -> LumeResult<Output> {
    run_git(directory, args, None)
}

pub enum RemoteMode {
    Interactive,
    Background,
}

pub fn run_remote(directory: &Path, args: &[&str], mode: RemoteMode) -> LumeResult<Output> {
    run_git(directory, args, Some(mode))
}

fn run_git(directory: &Path, args: &[&str], remote: Option<RemoteMode>) -> LumeResult<Output> {
    let mut command = Command::new("git");
    command
        .current_dir(directory)
        .args(["--no-pager", "--literal-pathspecs", "-c", "color.ui=false"])
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_EDITOR", "true")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if matches!(remote, Some(RemoteMode::Background)) {
        command
            .env("GCM_INTERACTIVE", "0")
            .env("SSH_ASKPASS_REQUIRE", "never");
    }
    let timeout = if remote.is_some() {
        command.env("GIT_ALLOW_PROTOCOL", "https:ssh");
        REMOTE_TIMEOUT
    } else {
        TIMEOUT
    };
    // 不继承启动 Lume 的终端中可能残留的其他仓库上下文。
    for key in [
        "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR",
        "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    ] {
        command.env_remove(key);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|failure| {
        if failure.kind() == std::io::ErrorKind::NotFound {
            error("未找到 Git，请安装 Git 并重新打开 Lume。")
        } else {
            LumeError::from(failure)
        }
    })?;
    let exceeded = Arc::new(AtomicBool::new(false));
    let stdout = read_output(
        child.stdout.take().ok_or_else(|| error("无法读取 Git 输出"))?,
        exceeded.clone(),
    );
    let stderr = read_output(
        child.stderr.take().ok_or_else(|| error("无法读取 Git 输出"))?,
        exceeded.clone(),
    );
    let started = Instant::now();
    let status = loop {
        if exceeded.load(Ordering::Relaxed) || started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error(if exceeded.load(Ordering::Relaxed) {
                "Git 输出过大，请缩小操作范围。"
            } else if remote.is_some() {
                "远程 Git 操作超时，请检查网络或身份验证后重试。"
            } else {
                "Git 操作超时，请检查 Git hooks、签名或仓库状态后重试。"
            }));
        }
        match child.try_wait()? {
            Some(status) => break status,
            None => thread::sleep(Duration::from_millis(20)),
        }
    };
    // hooks 等子进程可能仍持有管道，不无限等待其退出。
    let stdout = stdout.recv_timeout(Duration::from_secs(2))
        .map_err(|_| error("Git 输出读取超时"))?;
    let stderr = stderr.recv_timeout(Duration::from_secs(2))
        .map_err(|_| error("Git 输出读取超时"))?;
    if exceeded.load(Ordering::Relaxed) {
        return Err(error("Git 输出过大，请缩小操作范围。"));
    }
    Ok(Output { status, stdout, stderr })
}

pub fn checked(directory: &Path, args: &[&str]) -> LumeResult<Vec<u8>> {
    let output = run(directory, args)?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr)
            .trim().chars().take(2000).collect::<String>();
        return Err(error(if message.is_empty() {
            "Git 操作失败".to_owned()
        } else {
            message
        }));
    }
    Ok(output.stdout)
}

pub fn text(bytes: Vec<u8>) -> LumeResult<String> {
    String::from_utf8(bytes).map_err(|_| error("Git 内容不是有效的 UTF-8，无法按文本显示。"))
}

pub fn value(directory: &Path, args: &[&str]) -> LumeResult<String> {
    Ok(text(checked(directory, args)?)?.trim_end_matches(['\r', '\n']).to_owned())
}
