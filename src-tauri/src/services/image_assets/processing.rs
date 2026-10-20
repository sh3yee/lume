use super::{
    copy_new, document_directory, is_remote, percent_decode, resolve_image_path, staging_dir,
    timestamp, unique_path, ImageAsset, ImagePathOptions, ImageUploader, MAX_IMAGE_FILE_SIZE,
};
use crate::error::{LumeError, LumeResult};
use std::{
    fs::{File, OpenOptions},
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use tauri::AppHandle;

const MAX_COMMAND_OUTPUT: usize = 1024 * 1024;

fn command_output(mut command: Command) -> LumeResult<String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let stdout = child.stdout.take()
        .ok_or_else(|| LumeError::Generic("无法读取命令输出".to_string()))?;
    let stderr = child.stderr.take()
        .ok_or_else(|| LumeError::Generic("无法读取命令错误输出".to_string()))?;
    let read_output = |mut reader: Box<dyn Read + Send>| {
        let mut output = Vec::new();
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => {
                    let retained = count.min(MAX_COMMAND_OUTPUT.saturating_sub(output.len()));
                    output.extend_from_slice(&buffer[..retained]);
                }
            }
        }
        output
    };
    let stdout = thread::spawn(move || read_output(Box::new(stdout)));
    let stderr = thread::spawn(move || read_output(Box::new(stderr)));
    let deadline = Instant::now() + Duration::from_secs(120);
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break Some(status);
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        thread::sleep(Duration::from_millis(25));
    };
    // 子进程可能把输出句柄留给后台服务，避免等待读取线程阻塞命令超时。
    if status.is_none() {
        return Err(LumeError::Generic("图片命令执行超过 120 秒，已终止".to_string()));
    }
    let read_deadline = Instant::now() + Duration::from_secs(2);
    while (!stdout.is_finished() || !stderr.is_finished()) && Instant::now() < read_deadline {
        thread::sleep(Duration::from_millis(10));
    }
    if !stdout.is_finished() || !stderr.is_finished() {
        return Err(LumeError::Generic(
            "图片命令未关闭输出，请使用执行后正常退出的上传工具".to_string(),
        ));
    }
    let stdout = String::from_utf8_lossy(&stdout.join().unwrap_or_default()).into_owned();
    let stderr = String::from_utf8_lossy(&stderr.join().unwrap_or_default()).into_owned();
    if !status.is_some_and(|status| status.success()) {
        let details = if stderr.trim().is_empty() { &stdout } else { &stderr };
        return Err(LumeError::Generic(
            format!("图片命令执行失败：{details}").chars().take(4000).collect(),
        ));
    }
    Ok(stdout)
}

fn downloaded_extension(path: &Path) -> LumeResult<String> {
    let mut bytes = [0u8; 1024];
    let length = File::open(path)?.read(&mut bytes)?;
    let bytes = &bytes[..length];
    let extension = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "png"
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        "jpg"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "gif"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "webp"
    } else if bytes.starts_with(b"BM") {
        "bmp"
    } else if bytes.get(4..8) == Some(b"ftyp")
        && bytes.windows(4).take(32).any(|value| value == b"avif" || value == b"avis")
    {
        "avif"
    } else if bytes.starts_with(b"\0\0\x01\0") {
        "ico"
    } else if bytes.starts_with(b"II*\0") || bytes.starts_with(b"MM\0*") {
        "tiff"
    } else if std::str::from_utf8(bytes).is_ok_and(|value| {
        let value = value.trim_start_matches('\u{feff}').trim_start();
        value.starts_with("<svg") || (value.starts_with("<?xml") && value.contains("<svg"))
    }) {
        "svg"
    } else {
        return Err(LumeError::InvalidPath("下载结果不是受支持的图片文件".to_string()));
    };
    Ok(extension.to_string())
}

pub(super) fn download_image(url: &str, directory: &Path) -> LumeResult<PathBuf> {
    let url = if url.starts_with("//") {
        format!("https:{url}")
    } else {
        url.to_string()
    };
    let parsed = tauri::Url::parse(&url)
        .map_err(|_| LumeError::InvalidPath("远程图片地址无效".to_string()))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err(LumeError::InvalidPath("仅支持下载 HTTP(S) 图片".to_string()));
    }
    std::fs::create_dir_all(directory)?;
    let temporary = directory.join(format!(".lume-download-{}", timestamp()));
    OpenOptions::new().write(true).create_new(true).open(&temporary)?;
    #[cfg(target_os = "windows")]
    let mut command = Command::new("curl.exe");
    #[cfg(not(target_os = "windows"))]
    let mut command = Command::new("curl");
    command.args([
        "--disable", "--fail", "--location", "--silent", "--show-error",
        "--proto", "=http,https", "--proto-redir", "=http,https",
        "--connect-timeout", "15", "--max-time", "60",
        "--max-filesize", &MAX_IMAGE_FILE_SIZE.to_string(), "--output",
    ])
    .arg(&temporary)
    .arg("--")
    .arg(parsed.as_str());
    let result = (|| {
        command_output(command)?;
        let metadata = std::fs::metadata(&temporary)?;
        if metadata.len() == 0 || metadata.len() > MAX_IMAGE_FILE_SIZE {
            return Err(LumeError::InvalidPath("远程图片必须小于 20 MiB".to_string()));
        }
        let extension = downloaded_extension(&temporary)?;
        let name = parsed.path_segments()
            .and_then(|segments| segments.last())
            .filter(|value| !value.is_empty())
            .and_then(|value| percent_decode(value).ok())
            .unwrap_or_else(|| "image".to_string());
        let destination = unique_path(directory, &name, &extension);
        copy_new(&temporary, &destination)?;
        Ok(destination)
    })();
    let _ = std::fs::remove_file(temporary);
    result
}

pub fn upload_image_files(
    app: &AppHandle,
    markdown_paths: &[String],
    document: Option<&str>,
    id: &str,
    uploader: &ImageUploader,
    options: &ImagePathOptions,
) -> LumeResult<Vec<ImageAsset>> {
    if markdown_paths.is_empty() {
        return Ok(Vec::new());
    }
    if uploader.program.trim().is_empty()
        || uploader.program.contains('\0')
        || uploader.args.iter().any(|arg| arg.contains('\0'))
    {
        return Err(LumeError::InvalidPath("上传程序或参数无效".to_string()));
    }
    #[cfg(target_os = "windows")]
    if Path::new(&uploader.program).extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat"))
    {
        return Err(LumeError::InvalidPath(
            "请使用可执行程序（如 node.exe），将上传脚本路径填写为独立参数".to_string(),
        ));
    }
    let mut temporary = Vec::new();
    let result = (|| {
        let mut sources = Vec::with_capacity(markdown_paths.len());
        for markdown in markdown_paths {
            let source = if is_remote(markdown) {
                let path = download_image(markdown, &staging_dir(app, id)?)?;
                temporary.push(path.clone());
                path.to_string_lossy().into_owned()
            } else {
                resolve_image_path(app, markdown, document, id, options)?
            };
            sources.push(source);
        }
        let filename = document
            .and_then(|value| Path::new(value).file_name())
            .and_then(|value| value.to_str())
            .unwrap_or("");
        let replace = |value: &str| {
            value.replace("${filename}", filename).replace("${filepath}", document.unwrap_or(""))
        };
        let mut command = Command::new(replace(&uploader.program));
        command.args(uploader.args.iter().map(|arg| replace(arg))).args(&sources);
        if let Some(document) = document {
            command.current_dir(document_directory(document)?);
        }
        let output = command_output(command)?;
        let lines: Vec<&str> = output.lines().map(str::trim).filter(|line| !line.is_empty()).collect();
        if lines.len() < sources.len() {
            return Err(LumeError::Generic(format!(
                "上传程序应在最后 {} 行逐行返回图片 URL", sources.len(),
            )));
        }
        lines[lines.len() - sources.len()..].iter().zip(sources)
            .map(|(line, local_path)| {
                let url = tauri::Url::parse(line)
                    .map_err(|_| LumeError::Generic(format!("上传程序返回的图片地址无效：{line}")))?;
                if !matches!(url.scheme(), "http" | "https" | "file")
                    || (url.scheme() != "file" && url.host_str().is_none())
                {
                    return Err(LumeError::Generic("上传结果必须使用 HTTP(S) 或 file:// 地址".to_string()));
                }
                Ok(ImageAsset {
                    markdown_path: (*line).to_string(),
                    local_path,
                })
            })
            .collect()
    })();
    for path in temporary {
        let _ = std::fs::remove_file(path);
    }
    result
}
