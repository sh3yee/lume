use super::runner::error;
use crate::error::LumeResult;
use serde::{Deserialize, Serialize};
use std::{
    env,
    io::{self, BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        mpsc, Arc, Mutex, OnceLock,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter};

const ADDRESS: &str = "LUME_INTERNAL_GIT_ASKPASS_ADDRESS";
const TOKEN: &str = "LUME_INTERNAL_GIT_ASKPASS_TOKEN";
const ACTIVITY: &str = "lume-git-remote-activity";
const PROMPT: &str = "lume-git-auth-prompt";
const POLL: Duration = Duration::from_millis(50);
const MESSAGE_LIMIT: u64 = 16 * 1024;
const AUTH_TIMEOUT: Duration = Duration::from_secs(125);

static APP: OnceLock<AppHandle> = OnceLock::new();
static NEXT_ID: AtomicU32 = AtomicU32::new(1);
static ACTIVE: Mutex<Option<Operation>> = Mutex::new(None);

struct Operation {
    id: u32,
    stopped: Arc<AtomicBool>,
    pending: Option<(u32, mpsc::Sender<String>)>,
}

#[derive(Serialize, Clone)]
struct Activity {
    id: u32,
    active: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
enum PromptKind {
    Username,
    Password,
    Confirm,
}

#[derive(Serialize, Deserialize)]
struct Request {
    token: String,
    prompt: String,
    kind: PromptKind,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Prompt {
    operation_id: u32,
    id: u32,
    prompt: String,
    kind: PromptKind,
}

pub fn initialize(app: AppHandle) {
    let _ = APP.set(app);
}

pub fn answer(id: u32, value: String) -> LumeResult<()> {
    if value.len() > 4096 || value.contains(['\r', '\n', '\0']) {
        return Err(error("凭据输入过长或包含无效字符。"));
    }
    if let Ok(mut active) = ACTIVE.lock() {
        if let Some(operation) = active.as_mut() {
            if operation.pending.as_ref().map(|(id, _)| *id) == Some(id) {
                if let Some((_, sender)) = operation.pending.take() {
                    return sender.send(value).map_err(|_| error("认证请求已结束，请重试。"));
                }
            }
        }
    }
    Err(error("认证请求已结束，请重试。"))
}

pub fn cancel(id: u32) {
    if let Ok(active) = ACTIVE.lock() {
        if let Some(operation) = active.as_ref().filter(|operation| operation.id == id) {
            operation.stopped.store(true, Ordering::Relaxed);
        }
    }
}

pub(super) struct InteractiveRemote {
    id: u32,
    stopped: Arc<AtomicBool>,
    address: SocketAddr,
    token: String,
    executable: PathBuf,
}

impl InteractiveRemote {
    pub(super) fn start() -> LumeResult<Option<Self>> {
        let Some(app) = APP.get() else { return Ok(None); };
        let executable = env::current_exe()?;
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))?;
        listener.set_nonblocking(true)?;
        let address = listener.local_addr()?;
        let token = token()?;
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        let stopped = Arc::new(AtomicBool::new(false));
        let mut active = ACTIVE.lock().map_err(|_| error("无法启动 Git 认证。"))?;
        *active = Some(Operation { id, stopped: stopped.clone(), pending: None });
        drop(active);
        let remote = Self { id, stopped, address, token, executable };
        let server_stop = remote.stopped.clone();
        let server_token = remote.token.clone();
        thread::Builder::new().spawn(move || serve(listener, id, &server_token, &server_stop))?;
        let _ = app.emit(ACTIVITY, Activity { id, active: true });
        Ok(Some(remote))
    }

    pub(super) fn configure(&self, command: &mut Command) {
        // Git 会优先使用 GIT_ASKPASS 和 core.askPass，再回退到 SSH_ASKPASS。
        command.env(ADDRESS, self.address.to_string()).env(TOKEN, &self.token);
        if env::var_os("SSH_ASKPASS").is_none() {
            command.env("SSH_ASKPASS", &self.executable);
        }
        if env::var_os("SSH_ASKPASS_REQUIRE").is_none() {
            command.env("SSH_ASKPASS_REQUIRE", "force");
        }
    }

    pub(super) fn cancelled(&self) -> bool {
        self.stopped.load(Ordering::Relaxed)
    }
}

impl Drop for InteractiveRemote {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Relaxed);
        if let Ok(mut active) = ACTIVE.lock() {
            if active.as_ref().map(|operation| operation.id) == Some(self.id) {
                *active = None;
            }
        }
        if let Some(app) = APP.get() {
            let _ = app.emit(ACTIVITY, Activity { id: self.id, active: false });
        }
    }
}

fn serve(listener: TcpListener, operation_id: u32, token: &str, stopped: &AtomicBool) {
    while !stopped.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((stream, _)) => { let _ = prompt(stream, operation_id, token, stopped); }
            Err(failure) if failure.kind() == io::ErrorKind::WouldBlock => thread::sleep(POLL),
            Err(_) => break,
        }
    }
}

fn prompt(mut stream: TcpStream, operation_id: u32, token: &str, stopped: &AtomicBool) -> LumeResult<()> {
    stream.set_read_timeout(Some(Duration::from_millis(300)))?;
    stream.set_write_timeout(Some(Duration::from_secs(1)))?;
    let request: Request = read_message(&stream)?;
    if request.token != token || request.prompt.len() > 8192 || stopped.load(Ordering::Relaxed) {
        return Ok(());
    }
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (sender, receiver) = mpsc::channel();
    {
        let mut active = ACTIVE.lock().map_err(|_| error("无法启动 Git 认证。"))?;
        let Some(operation) = active.as_mut().filter(|operation| operation.id == operation_id) else {
            return Ok(());
        };
        operation.pending = Some((id, sender));
    }
    let payload = Prompt { operation_id, id, prompt: request.prompt, kind: request.kind };
    if APP.get().map_or(true, |app| app.emit(PROMPT, payload).is_err()) {
        return Ok(());
    }
    while !stopped.load(Ordering::Relaxed) {
        match receiver.recv_timeout(POLL) {
            Ok(value) => {
                write_message(&mut stream, &value)?;
                break;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => (),
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    Ok(())
}

fn read_message<T: serde::de::DeserializeOwned>(stream: &TcpStream) -> LumeResult<T> {
    let mut line = Vec::new();
    BufReader::new(stream).take(MESSAGE_LIMIT).read_until(b'\n', &mut line)?;
    if line.last() != Some(&b'\n') {
        return Err(error("Git 认证已取消或超时。"));
    }
    Ok(serde_json::from_slice(&line)?)
}

fn write_message(stream: &mut TcpStream, value: &impl Serialize) -> LumeResult<()> {
    serde_json::to_writer(&mut *stream, value)?;
    stream.write_all(b"\n")?;
    Ok(())
}

fn get_answer(address: &str, token: String) -> LumeResult<()> {
    let address: SocketAddr = address.parse().map_err(|_| error("Git 认证地址无效。"))?;
    if !address.ip().is_loopback() {
        return Err(error("Git 认证地址无效。"));
    }
    let prompt = env::args().nth(1).ok_or_else(|| error("Git 认证请求无效。"))?;
    let kind = if env::var("SSH_ASKPASS_PROMPT").as_deref() == Ok("confirm") {
        PromptKind::Confirm
    } else if prompt.starts_with("Username for ") {
        PromptKind::Username
    } else {
        PromptKind::Password
    };
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))?;
    stream.set_read_timeout(Some(AUTH_TIMEOUT))?;
    stream.set_write_timeout(Some(Duration::from_secs(2)))?;
    write_message(&mut stream, &Request { token, prompt, kind })?;
    let value: String = read_message(&stream)?;
    let mut stdout = io::stdout().lock();
    stdout.write_all(value.as_bytes())?;
    stdout.write_all(b"\n")?;
    stdout.flush()?;
    Ok(())
}

pub fn run_helper() -> Option<i32> {
    let address = env::var(ADDRESS).ok()?;
    let token = env::var(TOKEN).ok()?;
    Some(if get_answer(&address, token).is_ok() { 0 } else { 1 })
}

fn token() -> io::Result<String> {
    let mut bytes = [0u8; 32];
    fill_random(&mut bytes)?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

#[cfg(unix)]
fn fill_random(bytes: &mut [u8]) -> io::Result<()> {
    std::fs::File::open("/dev/urandom")?.read_exact(bytes)
}

#[cfg(windows)]
fn fill_random(bytes: &mut [u8]) -> io::Result<()> {
    #[link(name = "bcrypt")]
    extern "system" {
        fn BCryptGenRandom(algorithm: *mut std::ffi::c_void, buffer: *mut u8, len: u32, flags: u32) -> i32;
    }
    // BCRYPT_USE_SYSTEM_PREFERRED_RNG 允许用空的算法句柄从系统取随机数。
    let status = unsafe { BCryptGenRandom(std::ptr::null_mut(), bytes.as_mut_ptr(), bytes.len() as u32, 2) };
    if status == 0 { Ok(()) } else { Err(io::Error::other("OS random generator failed")) }
}
