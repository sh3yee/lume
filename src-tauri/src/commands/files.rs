use crate::error::{LumeError, LumeResult};
use serde::Serialize;
use std::{
    fs::File,
    io::{Read, Take},
    path::Path,
};

const MAX_MARKDOWN_FILE_SIZE: u64 = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownFile {
    pub path: String,
    pub name: String,
    pub content: String,
}

/// 读取用户拖入窗口的 Markdown 文件，并限制类型、大小和符号链接。
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
    let mut reader: Take<File> = File::open(file_path)?.take(MAX_MARKDOWN_FILE_SIZE + 1);
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
