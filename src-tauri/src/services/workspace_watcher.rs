use crate::{
    error::{LumeError, LumeResult},
    services::workspace_scanner::{self, WorkspaceFileStamp},
};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

pub const WORKSPACE_CHANGE_EVENT: &str = "lume://workspace-change";
const WATCH_INTERVAL: Duration = Duration::from_millis(750);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChangeBatch {
    pub workspace_path: String,
    pub changes: Vec<WorkspaceChange>,
    pub scan_duration_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChange {
    pub kind: WorkspaceChangeKind,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceChangeKind {
    Created,
    Modified,
    Deleted,
    Renamed,
}

#[derive(Default)]
struct WatcherControl {
    generation: u64,
}

#[derive(Clone, Default)]
pub struct WorkspaceWatcherState(Arc<Mutex<WatcherControl>>);

impl WorkspaceWatcherState {
    fn next_generation(&self) -> LumeResult<u64> {
        let mut control = self
            .0
            .lock()
            .map_err(|_| LumeError::Generic("工作区监听状态不可用".to_string()))?;
        control.generation += 1;
        Ok(control.generation)
    }

    fn is_current(&self, generation: u64) -> bool {
        self.0.lock().is_ok_and(|control| control.generation == generation)
    }
}

fn compare_snapshots(
    previous: &HashMap<String, WorkspaceFileStamp>,
    current: &HashMap<String, WorkspaceFileStamp>,
) -> Vec<WorkspaceChange> {
    let mut changes = Vec::new();
    let created: Vec<_> = current
        .iter()
        .filter(|(path, _)| !previous.contains_key(*path))
        .collect();
    let deleted: Vec<_> = previous
        .iter()
        .filter(|(path, _)| !current.contains_key(*path))
        .collect();
    let mut renamed_created = Vec::new();
    let mut renamed_deleted = Vec::new();

    for (previous_path, previous_stamp) in &deleted {
        let candidates: Vec<_> = created.iter().filter(|(path, stamp)| {
            !renamed_created.contains(path) && *stamp == *previous_stamp
        }).collect();
        if let [candidate] = candidates.as_slice() {
            let (path, _) = *candidate;
            renamed_created.push(path);
            renamed_deleted.push(*previous_path);
            changes.push(WorkspaceChange {
                kind: WorkspaceChangeKind::Renamed,
                path: path.to_string(),
                previous_path: Some((*previous_path).clone()),
            });
        }
    }
    for (path, stamp) in current {
        let kind = match previous.get(path) {
            None if !renamed_created.contains(&path) => Some(WorkspaceChangeKind::Created),
            None => None,
            Some(previous_stamp) if previous_stamp != stamp => Some(WorkspaceChangeKind::Modified),
            Some(_) => None,
        };
        if let Some(kind) = kind {
            changes.push(WorkspaceChange {
                kind,
                path: path.clone(),
                previous_path: None,
            });
        }
    }
    for path in previous.keys() {
        if !current.contains_key(path) && !renamed_deleted.contains(&path) {
            changes.push(WorkspaceChange {
                kind: WorkspaceChangeKind::Deleted,
                path: path.clone(),
                previous_path: None,
            });
        }
    }
    changes.sort_by(|left, right| left.path.cmp(&right.path));
    changes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stamp(size: u64, modified_millis: u128) -> WorkspaceFileStamp {
        WorkspaceFileStamp { size, modified_millis, is_directory: false }
    }

    #[test]
    fn compares_created_modified_deleted_and_renamed_files() {
        let previous = HashMap::from([
            ("deleted.md".to_string(), stamp(1, 1)),
            ("modified.md".to_string(), stamp(2, 2)),
            ("old.md".to_string(), stamp(3, 3)),
        ]);
        let current = HashMap::from([
            ("created.md".to_string(), stamp(4, 4)),
            ("modified.md".to_string(), stamp(5, 5)),
            ("new.md".to_string(), stamp(3, 3)),
        ]);

        let changes = compare_snapshots(&previous, &current);

        assert!(changes.iter().any(|change| matches!(change.kind, WorkspaceChangeKind::Created)));
        assert!(changes.iter().any(|change| matches!(change.kind, WorkspaceChangeKind::Modified)));
        assert!(changes.iter().any(|change| matches!(change.kind, WorkspaceChangeKind::Deleted)));
        assert!(changes.iter().any(|change| {
            matches!(change.kind, WorkspaceChangeKind::Renamed)
                && change.path == "new.md"
                && change.previous_path.as_deref() == Some("old.md")
        }));
    }
}

pub fn start_workspace_watcher(
    app: AppHandle,
    state: WorkspaceWatcherState,
    workspace_path: String,
) -> LumeResult<()> {
    let generation = state.next_generation()?;
    let mut previous = workspace_scanner::workspace_file_stamps(&workspace_path)?;
    thread::spawn(move || {
        while state.is_current(generation) {
            thread::sleep(WATCH_INTERVAL);
            if !state.is_current(generation) {
                break;
            }
            let started = Instant::now();
            let Ok(current) = workspace_scanner::workspace_file_stamps(&workspace_path) else {
                continue;
            };
            let changes = compare_snapshots(&previous, &current);
            previous = current;
            if changes.is_empty() {
                continue;
            }
            let payload = WorkspaceChangeBatch {
                workspace_path: workspace_path.clone(),
                changes,
                scan_duration_ms: started.elapsed().as_millis() as u64,
            };
            let _ = app.emit(WORKSPACE_CHANGE_EVENT, payload);
        }
    });
    Ok(())
}

pub fn stop_workspace_watcher(state: &WorkspaceWatcherState) -> LumeResult<()> {
    state.next_generation().map(|_| ())
}