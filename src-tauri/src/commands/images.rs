use crate::{
    error::LumeResult,
    services::image_assets::{self, ImageAsset},
};
use tauri::AppHandle;

#[tauri::command]
pub fn lume_import_image_file(
    app: AppHandle,
    path: String,
    document_path: Option<String>,
    document_id: String,
) -> LumeResult<ImageAsset> {
    image_assets::import_image_file(&app, &path, document_path.as_deref(), &document_id)
}
#[tauri::command]
pub fn lume_store_clipboard_image(
    app: AppHandle,
    bytes: Vec<u8>,
    extension: String,
    document_path: Option<String>,
    document_id: String,
) -> LumeResult<ImageAsset> {
    image_assets::store_clipboard_image(
        &app,
        &bytes,
        &extension,
        document_path.as_deref(),
        &document_id,
    )
}
#[tauri::command]
pub fn lume_materialize_staged_images(
    app: AppHandle,
    content: String,
    document_path: String,
    document_id: String,
) -> LumeResult<String> {
    image_assets::materialize_staged_images(&app, content, &document_path, &document_id)
}
#[tauri::command]
pub fn lume_clear_staged_images(app: AppHandle, document_id: String) -> LumeResult<()> {
    image_assets::clear_staged_images(&app, &document_id)
}
#[tauri::command]
pub fn lume_resolve_image_path(
    app: AppHandle,
    markdown_path: String,
    document_path: Option<String>,
    document_id: String,
) -> LumeResult<String> {
    image_assets::resolve_image_path(&app, &markdown_path, document_path.as_deref(), &document_id)
}
