//! Tauri 命令定义模块
//!
//! 所有暴露给前端的命令在此声明。
//! 命令边界规范：
//! - 命令名以 `lume_` 前缀命名，避免与插件命令冲突。
//! - 返回类型统一为 `LumeResult<T>`，错误通过 `LumeError` 传递。
//! - 命令参数使用基础类型或自定义可序列化结构体。
//! - 命令应保持轻量，耗时操作在后台异步执行。

use crate::error::{LumeError, LumeResult};
use serde::{Deserialize, Serialize};
use std::{
    fs::File,
    io::{Read, Take},
    path::Path,
    process::Command,
};

const MAX_MARKDOWN_FILE_SIZE: u64 = 10 * 1024 * 1024;

/// 健康检查命令
///
/// 前端启动后调用此命令验证 Rust 后端是否就绪。
#[tauri::command]
pub fn lume_health_check() -> LumeResult<HealthStatus> {
    Ok(HealthStatus {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

/// 健康检查返回结构
#[derive(Debug, Serialize, Deserialize)]
pub struct HealthStatus {
    pub status: String,
    pub version: String,
}

/// 拖放打开的 Markdown 文件。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownFile {
    pub path: String,
    pub name: String,
    pub content: String,
}

/// 读取用户拖入窗口的 Markdown 文件。
///
/// 此命令刻意限制文件类型和大小，避免为前端开放宽泛的文件系统读取范围。
#[tauri::command]
pub fn lume_read_markdown_file(path: String) -> LumeResult<MarkdownFile> {
    let file_path = Path::new(&path);
    let extension = file_path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);

    if !matches!(extension.as_deref(), Some("md" | "markdown")) {
        return Err(LumeError::InvalidPath(
            "仅支持 .md 和 .markdown 文件".to_string(),
        ));
    }

    let metadata = std::fs::symlink_metadata(file_path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(LumeError::InvalidPath("拖入路径必须是普通文件".to_string()));
    }
    if metadata.len() > MAX_MARKDOWN_FILE_SIZE {
        return Err(LumeError::InvalidPath(
            "Markdown 文件不能超过 10 MiB".to_string(),
        ));
    }

    let file = File::open(file_path)?;
    let mut reader: Take<File> = file.take(MAX_MARKDOWN_FILE_SIZE + 1);
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    reader.read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_MARKDOWN_FILE_SIZE {
        return Err(LumeError::InvalidPath(
            "Markdown 文件不能超过 10 MiB".to_string(),
        ));
    }

    let content = String::from_utf8(bytes)
        .map_err(|_| LumeError::Serialization("文件不是有效的 UTF-8 编码".to_string()))?;
    let name = file_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| LumeError::InvalidPath("无法读取文件名".to_string()))?
        .to_string();

    Ok(MarkdownFile {
        path,
        name,
        content,
    })
}

/// 在系统文件管理器中选中一个已存在的普通文件。
#[tauri::command]
pub fn lume_reveal_file(path: String) -> LumeResult<()> {
    let file_path = Path::new(&path);
    if !file_path.is_file() {
        return Err(LumeError::InvalidPath("文件不存在或不是普通文件".to_string()));
    }

    #[cfg(target_os = "windows")]
    Command::new("explorer")
        .arg("/select,")
        .arg(file_path)
        .spawn()?;

    #[cfg(target_os = "macos")]
    Command::new("open").arg("-R").arg(file_path).spawn()?;

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = file_path
            .parent()
            .ok_or_else(|| LumeError::InvalidPath("无法定位文件所在目录".to_string()))?;
        Command::new("xdg-open").arg(parent).spawn()?;
    }

    Ok(())
}
