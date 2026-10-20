#[cfg(target_os = "windows")]
pub fn read_image_paths() -> Vec<String> {
    use std::{ffi::c_void, path::Path, ptr, thread, time::Duration};

    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(owner: *mut c_void) -> i32;
        fn CloseClipboard() -> i32;
        fn GetClipboardData(format: u32) -> *mut c_void;
    }
    #[link(name = "shell32")]
    extern "system" {
        fn DragQueryFileW(drop: *mut c_void, index: u32, buffer: *mut u16, length: u32) -> u32;
    }
    struct Clipboard;
    impl Drop for Clipboard {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }

    // WebView 处理粘贴时可能短暂占用剪贴板，只读取文件列表，不改写剪贴板。
    for attempt in 0..3 {
        if unsafe { OpenClipboard(ptr::null_mut()) } == 0 {
            if attempt < 2 {
                thread::sleep(Duration::from_millis(10));
            }
            continue;
        }
        let _clipboard = Clipboard;
        let drop = unsafe { GetClipboardData(15) }; // CF_HDROP
        if drop.is_null() {
            return Vec::new();
        }
        let count = unsafe { DragQueryFileW(drop, u32::MAX, ptr::null_mut(), 0) };
        if count > 10_000 {
            return Vec::new();
        }
        let mut paths = Vec::new();
        for index in 0..count {
            let length = unsafe { DragQueryFileW(drop, index, ptr::null_mut(), 0) };
            if length == 0 || length > 32767 {
                continue;
            }
            let mut buffer = vec![0u16; length as usize + 1];
            let copied = unsafe { DragQueryFileW(drop, index, buffer.as_mut_ptr(), length + 1) };
            if copied != length {
                continue;
            }
            let Ok(path) = String::from_utf16(&buffer[..length as usize]) else {
                continue;
            };
            let image = Path::new(&path);
            let supported = image
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| {
                    matches!(
                        value.to_ascii_lowercase().as_str(),
                        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "avif" | "svg"
                            | "ico" | "tif" | "tiff"
                    )
                });
            if supported && image.is_file() {
                paths.push(path);
            }
        }
        return paths;
    }
    Vec::new()
}

#[cfg(not(target_os = "windows"))]
pub fn read_image_paths() -> Vec<String> {
    Vec::new()
}
