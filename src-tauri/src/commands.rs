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
    fs::{File, OpenOptions},
    io::{Read, Take},
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const MAX_MARKDOWN_FILE_SIZE: u64 = 10 * 1024 * 1024;
const MAX_IMAGE_FILE_SIZE: u64 = 20 * 1024 * 1024;
const MAX_WORKSPACE_ENTRIES: usize = 5_000;
const MAX_WORKSPACE_DEPTH: usize = 32;
const STAGED_IMAGE_SCHEME: &str = "lume-staged://";
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"];

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

/// 返回操作系统启动 Lume 时传入的 Markdown 文件路径。
#[tauri::command]
pub fn lume_startup_file_paths() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|path| {
            matches!(
                Path::new(path)
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(str::to_ascii_lowercase)
                    .as_deref(),
                Some("md" | "markdown")
            )
        })
        .collect()
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

/// 工作区中的 Markdown 文件或包含 Markdown 文件的目录。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub children: Vec<WorkspaceEntry>,
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("md" | "markdown")
    )
}

fn read_workspace_entries(
    directory: &Path,
    depth: usize,
    entry_count: &mut usize,
) -> LumeResult<Vec<WorkspaceEntry>> {
    if depth > MAX_WORKSPACE_DEPTH || *entry_count >= MAX_WORKSPACE_ENTRIES {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for entry in std::fs::read_dir(directory)? {
        if *entry_count >= MAX_WORKSPACE_ENTRIES {
            break;
        }
        let entry = match entry {
            Ok(value) => value,
            Err(_) => continue,
        };
        let path = entry.path();
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().into_owned();
        if metadata.is_dir() {
            let children = read_workspace_entries(&path, depth + 1, entry_count).unwrap_or_default();
            if children.is_empty() {
                continue;
            }
            *entry_count += 1;
            entries.push(WorkspaceEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                is_directory: true,
                children,
            });
        } else if metadata.is_file() && is_markdown_path(&path) {
            *entry_count += 1;
            entries.push(WorkspaceEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                is_directory: false,
                children: Vec::new(),
            });
        }
    }

    entries.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

/// 读取工作区中的 Markdown 目录树。
///
/// 跳过符号链接及不含 Markdown 文件的目录，并限制树深度和节点数量。
#[tauri::command]
pub fn lume_read_workspace(path: String) -> LumeResult<Vec<WorkspaceEntry>> {
    let root = Path::new(&path);
    let metadata = std::fs::symlink_metadata(root)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(LumeError::InvalidPath("工作区路径必须是普通目录".to_string()));
    }

    read_workspace_entries(root, 0, &mut 0)
}

/// 在工作区目录中创建 Markdown 文件或子目录。
#[tauri::command]
pub fn lume_create_workspace_entry(
    parent_path: String,
    name: String,
    is_directory: bool,
) -> LumeResult<String> {
    let parent = Path::new(&parent_path);
    let parent_metadata = std::fs::symlink_metadata(parent)?;
    if parent_metadata.file_type().is_symlink() || !parent_metadata.is_dir() {
        return Err(LumeError::InvalidPath("目标位置必须是普通目录".to_string()));
    }

    let name = name.trim();
    if name.is_empty()
        || matches!(name, "." | "..")
        || Path::new(name).components().count() != 1
        || name.contains(['/', '\\'])
    {
        return Err(LumeError::InvalidPath("名称不能包含路径分隔符".to_string()));
    }

    let path = parent.join(name);
    if path.exists() {
        return Err(LumeError::InvalidPath("同名文件或文件夹已存在".to_string()));
    }

    if is_directory {
        std::fs::create_dir(&path)?;
    } else {
        if !is_markdown_path(&path) {
            return Err(LumeError::InvalidPath(
                "新文件必须使用 .md 或 .markdown 扩展名".to_string(),
            ));
        }
        OpenOptions::new().write(true).create_new(true).open(&path)?;
    }

    Ok(path.to_string_lossy().into_owned())
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAsset {
    pub markdown_path: String,
    pub local_path: String,
}

fn validate_document_id(document_id: &str) -> LumeResult<()> {
    if document_id.is_empty()
        || !document_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
    {
        return Err(LumeError::InvalidPath("文档标识无效".to_string()));
    }
    Ok(())
}

fn normalize_image_extension(extension: &str) -> LumeResult<String> {
    let extension = extension.trim_start_matches('.').to_ascii_lowercase();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(LumeError::InvalidPath(format!(
            "不支持 .{extension} 图片，仅支持 PNG、JPEG、GIF、WebP、BMP、AVIF 和 SVG"
        )));
    }
    Ok(extension)
}

fn image_extension(path: &Path) -> LumeResult<String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| LumeError::InvalidPath("图片缺少有效扩展名".to_string()))?;
    normalize_image_extension(extension)
}

fn staging_dir(app: &AppHandle, document_id: &str) -> LumeResult<PathBuf> {
    validate_document_id(document_id)?;
    Ok(app
        .path()
        .app_cache_dir()?
        .join("image-staging")
        .join(document_id))
}

fn asset_dir(document_path: &Path) -> LumeResult<PathBuf> {
    let parent = document_path
        .parent()
        .ok_or_else(|| LumeError::InvalidPath("Markdown 文件缺少父目录".to_string()))?;
    let stem = document_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| LumeError::InvalidPath("Markdown 文件名无效".to_string()))?;
    Ok(parent.join(format!("{stem}.assets")))
}

fn safe_file_stem(name: &str) -> String {
    let stem = Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let sanitized: String = stem
        .chars()
        .map(|value| {
            if value.is_control()
                || matches!(value, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
            {
                '-'
            } else {
                value
            }
        })
        .collect();
    let sanitized = sanitized.trim_matches([' ', '.', '-']);
    if sanitized.is_empty() {
        "image".to_string()
    } else {
        sanitized.to_string()
    }
}

fn unique_image_path(directory: &Path, preferred_name: &str, extension: &str) -> PathBuf {
    let stem = safe_file_stem(preferred_name);
    for suffix in 0..10_000 {
        let name = if suffix == 0 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem}-{suffix}.{extension}")
        };
        let candidate = directory.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    directory.join(format!("{stem}-{timestamp}.{extension}"))
}

fn markdown_asset_path(document_path: &Path, image_path: &Path) -> LumeResult<String> {
    let directory_name = asset_dir(document_path)?
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| LumeError::InvalidPath("图片资源目录名无效".to_string()))?
        .to_string();
    let file_name = image_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| LumeError::InvalidPath("图片文件名无效".to_string()))?;
    Ok(format!("{directory_name}/{file_name}"))
}

fn store_image_bytes(
    app: &AppHandle,
    bytes: &[u8],
    extension: &str,
    preferred_name: &str,
    document_path: Option<&str>,
    document_id: &str,
) -> LumeResult<ImageAsset> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_IMAGE_FILE_SIZE {
        return Err(LumeError::InvalidPath("图片必须小于 20 MiB".to_string()));
    }
    let extension = normalize_image_extension(extension)?;
    let document_path = document_path.map(Path::new);
    let directory = match document_path {
        Some(path) => asset_dir(path)?,
        None => staging_dir(app, document_id)?,
    };
    std::fs::create_dir_all(&directory)?;

    let image_path = unique_image_path(&directory, preferred_name, &extension);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&image_path)?;
    std::io::Write::write_all(&mut file, bytes)?;

    let markdown_path = match document_path {
        Some(path) => markdown_asset_path(path, &image_path)?,
        None => format!(
            "{STAGED_IMAGE_SCHEME}{document_id}/{}",
            image_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("image")
        ),
    };

    Ok(ImageAsset {
        markdown_path,
        local_path: image_path.to_string_lossy().into_owned(),
    })
}

/// 将操作系统中拖入的图片复制到当前文档资源目录或未命名文档暂存区。
#[tauri::command]
pub fn lume_import_image_file(
    app: AppHandle,
    path: String,
    document_path: Option<String>,
    document_id: String,
) -> LumeResult<ImageAsset> {
    let source = Path::new(&path);
    let metadata = std::fs::symlink_metadata(source)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(LumeError::InvalidPath(
            "拖入路径必须是普通图片文件".to_string(),
        ));
    }
    if metadata.len() == 0 || metadata.len() > MAX_IMAGE_FILE_SIZE {
        return Err(LumeError::InvalidPath("图片必须小于 20 MiB".to_string()));
    }

    let extension = image_extension(source)?;
    let preferred_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let bytes = std::fs::read(source)?;
    store_image_bytes(
        &app,
        &bytes,
        &extension,
        preferred_name,
        document_path.as_deref(),
        &document_id,
    )
}

/// 将剪贴板图片保存到当前文档资源目录或未命名文档暂存区。
#[tauri::command]
pub fn lume_store_clipboard_image(
    app: AppHandle,
    bytes: Vec<u8>,
    extension: String,
    document_path: Option<String>,
    document_id: String,
) -> LumeResult<ImageAsset> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    store_image_bytes(
        &app,
        &bytes,
        &extension,
        &format!("image-{timestamp}"),
        document_path.as_deref(),
        &document_id,
    )
}

/// 首次保存未命名文档时，将暂存图片迁移并替换 Markdown 地址。
#[tauri::command]
pub fn lume_materialize_staged_images(
    app: AppHandle,
    content: String,
    document_path: String,
    document_id: String,
) -> LumeResult<String> {
    let staging = staging_dir(&app, &document_id)?;
    if !staging.exists() {
        return Ok(content);
    }

    let destination_dir = asset_dir(Path::new(&document_path))?;
    std::fs::create_dir_all(&destination_dir)?;
    let marker_prefix = format!("{STAGED_IMAGE_SCHEME}{document_id}/");
    let mut updated_content = content;

    for entry in std::fs::read_dir(&staging)? {
        let entry = entry?;
        let source = entry.path();
        let metadata = std::fs::symlink_metadata(&source)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            continue;
        }
        let file_name = match source.file_name().and_then(|value| value.to_str()) {
            Some(value) => value,
            None => continue,
        };
        let marker = format!("{marker_prefix}{file_name}");
        if !updated_content.contains(&marker) {
            continue;
        }

        let extension = image_extension(&source)?;
        let preferred_destination = destination_dir.join(file_name);
        let destination = if preferred_destination.is_file()
            && std::fs::read(&preferred_destination)? == std::fs::read(&source)?
        {
            preferred_destination
        } else {
            unique_image_path(&destination_dir, file_name, &extension)
        };
        if !destination.exists() {
            std::fs::copy(&source, &destination)?;
        }
        let markdown_path = markdown_asset_path(Path::new(&document_path), &destination)?;
        updated_content = updated_content.replace(&marker, &markdown_path);
    }
    Ok(updated_content)
}

/// Markdown 成功写盘后清理对应文档的图片暂存区。
#[tauri::command]
pub fn lume_clear_staged_images(app: AppHandle, document_id: String) -> LumeResult<()> {
    let staging = staging_dir(&app, &document_id)?;
    if staging.exists() {
        std::fs::remove_dir_all(staging)?;
    }
    Ok(())
}

fn percent_decode_path(value: &str) -> LumeResult<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let encoded = std::str::from_utf8(&bytes[index + 1..index + 3])
                .map_err(|_| LumeError::InvalidPath("图片地址编码无效".to_string()))?;
            let byte = u8::from_str_radix(encoded, 16)
                .map_err(|_| LumeError::InvalidPath("图片地址编码无效".to_string()))?;
            decoded.push(byte);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded)
        .map_err(|_| LumeError::InvalidPath("图片地址不是有效 UTF-8".to_string()))
}

/// 将 Markdown 中的相对图片地址解析为仅供 WebView 展示的本地绝对路径。
#[tauri::command]
pub fn lume_resolve_image_path(
    app: AppHandle,
    markdown_path: String,
    document_path: Option<String>,
    document_id: String,
) -> LumeResult<String> {
    let staged_prefix = format!("{STAGED_IMAGE_SCHEME}{document_id}/");
    let resolved = if let Some(file_name) = markdown_path.strip_prefix(&staged_prefix) {
        if Path::new(file_name)
            .file_name()
            .and_then(|value| value.to_str())
            != Some(file_name)
        {
            return Err(LumeError::InvalidPath("暂存图片地址无效".to_string()));
        }
        staging_dir(&app, &document_id)?.join(file_name)
    } else {
        let path_without_suffix = markdown_path
            .split(['?', '#'])
            .next()
            .unwrap_or(&markdown_path);
        let decoded = percent_decode_path(path_without_suffix)?;
        let candidate = PathBuf::from(decoded.trim_start_matches("file://"));
        if candidate.is_absolute() {
            candidate
        } else {
            let document_path = document_path
                .as_deref()
                .ok_or_else(|| LumeError::InvalidPath("未保存文档无法解析相对图片".to_string()))?;
            Path::new(document_path)
                .parent()
                .ok_or_else(|| LumeError::InvalidPath("Markdown 文件缺少父目录".to_string()))?
                .join(candidate)
        }
    };

    let metadata = std::fs::symlink_metadata(&resolved)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(LumeError::InvalidPath("图片地址不是普通文件".to_string()));
    }
    image_extension(&resolved)?;
    Ok(resolved.to_string_lossy().into_owned())
}

/// 在系统文件管理器中选中一个已存在的普通文件。
#[tauri::command]
pub fn lume_reveal_file(path: String) -> LumeResult<()> {
    let file_path = Path::new(&path);
    if !file_path.is_file() {
        return Err(LumeError::InvalidPath(
            "文件不存在或不是普通文件".to_string(),
        ));
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
