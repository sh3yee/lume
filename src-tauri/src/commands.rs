//! Tauri 命令定义模块
//!
//! 所有暴露给前端的命令在此声明。
//! 命令边界规范：
//! - 命令名以 `lume_` 前缀命名，避免与插件命令冲突。
//! - 返回类型统一为 `LumeResult<T>`，错误通过 `LumeError` 传递。
//! - 命令参数使用基础类型或自定义可序列化结构体。
//! - 命令应保持轻量，耗时操作在后台异步执行。

use crate::error::LumeResult;
use serde::{Deserialize, Serialize};

/// 健康检查命令
///
/// 前端启动后调用此命令验证 Rust 后端是否就绪。
#[tauri::command]
pub fn lume_health_check() -> LumeResult<HealthStatus> {
    Ok(HealthStatus {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

/// 健康检查返回结构
#[derive(Debug, Serialize, Deserialize)]
pub struct HealthStatus {
    pub status: String,
    pub version: String,
}