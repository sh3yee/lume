use super::{
    copy_new, image_extension, make_asset, required_uploader, resolve_image_path, staging_dir,
    target_directory, unique_path, upload_image_files, validate_image_file, ImageAsset,
    ImageInsertAction, ImagePathOptions,
};
use crate::error::{LumeError, LumeResult};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
use tauri::AppHandle;

fn resolve_staged_image(
    app: &AppHandle,
    source: &str,
    id: &str,
    staging: &Path,
) -> LumeResult<PathBuf> {
    let path = resolve_image_path(app, source, None, id, &ImagePathOptions::default())?;
    let path = std::fs::canonicalize(path)?;
    if path.parent() != Some(staging) {
        return Err(LumeError::InvalidPath(
            "图片不属于当前文档的暂存目录".to_string(),
        ));
    }
    Ok(path)
}

// Markdown 引用统一由前端解析；此处只迁移经过暂存目录校验的图片文件。
pub fn materialize_staged_images(
    app: &AppHandle,
    sources: &[String],
    document: &str,
    id: &str,
    options: &ImagePathOptions,
) -> LumeResult<Vec<ImageAsset>> {
    if sources.is_empty() {
        return Ok(Vec::new());
    }
    let staging = std::fs::canonicalize(staging_dir(app, id)?)?;
    let upload = matches!(options.insert_action, Some(ImageInsertAction::Upload));
    let destination_dir = if upload {
        None
    } else {
        let directory = target_directory(Some(document), options)?
            .ok_or_else(|| LumeError::InvalidPath("图片目标目录无效".to_string()))?;
        std::fs::create_dir_all(&directory)?;
        Some(directory)
    };
    let mut migrated: HashMap<PathBuf, ImageAsset> = HashMap::new();
    let mut assets = Vec::with_capacity(sources.len());
    for source in sources {
        let source = resolve_staged_image(app, source, id, &staging)?;
        if let Some(asset) = migrated.get(&source) {
            assets.push(asset.clone());
            continue;
        }
        validate_image_file(&source)?;
        let asset = if let Some(directory) = &destination_dir {
            let file_name = source
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| LumeError::InvalidPath("暂存图片文件名无效".to_string()))?;
            let preferred = directory.join(file_name);
            let reusable = preferred
                .symlink_metadata()
                .is_ok_and(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
                && std::fs::read(&preferred)? == std::fs::read(&source)?;
            let destination = if reusable {
                preferred
            } else {
                unique_path(directory, file_name, &image_extension(&source)?)
            };
            if !destination.exists() {
                copy_new(&source, &destination)?;
            }
            make_asset(&destination, Some(document), options)?
        } else {
            upload_image_files(
                app,
                &[source.to_string_lossy().into_owned()],
                Some(document),
                id,
                required_uploader(options)?,
                options,
            )?
            .into_iter()
            .next()
            .ok_or_else(|| LumeError::Generic("上传未返回图片地址".to_string()))?
        };
        migrated.insert(source, asset.clone());
        assets.push(asset);
    }
    Ok(assets)
}

pub fn clear_staged_images(app: &AppHandle, id: &str, sources: Option<&[String]>) -> LumeResult<()> {
    let staging = staging_dir(app, id)?;
    if !staging.exists() {
        return Ok(());
    }
    let sources = match sources {
        Some(sources) => sources,
        None => {
            std::fs::remove_dir_all(staging)?;
            return Ok(());
        }
    };
    let canonical_staging = std::fs::canonicalize(&staging)?;
    for source in sources {
        let image = match resolve_staged_image(app, source, id, &canonical_staging) {
            Ok(image) => image,
            Err(LumeError::NotFound(_)) => continue,
            Err(error) => return Err(error),
        };
        std::fs::remove_file(image)?;
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
