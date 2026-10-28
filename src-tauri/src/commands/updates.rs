use crate::error::{LumeError, LumeResult};
use serde::Serialize;
use std::time::Duration;
use tauri::{async_runtime::Mutex, ipc::Channel, AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub enum UpdateState {
    #[default]
    Idle,
    Available(Update),
    Downloaded { update: Update, bytes: Vec<u8> },
}

#[derive(Default)]
pub struct AppUpdateState(pub Mutex<UpdateState>);

#[derive(Serialize)]
pub struct UpdateMetadata {
    version: String,
    notes: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}

const BUSY_MESSAGE: &str = "更新任务正在进行，请稍后重试。";

#[tauri::command]
pub async fn lume_check_for_update(
    app: AppHandle,
    state: State<'_, AppUpdateState>,
) -> LumeResult<Option<UpdateMetadata>> {
    if cfg!(debug_assertions) {
        return Err(LumeError::Generic(
            "开发模式不执行在线更新，请安装正式版本后重试。".to_string(),
        ));
    }
    #[cfg(target_os = "linux")]
    if std::env::var_os("APPIMAGE").is_none() {
        return Err(LumeError::Generic(
            "当前安装方式不支持在线更新，请使用 AppImage 或前往发布页面下载。".to_string(),
        ));
    }
    let configured = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|config| config.get("pubkey"))
        .and_then(serde_json::Value::as_str)
        .is_some_and(|key| !key.trim().is_empty());
    if !configured {
        return Err(LumeError::Generic(
            "此版本尚未启用在线更新，请前往发布页面下载。".to_string(),
        ));
    }
    let mut pending = state
        .0
        .try_lock()
        .map_err(|_| LumeError::Generic(BUSY_MESSAGE.to_string()))?;
    if matches!(*pending, UpdateState::Downloaded { .. }) {
        return Err(LumeError::Generic("更新已下载，请安装并重启。".to_string()));
    }
    *pending = UpdateState::Idle;
    let update = app
        .updater_builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(update_error)?
        .check()
        .await
        .map_err(update_error)?;
    let metadata = update.as_ref().map(|update| UpdateMetadata {
        version: update.version.clone(),
        notes: update.body.clone(),
    });
    if let Some(mut update) = update {
        if update.download_url.scheme() != "https" {
            return Err(LumeError::Generic("更新包地址必须使用 HTTPS。".to_string()));
        }
        update.timeout = Some(Duration::from_secs(600));
        *pending = UpdateState::Available(update);
    }
    Ok(metadata)
}

#[tauri::command]
pub async fn lume_download_update(
    state: State<'_, AppUpdateState>,
    on_progress: Channel<DownloadProgress>,
) -> LumeResult<()> {
    let mut pending = state
        .0
        .try_lock()
        .map_err(|_| LumeError::Generic(BUSY_MESSAGE.to_string()))?;
    let UpdateState::Available(update) = &*pending else {
        return Err(LumeError::Generic("请先检查更新。".to_string()));
    };
    let mut downloaded = 0_u64;
    // 官方更新器在返回字节前校验签名；校验失败的包不会进入可安装状态。
    let bytes = update
        .download(
            |chunk_length, total| {
                downloaded += chunk_length as u64;
                let _ = on_progress.send(DownloadProgress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(update_error)?;
    *pending = UpdateState::Downloaded {
        update: update.clone(),
        bytes,
    };
    Ok(())
}

#[tauri::command]
pub async fn lume_install_update(
    app: AppHandle,
    state: State<'_, AppUpdateState>,
) -> LumeResult<()> {
    let mut pending = state
        .0
        .try_lock()
        .map_err(|_| LumeError::Generic(BUSY_MESSAGE.to_string()))?;
    if !matches!(*pending, UpdateState::Downloaded { .. }) {
        return Err(LumeError::Generic("请先下载更新。".to_string()));
    }
    let UpdateState::Downloaded { update, bytes } = std::mem::replace(&mut *pending, UpdateState::Idle)
    else {
        unreachable!();
    };
    let retry_update = update.clone();
    // Windows 安装器会直接退出进程，前端必须先确认文档会话已成功暂存。
    let result = tauri::async_runtime::spawn_blocking(move || update.install(bytes))
        .await
        .map_err(|error| LumeError::Generic(error.to_string()))
        .and_then(|result| result.map_err(update_error));
    if let Err(error) = result {
        *pending = UpdateState::Available(retry_update);
        return Err(error);
    }
    app.restart();
}

fn update_error(error: tauri_plugin_updater::Error) -> LumeError {
    eprintln!("在线更新失败: {error}");
    let message = match error {
        tauri_plugin_updater::Error::ReleaseNotFound => {
            "暂时无法获取更新信息，请稍后重试或前往发布页面。"
        }
        tauri_plugin_updater::Error::TargetNotFound(_)
        | tauri_plugin_updater::Error::TargetsNotFound(_) => {
            "此版本没有适合当前系统的更新包，请前往发布页面下载。"
        }
        tauri_plugin_updater::Error::Minisign(_)
        | tauri_plugin_updater::Error::Base64(_)
        | tauri_plugin_updater::Error::SignatureUtf8(_) => {
            "更新包签名校验失败，已停止更新。请稍后重试或前往发布页面。"
        }
        _ => "更新失败，请检查网络连接及安装权限后重试。",
    };
    LumeError::Generic(message.to_string())
}
