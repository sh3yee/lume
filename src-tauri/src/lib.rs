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
    git::{GitState, lume_git_status, lume_git_init, lume_git_stage, lume_git_diff,
        lume_git_author, lume_git_index_tree, lume_git_commit, lume_git_history,
        lume_git_history_files, lume_git_history_diff, lume_git_file_version,
        lume_git_restore_preview, lume_git_restore, lume_git_remote_status,
        lume_git_push, lume_git_auto_push, lume_git_fetch, lume_git_switch_branch, lume_git_clone,
        lume_git_update, lume_git_merge_paths, lume_git_conflict, lume_git_resolve, lume_git_finish_merge,
        lume_git_auth_reply, lume_git_cancel_remote},
    images::{
        lume_clear_staged_images, lume_delete_image_file, lume_import_image_file,
        lume_materialize_staged_images, lume_read_clipboard_image_paths,
        lume_resolve_html_resource_path, lume_resolve_image_path,
        lume_store_clipboard_image, lume_transfer_image, lume_upload_image_files,
    },
    system::{
        lume_health_check, lume_list_system_fonts, lume_open_web_url, lume_reveal_file,
        lume_startup_file_paths,
    },
    updates::{lume_check_for_update, lume_download_update, lume_install_update, AppUpdateState},
    workspace::{
        lume_create_workspace_entry, lume_delete_workspace_entry, lume_move_workspace_entry,
        lume_read_workspace, lume_rename_workspace_entry, lume_start_workspace_watcher,
        lume_stop_workspace_watcher,
    },
};
use services::workspace_watcher::WorkspaceWatcherState;

pub fn run_git_askpass() -> Option<i32> {
    services::git::askpass::run_helper()
}

/// 创建并配置 Tauri 应用实例
///
/// 将插件注册和命令绑定集中管理，保持入口清晰。
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            services::git::askpass::initialize(app.handle().clone());
            Ok(())
        })
        .manage(WorkspaceWatcherState::default())
        .manage(GitState::default())
        .manage(AppUpdateState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            lume_git_status,
            lume_git_init,
            lume_git_switch_branch,
            lume_git_stage,
            lume_git_diff,
            lume_git_author,
            lume_git_index_tree,
            lume_git_commit,
            lume_git_remote_status,
            lume_git_push,
            lume_git_auto_push,
            lume_git_fetch,
            lume_git_clone,
            lume_git_auth_reply,
            lume_git_cancel_remote,
            lume_git_update,
            lume_git_merge_paths,
            lume_git_conflict,
            lume_git_resolve,
            lume_git_finish_merge,
            lume_git_history,
            lume_git_history_files,
            lume_git_history_diff,
            lume_git_file_version,
            lume_git_restore_preview,
            lume_git_restore,
            lume_clear_staged_images,
            lume_delete_image_file,
            lume_create_workspace_entry,
            lume_delete_workspace_entry,
            lume_health_check,
            lume_check_for_update,
            lume_download_update,
            lume_install_update,
            lume_list_system_fonts,
            lume_open_web_url,
            lume_import_image_file,
            lume_materialize_staged_images,
            lume_read_markdown_file,
            lume_read_clipboard_image_paths,
            lume_read_workspace,
            lume_move_workspace_entry,
            lume_rename_workspace_entry,
            lume_resolve_image_path,
            lume_resolve_html_resource_path,
            lume_startup_file_paths,
            lume_store_clipboard_image,
            lume_transfer_image,
            lume_upload_image_files,
            lume_start_workspace_watcher,
            lume_stop_workspace_watcher,
            lume_reveal_file
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用时发生错误");
}
