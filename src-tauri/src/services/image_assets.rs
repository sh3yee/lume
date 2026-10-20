use crate::error::{LumeError, LumeResult};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const MAX_IMAGE_FILE_SIZE: u64 = 20 * 1024 * 1024;
const MAX_COMMAND_OUTPUT: usize = 1024 * 1024;
const STAGED_IMAGE_SCHEME: &str = "lume-staged://";
const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg", "ico", "tif", "tiff",
];

#[derive(Debug, Serialize)]
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

#[derive(Clone, Copy)]
enum StagedImageSyntax {
    Markdown,
    Angle,
    Quoted(char),
}

struct StagedImageReference {
    start: usize,
    end: usize,
    filename: String,
    syntax: StagedImageSyntax,
}

impl StagedImageReference {
    fn replacement(&self, path: &str) -> String {
        match self.syntax {
            StagedImageSyntax::Quoted(quote) => path
                .replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;")
                .replace(quote, if quote == '"' { "&quot;" } else { "&#39;" }),
            StagedImageSyntax::Angle => path.replace('\\', "\\\\").replace('>', "\\>"),
            StagedImageSyntax::Markdown if path.chars().any(char::is_whitespace) => {
                format!("<{}>", path.replace('\\', "\\\\").replace('>', "\\>"))
            }
            StagedImageSyntax::Markdown => path
                .replace('\\', "\\\\")
                .replace('(', "\\(")
                .replace(')', "\\)"),
        }
    }
}

fn staged_image_references(content: &str, id: &str, staging: &Path) -> Vec<StagedImageReference> {
    // 按完整 Markdown / HTML 目标读取路径，避免转义字符和同名前缀误匹配。
    let native = staging.to_string_lossy();
    let absolute = format!("{}/", native.replace('\\', "/"));
    // 兼容旧版本的内部地址，新插入图片直接使用真实路径。
    let mut prefixes = vec![
        format!("{STAGED_IMAGE_SCHEME}{id}/"),
        absolute.clone(),
        escape_path(&absolute),
        format!("{native}{}", std::path::MAIN_SEPARATOR),
        format!("{native}{}", std::path::MAIN_SEPARATOR).replace('\\', "\\\\"),
    ];
    prefixes.sort();
    prefixes.dedup();
    let mut references = Vec::new();
    for prefix in prefixes {
        for (start, _) in content.match_indices(&prefix) {
            let preceding = content[..start].chars().next_back();
            let syntax = match preceding {
                Some('<') => StagedImageSyntax::Angle,
                Some(quote @ ('"' | '\'')) => StagedImageSyntax::Quoted(quote),
                _ => StagedImageSyntax::Markdown,
            };
            let delimiter = match syntax {
                StagedImageSyntax::Angle => Some('>'),
                StagedImageSyntax::Quoted(quote) => Some(quote),
                StagedImageSyntax::Markdown => None,
            };
            let filename_start = start + prefix.len();
            let tail = &content[filename_start..];
            let mut characters = tail.char_indices().peekable();
            let mut depth = 0;
            let mut end = tail.len();
            let mut filename = String::new();
            let mut terminated = delimiter.is_none();
            while let Some((offset, character)) = characters.next() {
                if matches!(character, '\r' | '\n') {
                    end = offset;
                    break;
                }
                if character == '\\' && !matches!(syntax, StagedImageSyntax::Quoted(_)) {
                    if let Some((_, escaped)) = characters.next() {
                        filename.push(escaped);
                        continue;
                    }
                }
                if delimiter == Some(character) {
                    end = offset;
                    terminated = true;
                    break;
                }
                if delimiter.is_none() {
                    let title = character.is_whitespace()
                        && tail[offset..].trim_start().starts_with(['"', '\'']);
                    if (character == ')' && depth == 0)
                        || matches!(character, '<' | '>')
                        || (depth == 0
                            && (title || (preceding == Some('=') && character.is_whitespace())))
                    {
                        end = offset;
                        break;
                    }
                    if character == '(' {
                        depth += 1;
                    }
                    if character == ')' {
                        depth -= 1;
                    }
                }
                filename.push(character);
            }
            if !terminated {
                continue;
            }
            end -= tail[..end].len() - tail[..end].trim_end().len();
            let filename = filename.trim_end().to_string();
            let filename = if matches!(syntax, StagedImageSyntax::Quoted(_)) {
                filename.replace("&amp;", "&").replace("&#39;", "'").replace("&quot;", "\"")
            } else {
                filename
            };
            let filename = if staging.join(&filename).is_file() {
                filename
            } else {
                percent_decode(&filename).unwrap_or(filename)
            };
            if filename.is_empty()
                || Path::new(&filename).file_name().and_then(|value| value.to_str())
                    != Some(filename.as_str())
            {
                continue;
            }
            references.push(StagedImageReference {
                start,
                end: filename_start + end,
                filename,
                syntax,
            });
        }
    }
    references
}

pub fn materialize_staged_images(
    app: &AppHandle,
    content: String,
    document: &str,
    id: &str,
    options: &ImagePathOptions,
) -> LumeResult<String> {
    let staging = staging_dir(app, id)?;
    if !staging.exists() {
        return Ok(content);
    }
    let destination_dir = target_directory(Some(document), options)?
        .ok_or_else(|| LumeError::InvalidPath("图片目标目录无效".to_string()))?;
    std::fs::create_dir_all(&destination_dir)?;
    let prefix = format!("{STAGED_IMAGE_SCHEME}{id}/");
    let references = staged_image_references(&content, id, &staging);
    let mut replacements = Vec::new();
    for entry in std::fs::read_dir(&staging)? {
        let source = entry?.path();
        let file_name = match source.file_name().and_then(|value| value.to_str()) {
            Some(file_name) => file_name,
            None => continue,
        };
        let matching: Vec<&StagedImageReference> = references
            .iter()
            .filter(|reference| reference.filename == file_name)
            .collect();
        if matching.is_empty() {
            continue;
        }
        validate_image_file(&source)?;
        let path = if matches!(options.insert_action, Some(ImageInsertAction::Upload)) {
            let asset = upload_image_files(
                app,
                &[format!("{prefix}{file_name}")],
                Some(document),
                id,
                required_uploader(options)?,
                options,
            )?.remove(0);
            asset.markdown_path
        } else {
            let preferred = destination_dir.join(file_name);
            let reusable = preferred.symlink_metadata()
                .is_ok_and(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
                && std::fs::read(&preferred)? == std::fs::read(&source)?;
            let destination = if reusable {
                preferred
            } else {
                unique_path(&destination_dir, file_name, &image_extension(&source)?)
            };
            if !destination.exists() {
                copy_new(&source, &destination)?;
            }
            markdown_path(&destination, Some(document), options)?
        };
        for reference in matching {
            replacements.push((reference.start, reference.end, reference.replacement(&path)));
        }
    }
    replacements.sort_by(|left, right| right.0.cmp(&left.0));
    let mut updated = content;
    for (start, end, replacement) in replacements {
        updated.replace_range(start..end, &replacement);
    }
    Ok(updated)
}

pub fn clear_staged_images(app: &AppHandle, id: &str, content: Option<&str>) -> LumeResult<()> {
    let staging = staging_dir(app, id)?;
    if !staging.exists() {
        return Ok(());
    }
    let content = match content {
        Some(content) => content,
        None => {
            std::fs::remove_dir_all(staging)?;
            return Ok(());
        }
    };
    let filenames: HashSet<String> = staged_image_references(content, id, &staging)
        .into_iter()
        .map(|reference| reference.filename)
        .collect();
    for filename in filenames {
        let image = staging.join(filename);
        match std::fs::symlink_metadata(&image) {
            Ok(metadata) if metadata.is_file() || metadata.file_type().is_symlink() => {
                std::fs::remove_file(image)?;
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    // 只清理保存快照中的图片；并发粘贴产生的新文件必须保留。
    match std::fs::remove_dir(&staging) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) if staging.read_dir().is_ok_and(|mut entries| entries.next().is_some()) => {}
        Err(error) => return Err(error.into()),
    }
    Ok(())
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
    let prefix = format!("{STAGED_IMAGE_SCHEME}{id}/");
    let resolved = if let Some(file) = markdown.strip_prefix(&prefix) {
        if Path::new(file).file_name().and_then(|value| value.to_str()) != Some(file) {
            return Err(LumeError::InvalidPath("暂存图片地址无效".to_string()));
        }
        staging_dir(app, id)?.join(file)
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
    let resolved = normalized_path(&resolved);
    validate_image_path(&resolved)?;
    Ok(resolved.to_string_lossy().into_owned())
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

fn download_image(url: &str, directory: &Path) -> LumeResult<PathBuf> {
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
