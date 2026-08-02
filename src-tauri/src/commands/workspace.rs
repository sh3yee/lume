use crate::{
    error::LumeResult,
    services::{
        workspace_scanner::{self, WorkspaceEntry},
        workspace_watcher::{self, WorkspaceWatcherState},
    },
};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn lume_read_workspace(path: String) -> LumeResult<Vec<WorkspaceEntry>> {
    workspace_scanner::read_workspace(&path)
}

#[tauri::command]
pub fn lume_create_workspace_entry(
    parent_path: String,
    name: String,
    is_directory: bool,
) -> LumeResult<String> {
    workspace_scanner::create_workspace_entry(&parent_path, &name, is_directory)
}

#[tauri::command]
pub fn lume_rename_workspace_entry(
    workspace_path: String,
    path: String,
    new_name: String,
) -> LumeResult<String> {
    workspace_scanner::rename_workspace_entry(&workspace_path, &path, &new_name)
}

#[tauri::command]
pub fn lume_move_workspace_entry(
    workspace_path: String,
    path: String,
    target_directory: String,
) -> LumeResult<String> {
    workspace_scanner::move_workspace_entry(&workspace_path, &path, &target_directory)
}

#[tauri::command]
pub fn lume_delete_workspace_entry(workspace_path: String, path: String) -> LumeResult<()> {
    workspace_scanner::delete_workspace_entry(&workspace_path, &path)
}

#[tauri::command]
pub fn lume_start_workspace_watcher(
    app: AppHandle,
    state: State<'_, WorkspaceWatcherState>,
    workspace_path: String,
) -> LumeResult<()> {
    workspace_watcher::start_workspace_watcher(app, state.inner().clone(), workspace_path)
}

#[tauri::command]
pub fn lume_stop_workspace_watcher(
    state: State<'_, WorkspaceWatcherState>,
) -> LumeResult<()> {
    workspace_watcher::stop_workspace_watcher(state.inner())
}
