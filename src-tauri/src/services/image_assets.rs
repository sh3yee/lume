use crate::error::{LumeError, LumeResult};
use serde::Serialize;
use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const MAX_IMAGE_FILE_SIZE: u64 = 20 * 1024 * 1024;
const STAGED_IMAGE_SCHEME: &str = "lume-staged://";
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAsset {
    pub markdown_path: String,
    pub local_path: String,
}

fn validate_document_id(id: &str) -> LumeResult<()> {
    if id.is_empty()
        || !id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
    {
        return Err(LumeError::InvalidPath("文档标识无效".to_string()));
    }
    Ok(())
}
fn normalize_extension(value: &str) -> LumeResult<String> {
    let extension = value.trim_start_matches('.').to_ascii_lowercase();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(LumeError::InvalidPath(format!("不支持 .{extension} 图片")));
    }
    Ok(extension)
}
fn image_extension(path: &Path) -> LumeResult<String> {
    normalize_extension(
        path.extension()
            .and_then(|value| value.to_str())
            .ok_or_else(|| LumeError::InvalidPath("图片缺少有效扩展名".to_string()))?,
    )
}
fn staging_dir(app: &AppHandle, id: &str) -> LumeResult<PathBuf> {
    validate_document_id(id)?;
    Ok(app.path().app_cache_dir()?.join("image-staging").join(id))
}
fn asset_dir(document: &Path) -> LumeResult<PathBuf> {
    let parent = document
        .parent()
        .ok_or_else(|| LumeError::InvalidPath("Markdown 文件缺少父目录".to_string()))?;
    let stem = document
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| LumeError::InvalidPath("Markdown 文件名无效".to_string()))?;
    Ok(parent.join(format!("{stem}.assets")))
}
fn safe_stem(name: &str) -> String {
    let stem = Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let value: String = stem
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
    let value = value.trim_matches([' ', '.', '-']);
    if value.is_empty() {
        "image".to_string()
    } else {
        value.to_string()
    }
}
fn unique_path(directory: &Path, name: &str, extension: &str) -> PathBuf {
    let stem = safe_stem(name);
    for suffix in 0..10_000 {
        let candidate = directory.join(if suffix == 0 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem}-{suffix}.{extension}")
        });
        if !candidate.exists() {
            return candidate;
        }
    }
    directory.join(format!(
        "{stem}-{}.{extension}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    ))
}
fn markdown_asset_path(document: &Path, image: &Path) -> LumeResult<String> {
    let directory = asset_dir(document)?
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| LumeError::InvalidPath("图片资源目录名无效".to_string()))?
        .to_string();
    let file = image
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| LumeError::InvalidPath("图片文件名无效".to_string()))?;
    Ok(format!("{directory}/{file}"))
}
fn store(
    app: &AppHandle,
    bytes: &[u8],
    extension: &str,
    name: &str,
    document: Option<&str>,
    id: &str,
) -> LumeResult<ImageAsset> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_IMAGE_FILE_SIZE {
        return Err(LumeError::InvalidPath("图片必须小于 20 MiB".to_string()));
    }
    let extension = normalize_extension(extension)?;
    let document = document.map(Path::new);
    let directory = match document {
        Some(path) => asset_dir(path)?,
        None => staging_dir(app, id)?,
    };
    std::fs::create_dir_all(&directory)?;
    let image = unique_path(&directory, name, &extension);
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&image)?
        .write_all(bytes)?;
    let markdown_path = match document {
        Some(path) => markdown_asset_path(path, &image)?,
        None => format!(
            "{STAGED_IMAGE_SCHEME}{id}/{}",
            image
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("image")
        ),
    };
    Ok(ImageAsset {
        markdown_path,
        local_path: image.to_string_lossy().into_owned(),
    })
}

pub fn import_image_file(
    app: &AppHandle,
    path: &str,
    document: Option<&str>,
    id: &str,
) -> LumeResult<ImageAsset> {
    let source = Path::new(path);
    let metadata = std::fs::symlink_metadata(source)?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > MAX_IMAGE_FILE_SIZE
    {
        return Err(LumeError::InvalidPath(
            "拖入路径必须是小于 20 MiB 的普通图片文件".to_string(),
        ));
    }
    store(
        app,
        &std::fs::read(source)?,
        &image_extension(source)?,
        source
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("image"),
        document,
        id,
    )
}
pub fn store_clipboard_image(
    app: &AppHandle,
    bytes: &[u8],
    extension: &str,
    document: Option<&str>,
    id: &str,
) -> LumeResult<ImageAsset> {
    store(
        app,
        bytes,
        extension,
        &format!(
            "image-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ),
        document,
        id,
    )
}
pub fn materialize_staged_images(
    app: &AppHandle,
    content: String,
    document: &str,
    id: &str,
) -> LumeResult<String> {
    let staging = staging_dir(app, id)?;
    if !staging.exists() {
        return Ok(content);
    }
    let document_path = Path::new(document);
    let destination_dir = asset_dir(document_path)?;
    std::fs::create_dir_all(&destination_dir)?;
    let prefix = format!("{STAGED_IMAGE_SCHEME}{id}/");
    let mut updated = content;
    for entry in std::fs::read_dir(&staging)? {
        let source = entry?.path();
        let metadata = std::fs::symlink_metadata(&source)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            continue;
        }
        let Some(file_name) = source.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let marker = format!("{prefix}{file_name}");
        if !updated.contains(&marker) {
            continue;
        }
        let extension = image_extension(&source)?;
        let preferred = destination_dir.join(file_name);
        let destination =
            if preferred.is_file() && std::fs::read(&preferred)? == std::fs::read(&source)? {
                preferred
            } else {
                unique_path(&destination_dir, file_name, &extension)
            };
        if !destination.exists() {
            std::fs::copy(&source, &destination)?;
        }
        updated = updated.replace(&marker, &markdown_asset_path(document_path, &destination)?);
    }
    Ok(updated)
}
pub fn clear_staged_images(app: &AppHandle, id: &str) -> LumeResult<()> {
    let staging = staging_dir(app, id)?;
    if staging.exists() {
        std::fs::remove_dir_all(staging)?;
    }
    Ok(())
}
fn percent_decode(value: &str) -> LumeResult<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let encoded = std::str::from_utf8(&bytes[index + 1..index + 3])
                .map_err(|_| LumeError::InvalidPath("图片地址编码无效".to_string()))?;
            decoded.push(
                u8::from_str_radix(encoded, 16)
                    .map_err(|_| LumeError::InvalidPath("图片地址编码无效".to_string()))?,
            );
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded)
        .map_err(|_| LumeError::InvalidPath("图片地址不是有效 UTF-8".to_string()))
}
pub fn resolve_image_path(
    app: &AppHandle,
    markdown: &str,
    document: Option<&str>,
    id: &str,
) -> LumeResult<String> {
    let prefix = format!("{STAGED_IMAGE_SCHEME}{id}/");
    let resolved =
        if let Some(file) = markdown.strip_prefix(&prefix) {
            if Path::new(file).file_name().and_then(|value| value.to_str()) != Some(file) {
                return Err(LumeError::InvalidPath("暂存图片地址无效".to_string()));
            }
            staging_dir(app, id)?.join(file)
        } else {
            let decoded = percent_decode(markdown.split(['?', '#']).next().unwrap_or(markdown))?;
            let candidate = PathBuf::from(decoded.trim_start_matches("file://"));
            if candidate.is_absolute() {
                candidate
            } else {
                Path::new(document.ok_or_else(|| {
                    LumeError::InvalidPath("未保存文档无法解析相对图片".to_string())
                })?)
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
