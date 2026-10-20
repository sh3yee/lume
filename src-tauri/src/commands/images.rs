use crate::{
    error::{LumeError, LumeResult},
    services::image_assets::{self, ImageAsset, ImagePathOptions, ImageTransferMode, ImageUploader},
};
use tauri::AppHandle;

#[tauri::command]
pub async fn lume_read_clipboard_image_paths() -> LumeResult<Vec<String>> {
    tauri::async_runtime::spawn_blocking(crate::services::clipboard_images::read_image_paths)
        .await
        .map_err(|error| LumeError::Generic(error.to_string()))
}

#[tauri::command]
pub async fn lume_import_image_file(
    app: AppHandle,
    path: String,
    document_path: Option<String>,
    document_id: String,
    options: Option<ImagePathOptions>,
) -> LumeResult<ImageAsset> {
    tauri::async_runtime::spawn_blocking(move || {
        image_assets::import_image_file(
            &app,
            &path,
            document_path.as_deref(),
            &document_id,
            &options.unwrap_or_default(),
        )
    })
    .await
    .map_err(|error| LumeError::Generic(error.to_string()))?
}

#[tauri::command]
pub async fn lume_store_clipboard_image(
    app: AppHandle,
    bytes: Vec<u8>,
    extension: String,
    document_path: Option<String>,
    document_id: String,
    options: Option<ImagePathOptions>,
) -> LumeResult<ImageAsset> {
    tauri::async_runtime::spawn_blocking(move || {
        image_assets::store_clipboard_image(
            &app,
            &bytes,
            &extension,
            document_path.as_deref(),
            &document_id,
            &options.unwrap_or_default(),
        )
    })
    .await
    .map_err(|error| LumeError::Generic(error.to_string()))?
}

#[tauri::command]
pub async fn lume_materialize_staged_images(
    app: AppHandle,
    sources: Vec<String>,
    document_path: String,
    document_id: String,
    options: Option<ImagePathOptions>,
) -> LumeResult<Vec<ImageAsset>> {
    tauri::async_runtime::spawn_blocking(move || {
        image_assets::materialize_staged_images(
            &app,
            &sources,
            &document_path,
            &document_id,
            &options.unwrap_or_default(),
        )
    })
    .await
    .map_err(|error| LumeError::Generic(error.to_string()))?
}

#[tauri::command]
pub fn lume_clear_staged_images(
    app: AppHandle,
    document_id: String,
    sources: Option<Vec<String>>,
) -> LumeResult<()> {
    image_assets::clear_staged_images(&app, &document_id, sources.as_deref())
}

#[tauri::command]
pub fn lume_resolve_image_path(
    app: AppHandle,
    markdown_path: String,
    document_path: Option<String>,
    document_id: String,
    options: Option<ImagePathOptions>,
) -> LumeResult<String> {
    image_assets::resolve_image_path(
        &app,
        &markdown_path,
        document_path.as_deref(),
        &document_id,
        &options.unwrap_or_default(),
    )
}

#[tauri::command]
pub fn lume_resolve_html_resource_path(
    app: AppHandle,
    markdown_path: String,
    document_path: Option<String>,
    document_id: String,
    options: Option<ImagePathOptions>,
) -> LumeResult<String> {
    image_assets::resolve_html_resource_path(
        &app,
        &markdown_path,
        document_path.as_deref(),
        &document_id,
        &options.unwrap_or_default(),
    )
}

#[tauri::command]
pub async fn lume_transfer_image(
    app: AppHandle,
    markdown_path: String,
    destination: String,
    mode: ImageTransferMode,
    document_path: Option<String>,
    document_id: String,
    options: Option<ImagePathOptions>,
) -> LumeResult<ImageAsset> {
    tauri::async_runtime::spawn_blocking(move || {
        image_assets::transfer_image(
            &app,
            &markdown_path,
            &destination,
            &mode,
            document_path.as_deref(),
            &document_id,
            &options.unwrap_or_default(),
        )
    })
    .await
    .map_err(|error| LumeError::Generic(error.to_string()))?
}

#[tauri::command]
pub fn lume_delete_image_file(
    app: AppHandle,
    markdown_path: String,
    document_path: Option<String>,
    document_id: String,
    options: Option<ImagePathOptions>,
) -> LumeResult<()> {
    image_assets::delete_image_file(
        &app,
        &markdown_path,
        document_path.as_deref(),
        &document_id,
        &options.unwrap_or_default(),
    )
}

#[tauri::command]
pub async fn lume_upload_image_files(
    app: AppHandle,
    markdown_paths: Vec<String>,
    document_path: Option<String>,
    document_id: String,
    uploader: ImageUploader,
    options: Option<ImagePathOptions>,
) -> LumeResult<Vec<ImageAsset>> {
    tauri::async_runtime::spawn_blocking(move || {
        image_assets::upload_image_files(
            &app,
            &markdown_paths,
            document_path.as_deref(),
            &document_id,
            &uploader,
            &options.unwrap_or_default(),
        )
    })
    .await
    .map_err(|error| LumeError::Generic(error.to_string()))?
}
