//! Lume 桌面应用 Rust 后端入口
//!
//! 负责初始化 Tauri 应用、注册命令和插件。
//! 模块组织：
//! - `error`: 统一错误处理
//! - `commands`: Tauri 命令定义

mod commands;
mod error;

use commands::{lume_health_check, lume_read_markdown_file, lume_reveal_file};

/// 创建并配置 Tauri 应用实例
///
/// 将插件注册和命令绑定集中管理，保持入口清晰。
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            lume_health_check,
            lume_read_markdown_file,
            lume_reveal_file
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用时发生错误");
}
