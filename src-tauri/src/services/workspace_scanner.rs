use crate::error::{LumeError, LumeResult};
use serde::Serialize;
use std::{fs::OpenOptions, path::Path};

const MAX_WORKSPACE_ENTRIES: usize = 5_000;
const MAX_WORKSPACE_DEPTH: usize = 32;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub children: Vec<WorkspaceEntry>,
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("md" | "markdown")
    )
}

fn scan(directory: &Path, depth: usize, count: &mut usize) -> LumeResult<Vec<WorkspaceEntry>> {
    if depth > MAX_WORKSPACE_DEPTH || *count >= MAX_WORKSPACE_ENTRIES {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(directory)? {
        if *count >= MAX_WORKSPACE_ENTRIES {
            break;
        }
        let entry = match entry {
            Ok(value) => value,
            Err(_) => continue,
        };
        let path = entry.path();
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if metadata.is_dir() {
            let children = scan(&path, depth + 1, count).unwrap_or_default();
            if children.is_empty() {
                continue;
            }
            *count += 1;
            entries.push(WorkspaceEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                is_directory: true,
                children,
            });
        } else if metadata.is_file() && is_markdown_path(&path) {
            *count += 1;
            entries.push(WorkspaceEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                is_directory: false,
                children: Vec::new(),
            });
        }
    }
    entries.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

pub fn read_workspace(path: &str) -> LumeResult<Vec<WorkspaceEntry>> {
    let root = Path::new(path);
    let metadata = std::fs::symlink_metadata(root)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(LumeError::InvalidPath(
            "工作区路径必须是普通目录".to_string(),
        ));
    }
    scan(root, 0, &mut 0)
}

pub fn create_workspace_entry(
    parent_path: &str,
    name: &str,
    is_directory: bool,
) -> LumeResult<String> {
    let parent = Path::new(parent_path);
    let metadata = std::fs::symlink_metadata(parent)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(LumeError::InvalidPath("目标位置必须是普通目录".to_string()));
    }
    let name = name.trim();
    if name.is_empty()
        || matches!(name, "." | "..")
        || Path::new(name).components().count() != 1
        || name.contains(['/', '\\'])
    {
        return Err(LumeError::InvalidPath("名称不能包含路径分隔符".to_string()));
    }
    let path = parent.join(name);
    if path.exists() {
        return Err(LumeError::InvalidPath("同名文件或文件夹已存在".to_string()));
    }
    if is_directory {
        std::fs::create_dir(&path)?;
    } else {
        if !is_markdown_path(&path) {
            return Err(LumeError::InvalidPath(
                "新文件必须使用 .md 或 .markdown 扩展名".to_string(),
            ));
        }
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)?;
    }
    Ok(path.to_string_lossy().into_owned())
}
