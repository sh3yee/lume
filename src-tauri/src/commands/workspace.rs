use crate::{
    error::LumeResult,
    services::workspace_scanner::{self, WorkspaceEntry},
};

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
