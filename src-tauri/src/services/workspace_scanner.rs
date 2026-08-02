use crate::error::{LumeError, LumeResult};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs::OpenOptions,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

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

#[derive(Clone, Debug, PartialEq)]
pub struct WorkspaceFileStamp {
    pub modified_millis: u128,
    pub size: u64,
    pub is_directory: bool,
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

fn canonical_workspace_path(workspace_path: &str) -> LumeResult<PathBuf> {
    let root = std::fs::canonicalize(workspace_path)?;
    if !root.is_dir() {
        return Err(LumeError::InvalidPath("工作区路径必须是普通目录".to_string()));
    }
    Ok(root)
}

fn ensure_workspace_descendant(root: &Path, path: &Path) -> LumeResult<PathBuf> {
    let canonical = std::fs::canonicalize(path)?;
    if !canonical.starts_with(root) {
        return Err(LumeError::InvalidPath("不能操作工作区之外的路径".to_string()));
    }
    Ok(canonical)
}

fn ensure_workspace_entry(root: &Path, path: &Path) -> LumeResult<PathBuf> {
    let canonical = ensure_workspace_descendant(root, path)?;
    if canonical == root {
        return Err(LumeError::InvalidPath("不能操作工作区根目录".to_string()));
    }
    Ok(canonical)
}

fn ensure_destination(root: &Path, parent_path: &str, name: &str) -> LumeResult<PathBuf> {
    let parent = ensure_workspace_descendant(root, Path::new(parent_path))?;
    if !parent.is_dir() {
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
    let destination = parent.join(name);
    if destination.exists() {
        return Err(LumeError::InvalidPath("同名文件或文件夹已存在".to_string()));
    }
    Ok(destination)
}

pub fn rename_workspace_entry(
    workspace_path: &str,
    path: &str,
    new_name: &str,
) -> LumeResult<String> {
    let root = canonical_workspace_path(workspace_path)?;
    let source = ensure_workspace_entry(&root, Path::new(path))?;
    let parent = source
        .parent()
        .ok_or_else(|| LumeError::InvalidPath("无法确定父目录".to_string()))?;
    let destination = ensure_destination(&root, &parent.to_string_lossy(), new_name)?;
    if source.is_file() && !is_markdown_path(&destination) {
        return Err(LumeError::InvalidPath(
            "Markdown 文件必须使用 .md 或 .markdown 扩展名".to_string(),
        ));
    }
    std::fs::rename(source, &destination)?;
    Ok(destination.to_string_lossy().into_owned())
}

pub fn move_workspace_entry(
    workspace_path: &str,
    path: &str,
    target_directory: &str,
) -> LumeResult<String> {
    let root = canonical_workspace_path(workspace_path)?;
    let source = ensure_workspace_entry(&root, Path::new(path))?;
    let target = ensure_workspace_descendant(&root, Path::new(target_directory))?;
    if !target.is_dir() || target.starts_with(&source) {
        return Err(LumeError::InvalidPath("目标目录无效".to_string()));
    }
    let name = source
        .file_name()
        .ok_or_else(|| LumeError::InvalidPath("无法确定文件名".to_string()))?;
    let destination = target.join(name);
    if destination.exists() {
        return Err(LumeError::InvalidPath("目标目录中存在同名条目".to_string()));
    }
    std::fs::rename(source, &destination)?;
    Ok(destination.to_string_lossy().into_owned())
}

pub fn delete_workspace_entry(workspace_path: &str, path: &str) -> LumeResult<()> {
    let root = canonical_workspace_path(workspace_path)?;
    let target = ensure_workspace_entry(&root, Path::new(path))?;
    if target.is_dir() {
        std::fs::remove_dir_all(target)?;
    } else {
        std::fs::remove_file(target)?;
    }
    Ok(())
}

fn collect_file_stamps(
    directory: &Path,
    depth: usize,
    count: &mut usize,
    stamps: &mut HashMap<String, WorkspaceFileStamp>,
) {
    if depth > MAX_WORKSPACE_DEPTH || *count >= MAX_WORKSPACE_ENTRIES {
        return;
    }
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        if *count >= MAX_WORKSPACE_ENTRIES {
            break;
        }
        let path = entry.path();
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            *count += 1;
            let modified_millis = metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |value| value.as_millis());
            stamps.insert(
                path.to_string_lossy().into_owned(),
                WorkspaceFileStamp {
                    modified_millis,
                    size: 0,
                    is_directory: true,
                },
            );
            collect_file_stamps(&path, depth + 1, count, stamps);
        } else if metadata.is_file() && is_markdown_path(&path) {
            *count += 1;
            let modified_millis = metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |value| value.as_millis());
            stamps.insert(
                path.to_string_lossy().into_owned(),
                WorkspaceFileStamp {
                    modified_millis,
                    size: metadata.len(),
                    is_directory: false,
                },
            );
        }
    }
}

pub fn workspace_file_stamps(path: &str) -> LumeResult<HashMap<String, WorkspaceFileStamp>> {
    let root = canonical_workspace_path(path)?;
    let mut stamps = HashMap::new();
    collect_file_stamps(&root, 0, &mut 0, &mut stamps);
    Ok(stamps)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Instant, SystemTime};

    fn test_directory(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("系统时间应晚于 Unix Epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("lume-{name}-{unique}"))
    }

    #[test]
    fn manages_workspace_entries_with_boundary_validation() {
        let root = test_directory("workspace-operations");
        std::fs::create_dir_all(root.join("notes")).expect("应创建测试目录");

        let created = create_workspace_entry(
            &root.join("notes").to_string_lossy(),
            "draft.md",
            false,
        ).expect("应创建 Markdown 文件");
        let renamed = rename_workspace_entry(
            &root.to_string_lossy(),
            &created,
            "article.md",
        ).expect("应重命名文件");
        let moved = move_workspace_entry(
            &root.to_string_lossy(),
            &renamed,
            &root.to_string_lossy(),
        ).expect("应移动文件");
        delete_workspace_entry(&root.to_string_lossy(), &moved).expect("应删除文件");

        assert!(!Path::new(&moved).exists());
        std::fs::remove_dir_all(root).expect("应清理测试目录");
    }

    #[test]
    fn measures_thousand_file_scan_baseline() {
        let root = test_directory("workspace-baseline");
        std::fs::create_dir_all(&root).expect("应创建测试目录");
        for index in 0..1_000 {
            std::fs::write(root.join(format!("document-{index}.md")), "# Baseline")
                .expect("应创建基线文件");
        }

        let started = Instant::now();
        let entries = read_workspace(&root.to_string_lossy()).expect("应扫描工作区");
        let elapsed = started.elapsed();
        println!("Lume 1000 文件扫描基线: {} ms", elapsed.as_millis());

        assert_eq!(entries.len(), 1_000);
        std::fs::remove_dir_all(root).expect("应清理测试目录");
    }
}
