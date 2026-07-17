// Lume 桌面应用二进制入口
//
// 禁止 Windows 控制台窗口在发布构建中出现。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lume_lib::run()
}