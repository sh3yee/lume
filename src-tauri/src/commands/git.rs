use crate::{error::{LumeError, LumeResult}, services::git::{actions, history, remote, repository}};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::State;

#[derive(Clone, Default)]
pub struct GitState(Arc<Mutex<()>>);

async fn execute<T: Serialize + Send + 'static>(state: &GitState, task: impl FnOnce() -> LumeResult<T> + Send + 'static) -> LumeResult<T> {
    let lock = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| LumeError::Generic("Git 操作状态不可用".to_owned()))?;
        task()
    }).await.map_err(|failure| LumeError::Generic(failure.to_string()))?
}

#[tauri::command]
pub async fn lume_git_status(state: State<'_, GitState>, workspace: String) -> LumeResult<repository::GitStatus> {
    execute(&state, move || repository::status(&workspace)).await
}

#[tauri::command]
pub async fn lume_git_init(state: State<'_, GitState>, workspace: String) -> LumeResult<repository::GitStatus> {
    execute(&state, move || actions::initialize(&workspace)).await
}

#[tauri::command]
pub async fn lume_git_stage(state: State<'_, GitState>, workspace: String, path: String, staged: bool) -> LumeResult<repository::GitStatus> {
    execute(&state, move || actions::stage(&workspace, &path, staged)).await
}

#[tauri::command]
pub async fn lume_git_diff(state: State<'_, GitState>, workspace: String, path: String, staged: bool) -> LumeResult<String> {
    execute(&state, move || actions::working_diff(&workspace, &path, staged)).await
}

#[tauri::command]
pub async fn lume_git_author(state: State<'_, GitState>, workspace: String, name: String, email: String) -> LumeResult<repository::GitStatus> {
    execute(&state, move || actions::configure_author(&workspace, &name, &email)).await
}

#[tauri::command]
pub async fn lume_git_index_tree(state: State<'_, GitState>, workspace: String) -> LumeResult<String> {
    execute(&state, move || actions::index_tree(&workspace)).await
}

#[tauri::command]
pub async fn lume_git_commit(state: State<'_, GitState>, workspace: String, message: String, expected_tree: String) -> LumeResult<repository::GitStatus> {
    execute(&state, move || actions::commit(&workspace, &message, &expected_tree)).await
}

#[tauri::command]
pub async fn lume_git_remote_status(
    state: State<'_, GitState>,
    workspace: String,
    branch: String,
) -> LumeResult<remote::GitRemoteStatus> {
    execute(&state, move || remote::status(&workspace, &branch)).await
}

#[tauri::command]
pub async fn lume_git_push(
    state: State<'_, GitState>,
    workspace: String,
    branch: String,
    head: String,
    target: remote::GitPushTarget,
) -> LumeResult<()> {
    execute(&state, move || remote::push(&workspace, &branch, &head, target)).await
}

#[tauri::command]
pub async fn lume_git_fetch(
    state: State<'_, GitState>,
    workspace: String,
    branch: String,
    target: remote::GitPushTarget,
) -> LumeResult<()> {
    execute(&state, move || remote::fetch(&workspace, &branch, target)).await
}

#[tauri::command]
pub async fn lume_git_history(state: State<'_, GitState>, workspace: String, skip: u32, path: Option<String>) -> LumeResult<history::GitHistory> {
    execute(&state, move || history::history(&workspace, skip, path.as_deref())).await
}

#[tauri::command]
pub async fn lume_git_history_files(state: State<'_, GitState>, workspace: String, revision: String) -> LumeResult<Vec<history::GitHistoryFile>> {
    execute(&state, move || history::history_files(&workspace, &revision)).await
}

#[tauri::command]
pub async fn lume_git_history_diff(state: State<'_, GitState>, workspace: String, revision: String, path: String) -> LumeResult<String> {
    execute(&state, move || history::history_diff(&workspace, &revision, &path)).await
}

#[tauri::command]
pub async fn lume_git_file_version(state: State<'_, GitState>, workspace: String, revision: String, path: String) -> LumeResult<history::GitFileVersion> {
    execute(&state, move || history::file_version(&workspace, &revision, &path)).await
}

#[tauri::command]
pub async fn lume_git_restore_preview(state: State<'_, GitState>, workspace: String, path: String) -> LumeResult<actions::GitRestorePreview> {
    execute(&state, move || actions::restore_preview(&workspace, &path)).await
}

#[tauri::command]
pub async fn lume_git_restore(state: State<'_, GitState>, workspace: String, revision: String, path: String, expected: Option<String>) -> LumeResult<String> {
    execute(&state, move || actions::restore(&workspace, &revision, &path, expected.as_deref())).await
}
