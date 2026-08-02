//! Lume 桌面应用 Rust 后端入口
//!
//! 负责初始化 Tauri 应用、注册命令和插件。
//! 模块组织：
//! - `error`: 统一错误处理
//! - `commands`: 按领域拆分的轻量命令入口
//! - `services`: 图片资源与工作区扫描服务

mod commands;
mod error;
mod services;

use commands::{
    files::lume_read_markdown_file,
    images::{
        lume_clear_staged_images, lume_import_image_file, lume_materialize_staged_images,
        lume_resolve_image_path, lume_store_clipboard_image,
    },
    system::{lume_health_check, lume_reveal_file, lume_startup_file_paths},
    workspace::{
        lume_create_workspace_entry, lume_delete_workspace_entry, lume_move_workspace_entry,
        lume_read_workspace, lume_rename_workspace_entry, lume_start_workspace_watcher,
        lume_stop_workspace_watcher,
    },
};
use services::workspace_watcher::WorkspaceWatcherState;

/// 创建并配置 Tauri 应用实例
///
/// 将插件注册和命令绑定集中管理，保持入口清晰。
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceWatcherState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            lume_clear_staged_images,
            lume_create_workspace_entry,
            lume_delete_workspace_entry,
            lume_health_check,
            lume_import_image_file,
            lume_materialize_staged_images,
            lume_read_markdown_file,
            lume_read_workspace,
            lume_move_workspace_entry,
            lume_rename_workspace_entry,
            lume_resolve_image_path,
            lume_startup_file_paths,
            lume_store_clipboard_image,
            lume_start_workspace_watcher,
            lume_stop_workspace_watcher,
            lume_reveal_file
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用时发生错误");
}
