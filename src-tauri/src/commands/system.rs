use crate::error::{LumeError, LumeResult};
use serde::Serialize;
use std::{path::Path, process::Command};

#[derive(Debug, Serialize)]
pub struct HealthStatus {
    pub status: String,
    pub version: String,
}

#[tauri::command]
pub fn lume_health_check() -> LumeResult<HealthStatus> {
    Ok(HealthStatus {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
pub fn lume_startup_file_paths() -> LumeResult<Vec<String>> {
    Ok(std::env::args()
        .skip(1)
        .filter(|path| {
            matches!(
                Path::new(path)
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(str::to_ascii_lowercase)
                    .as_deref(),
                Some("md" | "markdown")
            )
        })
        .collect())
}

#[tauri::command]
pub fn lume_reveal_file(path: String) -> LumeResult<()> {
    let file_path = Path::new(&path);
    if !file_path.is_file() {
        return Err(LumeError::InvalidPath(
            "文件不存在或不是普通文件".to_string(),
        ));
    }
    #[cfg(target_os = "windows")]
    Command::new("explorer")
        .arg("/select,")
        .arg(file_path)
        .spawn()?;
    #[cfg(target_os = "macos")]
    Command::new("open").arg("-R").arg(file_path).spawn()?;
    #[cfg(all(unix, not(target_os = "macos")))]
    Command::new("xdg-open")
        .arg(
            file_path
                .parent()
                .ok_or_else(|| LumeError::InvalidPath("无法定位文件所在目录".to_string()))?,
        )
        .spawn()?;
    Ok(())
}
