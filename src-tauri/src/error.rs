//! Lume 错误处理模块
//!
//! 定义统一的错误类型，作为 Tauri 命令边界的错误返回标准。
//! 所有命令错误通过 `Result<T, LumeError>` 返回，前端可据此进行精确处理。

use serde::Serialize;
use thiserror::Error;

/// Lume 统一错误类型
///
/// 遵循 Tauri 命令边界规范：错误必须实现 `Serialize`，
/// 以便序列化为 JSON 传递给前端。
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum LumeError {
    /// 文件 I/O 错误
    #[error("文件操作失败: {0}")]
    Io(String),

    /// 文件未找到
    #[error("文件未找到: {0}")]
    NotFound(String),

    /// 权限不足
    #[error("权限不足: {0}")]
    PermissionDenied(String),

    /// 路径无效
    #[error("路径无效: {0}")]
    InvalidPath(String),

    /// 序列化/反序列化错误
    #[error("数据格式错误: {0}")]
    Serialization(String),

    /// Tauri 内部错误
    #[error("系统错误: {0}")]
    Tauri(String),

    /// 通用错误
    #[error("{0}")]
    Generic(String),
}

// ─── 标准库错误转换 ───────────────────────────────────────────

impl From<std::io::Error> for LumeError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => LumeError::NotFound(err.to_string()),
            std::io::ErrorKind::PermissionDenied => LumeError::PermissionDenied(err.to_string()),
            _ => LumeError::Io(err.to_string()),
        }
    }
}

impl From<serde_json::Error> for LumeError {
    fn from(err: serde_json::Error) -> Self {
        LumeError::Serialization(err.to_string())
    }
}

impl From<tauri::Error> for LumeError {
    fn from(err: tauri::Error) -> Self {
        LumeError::Tauri(err.to_string())
    }
}

/// 便捷 Result 类型别名
pub type LumeResult<T> = Result<T, LumeError>;