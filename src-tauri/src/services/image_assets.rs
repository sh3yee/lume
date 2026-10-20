mod processing;
mod staging;

pub use processing::upload_image_files;
pub use staging::{clear_staged_images, materialize_staged_images};
use processing::download_image;

use crate::error::{LumeError, LumeResult};
use serde::{Deserialize, Serialize};
use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const MAX_IMAGE_FILE_SIZE: u64 = 20 * 1024 * 1024;
const STAGED_IMAGE_SCHEME: &str = "lume-staged://";
const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg", "ico", "tif", "tiff",
];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAsset {
    pub markdown_path: String,
    pub local_path: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImageInsertAction {
    Original,
    Copy,
    Upload,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImageTransferMode {
    Copy,
    Move,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageUploader {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePathOptions {
    pub insert_action: Option<ImageInsertAction>,
    pub copy_to: Option<String>,
    pub root_url: Option<String>,
    pub prefer_relative: Option<bool>,
    pub ensure_dot_slash: Option<bool>,
    pub escape_path: Option<bool>,
    pub uploader: Option<ImageUploader>,
}

fn validate_document_id(id: &str) -> LumeResult<()> {
    if id.is_empty()
        || !id.chars().all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
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

fn validate_image_file(path: &Path) -> LumeResult<()> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > MAX_IMAGE_FILE_SIZE
    {
        return Err(LumeError::InvalidPath("图片必须是小于 20 MiB 的普通文件".to_string()));
    }
    image_extension(path)?;
    Ok(())
}

fn validate_image_path(path: &Path) -> LumeResult<()> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(LumeError::InvalidPath("图片地址不是普通文件".to_string()));
    }
    image_extension(path)?;
    Ok(())
}

fn staging_dir(app: &AppHandle, id: &str) -> LumeResult<PathBuf> {
    validate_document_id(id)?;
    Ok(app.path().app_cache_dir()?.join("image-staging").join(id))
}

fn document_directory(document: &str) -> LumeResult<&Path> {
    Path::new(document)
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| LumeError::InvalidPath("Markdown 文件缺少父目录".to_string()))
}

fn local_path(value: &str) -> LumeResult<PathBuf> {
    if value.get(..7).is_some_and(|prefix| prefix.eq_ignore_ascii_case("file://")) {
        return tauri::Url::parse(value)
            .ok()
            .and_then(|url| url.to_file_path().ok())
            .ok_or_else(|| LumeError::InvalidPath("本地图片 URL 无效".to_string()));
    }
    if value.contains("://") {
        return Err(LumeError::InvalidPath("此操作需要本地图片路径".to_string()));
    }
    Ok(PathBuf::from(value))
}

fn normalized_path(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir if result.file_name().is_some_and(|name| name != "..") => {
                result.pop();
            }
            Component::ParentDir if result.has_root() => {}
            _ => result.push(component.as_os_str()),
        }
    }
    result
}

fn target_directory(
    document: Option<&str>,
    options: &ImagePathOptions,
) -> LumeResult<Option<PathBuf>> {
    let stem = document
        .and_then(|value| Path::new(value).file_stem())
        .and_then(|value| value.to_str())
        .unwrap_or("untitled");
    let target = options.copy_to.as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.replace("${filename}", stem).replace("${filepath}", document.unwrap_or("")))
        .or_else(|| document.map(|_| format!("{stem}.assets")));
    let target = match target {
        Some(target) => target,
        None => return Ok(None),
    };
    let path = local_path(&target)?;
    if path.is_absolute() {
        return Ok(Some(normalized_path(&path)));
    }
    Ok(match document {
        Some(document) => Some(normalized_path(&document_directory(document)?.join(path))),
        None => None,
    })
}

fn safe_stem(name: &str) -> String {
    let stem = Path::new(name).file_stem().and_then(|value| value.to_str()).unwrap_or("image");
    let value: String = stem.chars().map(|value| {
        if value.is_control() || matches!(value, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
            '-'
        } else {
            value
        }
    }).collect();
    let value = value.trim_matches([' ', '.', '-']);
    if value.is_empty() { "image".to_string() } else { value.to_string() }
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
    directory.join(format!("{stem}-{}.{extension}", timestamp()))
}

fn timestamp() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos()
}

fn relative_path(base: &Path, target: &Path) -> Option<PathBuf> {
    let base = normalized_path(base);
    let target = normalized_path(target);
    let base: Vec<Component<'_>> = base.components().collect();
    let target: Vec<Component<'_>> = target.components().collect();
    if base.first() != target.first() {
        return None;
    }
    let shared = base.iter().zip(&target).take_while(|(left, right)| left == right).count();
    let mut relative = PathBuf::new();
    for _ in shared..base.len() {
        relative.push("..");
    }
    for part in &target[shared..] {
        relative.push(part.as_os_str());
    }
    Some(relative)
}

fn escape_path(value: &str) -> String {
    let mut escaped = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~' | b'/' | b':') {
            escaped.push(char::from(byte));
        } else {
            escaped.push_str(&format!("%{byte:02X}"));
        }
    }
    escaped
}

fn image_root(document: Option<&str>, options: &ImagePathOptions) -> LumeResult<Option<PathBuf>> {
    let root = match options.root_url.as_deref().filter(|value| !value.trim().is_empty()) {
        Some(root) => root,
        None => return Ok(None),
    };
    let root = local_path(root)?;
    if root.is_absolute() {
        return Ok(Some(normalized_path(&root)));
    }
    let document = document.ok_or_else(|| {
        LumeError::InvalidPath("请先保存文档，再使用相对图片根目录".to_string())
    })?;
    Ok(Some(normalized_path(&document_directory(document)?.join(root))))
}

fn markdown_path(
    image: &Path,
    document: Option<&str>,
    options: &ImagePathOptions,
) -> LumeResult<String> {
    let base = image_root(document, options)?.or_else(|| {
        document.and_then(|value| document_directory(value).ok().map(Path::to_path_buf))
    });
    let relative = if options.prefer_relative.unwrap_or(true) {
        base.as_deref().and_then(|base| relative_path(base, image))
    } else {
        None
    };
    let is_relative = relative.is_some();
    let mut value = relative.as_deref().unwrap_or(image).to_string_lossy().replace('\\', "/");
    if is_relative
        && options.ensure_dot_slash.unwrap_or(false)
        && !value.starts_with("./")
        && !value.starts_with("../")
    {
        value.insert_str(0, "./");
    }
    if !is_relative && value.starts_with("//") {
        return tauri::Url::from_file_path(image)
            .map(|url| url.to_string())
            .map_err(|_| LumeError::InvalidPath("网络图片路径无效".to_string()));
    }
    if options.escape_path.unwrap_or(false) {
        value = escape_path(&value);
    }
    Ok(value)
}

fn make_asset(
    image: &Path,
    document: Option<&str>,
    options: &ImagePathOptions,
) -> LumeResult<ImageAsset> {
    Ok(ImageAsset {
        markdown_path: markdown_path(image, document, options)?,
        local_path: image.to_string_lossy().into_owned(),
    })
}

fn store(
    app: &AppHandle,
    bytes: &[u8],
    extension: &str,
    name: &str,
    document: Option<&str>,
    id: &str,
    options: &ImagePathOptions,
) -> LumeResult<ImageAsset> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_IMAGE_FILE_SIZE {
        return Err(LumeError::InvalidPath("图片必须小于 20 MiB".to_string()));
    }
    let extension = normalize_extension(extension)?;
    let target = target_directory(document, options)?;
    let is_staged = target.is_none();
    let directory = match target {
        Some(directory) => directory,
        None => staging_dir(app, id)?,
    };
    std::fs::create_dir_all(&directory)?;
    let image = unique_path(&directory, name, &extension);
    let asset = if !is_staged {
        make_asset(&image, document, options)?
    } else {
        ImageAsset {
            markdown_path: {
                let path = image.to_string_lossy().replace('\\', "/");
                if options.escape_path.unwrap_or(false) {
                    escape_path(&path)
                } else {
                    path
                }
            },
            local_path: image.to_string_lossy().into_owned(),
        }
    };
    let mut output = OpenOptions::new().write(true).create_new(true).open(&image)?;
    if let Err(error) = output.write_all(bytes) {
        drop(output);
        let _ = std::fs::remove_file(image);
        return Err(error.into());
    }
    Ok(asset)
}

pub fn import_image_file(
    app: &AppHandle,
    path: &str,
    document: Option<&str>,
    id: &str,
    options: &ImagePathOptions,
) -> LumeResult<ImageAsset> {
    let candidate = local_path(path)?;
    let source = if candidate.is_absolute() && candidate.is_file() {
        normalized_path(&candidate)
    } else {
        PathBuf::from(resolve_image_path(app, path, document, id, options)?)
    };
    validate_image_file(&source)?;
    match options.insert_action.as_ref().unwrap_or(&ImageInsertAction::Original) {
        ImageInsertAction::Original => make_asset(&source, document, options),
        ImageInsertAction::Upload => upload_image_files(
            app,
            &[source.to_string_lossy().into_owned()],
            document,
            id,
            required_uploader(options)?,
            options,
        )?
        .into_iter()
        .next()
        .ok_or_else(|| LumeError::Generic("上传未返回图片地址".to_string())),
        ImageInsertAction::Copy => {
            if let Some(directory) = target_directory(document, options)? {
                if source.parent().is_some_and(|parent| normalized_path(parent) == directory) {
                    return make_asset(&source, document, options);
                }
            }
            store(
                app,
                &std::fs::read(&source)?,
                &image_extension(&source)?,
                source.file_name().and_then(|value| value.to_str()).unwrap_or("image"),
                document,
                id,
                options,
            )
        }
    }
}

pub fn store_clipboard_image(
    app: &AppHandle,
    bytes: &[u8],
    extension: &str,
    document: Option<&str>,
    id: &str,
    options: &ImagePathOptions,
) -> LumeResult<ImageAsset> {
    let upload = matches!(options.insert_action, Some(ImageInsertAction::Upload));
    if upload {
        required_uploader(options)?;
    }
    let staged_options = ImagePathOptions::default();
    let asset = store(
        app,
        bytes,
        extension,
        &format!("image-{}", timestamp()),
        if upload { None } else { document },
        id,
        if upload { &staged_options } else { options },
    )?;
    if !upload {
        return Ok(asset);
    }
    let uploaded = upload_image_files(
        app,
        &[asset.markdown_path],
        document,
        id,
        required_uploader(options)?,
        options,
    );
    let _ = std::fs::remove_file(&asset.local_path);
    uploaded?
        .into_iter()
        .next()
        .ok_or_else(|| LumeError::Generic("上传未返回图片地址".to_string()))
}

fn percent_decode(value: &str) -> LumeResult<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if bytes[index + 1] == b'u' && index + 5 < bytes.len() {
                let mut units = Vec::new();
                while index + 5 < bytes.len() && bytes[index] == b'%' && bytes[index + 1] == b'u' {
                    let hex = std::str::from_utf8(&bytes[index + 2..index + 6])
                        .map_err(|_| LumeError::InvalidPath("图片地址编码无效".to_string()))?;
                    units.push(u16::from_str_radix(hex, 16)
                        .map_err(|_| LumeError::InvalidPath("图片地址编码无效".to_string()))?);
                    index += 6;
                }
                decoded.extend(String::from_utf16(&units)
                    .map_err(|_| LumeError::InvalidPath("图片地址编码无效".to_string()))?
                    .bytes());
                continue;
            }
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                .map_err(|_| LumeError::InvalidPath("图片地址编码无效".to_string()))?;
            decoded.push(u8::from_str_radix(hex, 16)
                .map_err(|_| LumeError::InvalidPath("图片地址编码无效".to_string()))?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).map_err(|_| LumeError::InvalidPath("图片地址不是有效 UTF-8".to_string()))
}

pub fn resolve_image_path(
    app: &AppHandle,
    markdown: &str,
    document: Option<&str>,
    id: &str,
    options: &ImagePathOptions,
) -> LumeResult<String> {
    let resolved = resolve_resource_path(app, markdown, document, id, options)?;
    validate_image_path(&resolved)?;
    Ok(resolved.to_string_lossy().into_owned())
}

pub fn resolve_html_resource_path(
    app: &AppHandle,
    markdown: &str,
    document: Option<&str>,
    id: &str,
    options: &ImagePathOptions,
) -> LumeResult<String> {
    let resolved = resolve_resource_path(app, markdown, document, id, options)?;
    let metadata = std::fs::symlink_metadata(&resolved)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(LumeError::InvalidPath("HTML 资源地址不是普通文件".to_string()));
    }
    let extension = resolved
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let media_extensions = [
        "mp4", "webm", "ogg", "ogv", "mov", "m4v", "mp3", "wav", "oga", "opus", "flac", "aac",
        "m4a", "vtt",
    ];
    if !IMAGE_EXTENSIONS.contains(&extension.as_str())
        && !media_extensions.contains(&extension.as_str())
    {
        return Err(LumeError::InvalidPath("不支持的 HTML 资源格式".to_string()));
    }
    Ok(resolved.to_string_lossy().into_owned())
}

fn resolve_resource_path(
    app: &AppHandle,
    markdown: &str,
    document: Option<&str>,
    id: &str,
    options: &ImagePathOptions,
) -> LumeResult<PathBuf> {
    let prefix = format!("{STAGED_IMAGE_SCHEME}{id}/");
    let resolved = if let Some(file) = markdown.strip_prefix(&prefix) {
        let staging = staging_dir(app, id)?;
        let file = if staging.join(file).is_file() {
            file.to_string()
        } else {
            percent_decode(file)?
        };
        if Path::new(&file).file_name().and_then(|value| value.to_str()) != Some(file.as_str()) {
            return Err(LumeError::InvalidPath("暂存图片地址无效".to_string()));
        }
        staging.join(file)
    } else if markdown.get(..7).is_some_and(|prefix| prefix.eq_ignore_ascii_case("file://")) {
        local_path(markdown)?
    } else {
        let root = image_root(document, options)?;
        let resolve = |value: &str| -> LumeResult<PathBuf> {
            let candidate = PathBuf::from(value);
            let is_root_relative = value.starts_with('/') && !value.starts_with("//");
            if let Some(root) = root.as_ref().filter(|_| is_root_relative || !candidate.is_absolute()) {
                return Ok(root.join(value.trim_start_matches('/')));
            }
            if candidate.is_absolute() {
                return Ok(candidate);
            }
            let document = document.ok_or_else(|| {
                LumeError::InvalidPath("未保存文档无法解析相对图片".to_string())
            })?;
            Ok(document_directory(document)?.join(candidate))
        };
        let literal = resolve(markdown)?;
        if literal.is_file() {
            literal
        } else {
            resolve(&percent_decode(markdown.split(['?', '#']).next().unwrap_or(markdown))?)?
        }
    };
    Ok(normalized_path(&resolved))
}

fn copy_new(source: &Path, destination: &Path) -> LumeResult<()> {
    let mut input = File::open(source)?;
    let mut output = OpenOptions::new().write(true).create_new(true).open(destination)?;
    let result = std::io::copy(&mut input, &mut output);
    if let Err(error) = result {
        drop(output);
        let _ = std::fs::remove_file(destination);
        return Err(error.into());
    }
    Ok(())
}

fn is_remote(value: &str) -> bool {
    value.starts_with("//")
        || value.get(..7).is_some_and(|prefix| prefix.eq_ignore_ascii_case("http://"))
        || value.get(..8).is_some_and(|prefix| prefix.eq_ignore_ascii_case("https://"))
}

pub fn transfer_image(
    app: &AppHandle,
    markdown: &str,
    destination: &str,
    mode: &ImageTransferMode,
    document: Option<&str>,
    id: &str,
    options: &ImagePathOptions,
) -> LumeResult<ImageAsset> {
    if destination.trim().is_empty() {
        return Err(LumeError::InvalidPath("请选择图片目标路径".to_string()));
    }
    let filename = document
        .and_then(|value| Path::new(value).file_stem())
        .and_then(|value| value.to_str())
        .unwrap_or("untitled");
    let expanded = destination
        .replace("${filename}", filename)
        .replace("${filepath}", document.unwrap_or(""));
    let destination_path = local_path(&expanded)?;
    let destination_path = normalized_path(&if destination_path.is_absolute() {
        destination_path
    } else {
        let document = document.ok_or_else(|| {
            LumeError::InvalidPath("请先保存文档，或使用绝对目标路径".to_string())
        })?;
        document_directory(document)?.join(destination_path)
    });
    let is_directory = destination.ends_with(['/', '\\']) || destination_path.is_dir();
    let remote = is_remote(markdown);
    let source = if remote {
        download_image(markdown, &staging_dir(app, id)?)?
    } else {
        PathBuf::from(resolve_image_path(app, markdown, document, id, options)?)
    };
    let result = (|| {
        let target = if is_directory {
            std::fs::create_dir_all(&destination_path)?;
            if source.parent() == Some(destination_path.as_path()) {
                return make_asset(&source, document, options);
            }
            unique_path(
                &destination_path,
                source.file_name().and_then(|value| value.to_str()).unwrap_or("image"),
                &image_extension(&source)?,
            )
        } else {
            image_extension(&destination_path)?;
            destination_path
        };
        if source == target {
            return make_asset(&source, document, options);
        }
        if target.exists() && std::fs::canonicalize(&source)? == std::fs::canonicalize(&target)? {
            if matches!(mode, ImageTransferMode::Move) {
                std::fs::rename(&source, &target)?;
            }
            return make_asset(&target, document, options);
        }
        let asset = make_asset(&target, document, options)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        copy_new(&source, &target)?;
        if matches!(mode, ImageTransferMode::Move) && !remote {
            if let Err(error) = std::fs::remove_file(&source) {
                let _ = std::fs::remove_file(&target);
                return Err(error.into());
            }
        }
        Ok(asset)
    })();
    if remote && result.as_ref().map_or(true, |asset| Path::new(&asset.local_path) != source) {
        let _ = std::fs::remove_file(source);
    }
    result
}

pub fn delete_image_file(
    app: &AppHandle,
    markdown: &str,
    document: Option<&str>,
    id: &str,
    options: &ImagePathOptions,
) -> LumeResult<()> {
    if is_remote(markdown) {
        return Err(LumeError::InvalidPath("远程图片不能从本地删除原文件".to_string()));
    }
    let source = resolve_image_path(app, markdown, document, id, options)?;
    std::fs::remove_file(source)?;
    Ok(())
}

fn required_uploader(options: &ImagePathOptions) -> LumeResult<&ImageUploader> {
    options.uploader.as_ref()
        .ok_or_else(|| LumeError::Generic("请先在图片设置中配置上传程序".to_string()))
}
