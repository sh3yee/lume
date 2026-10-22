use crate::error::{LumeError, LumeResult};

#[cfg(target_os = "windows")]
pub fn list_system_fonts() -> LumeResult<Vec<String>> {
    windows::list_font_families()
}

#[cfg(not(target_os = "windows"))]
pub fn list_system_fonts() -> LumeResult<Vec<String>> {
    Err(LumeError::Generic(
        "当前平台暂不支持读取系统字体列表，请手动输入已安装字体的名称".to_string(),
    ))
}

#[cfg(target_os = "windows")]
mod windows {
    use super::{LumeError, LumeResult};
    use std::{
        collections::BTreeMap,
        ffi::c_void,
        panic::{catch_unwind, AssertUnwindSafe},
        ptr,
    };

    const DEFAULT_CHARSET: u8 = 1;

    // 与 Windows LOGFONTW 保持相同的 C 字段顺序和宽度。
    #[repr(C)]
    #[derive(Default)]
    struct LogFont {
        height: i32,
        width: i32,
        escapement: i32,
        orientation: i32,
        weight: i32,
        italic: u8,
        underline: u8,
        strike_out: u8,
        char_set: u8,
        out_precision: u8,
        clip_precision: u8,
        quality: u8,
        pitch_and_family: u8,
        face_name: [u16; 32],
    }

    type FontCallback =
        unsafe extern "system" fn(*const LogFont, *const c_void, u32, isize) -> i32;

    #[link(name = "gdi32")]
    extern "system" {
        fn EnumFontFamiliesExW(
            device_context: *mut c_void,
            log_font: *mut LogFont,
            callback: Option<FontCallback>,
            context: isize,
            flags: u32,
        ) -> i32;
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetDC(window: *mut c_void) -> *mut c_void;
        fn ReleaseDC(window: *mut c_void, device_context: *mut c_void) -> i32;
    }

    struct ScreenDeviceContext(*mut c_void);

    impl Drop for ScreenDeviceContext {
        fn drop(&mut self) {
            // GetDC(NULL) 返回的屏幕 DC 必须用相同窗口参数释放。
            unsafe { ReleaseDC(ptr::null_mut(), self.0) };
        }
    }

    unsafe extern "system" fn collect_font_family(
        log_font: *const LogFont,
        _text_metrics: *const c_void,
        _font_type: u32,
        context: isize,
    ) -> i32 {
        if log_font.is_null() || context == 0 {
            return 1;
        }

        // Rust panic 不得越过 Win32 回调边界；返回 0 中止枚举并由调用方报错。
        let result = catch_unwind(AssertUnwindSafe(|| {
            // EnumFontFamiliesExW 同步调用回调；字体和调用方集合在枚举期间有效。
            let font = unsafe { &*log_font };
            let families = unsafe { &mut *(context as *mut BTreeMap<String, String>) };
            let length = font
                .face_name
                .iter()
                .position(|character| *character == 0)
                .unwrap_or(font.face_name.len());
            let name = String::from_utf16_lossy(&font.face_name[..length]);
            let name = name.trim();
            if !name.is_empty() && !name.starts_with('@') {
                families
                    .entry(name.to_lowercase())
                    .or_insert_with(|| name.to_string());
            }
        }));
        i32::from(result.is_ok())
    }

    pub fn list_font_families() -> LumeResult<Vec<String>> {
        // 读取屏幕可用字体，不使用固定字体列表或字体文件名推断 family。
        let raw_device_context = unsafe { GetDC(ptr::null_mut()) };
        if raw_device_context.is_null() {
            return Err(LumeError::Generic(
                "无法读取系统字体：获取屏幕设备失败".to_string(),
            ));
        }
        let device_context = ScreenDeviceContext(raw_device_context);

        let mut families = BTreeMap::<String, String>::new();
        let mut log_font = LogFont {
            char_set: DEFAULT_CHARSET,
            ..LogFont::default()
        };
        // 空字体名称配合 DEFAULT_CHARSET 会枚举所有字符集的字体 family。
        let result = unsafe {
            EnumFontFamiliesExW(
                device_context.0,
                &mut log_font,
                Some(collect_font_family),
                &mut families as *mut BTreeMap<String, String> as isize,
                0,
            )
        };
        if result == 0 || families.is_empty() {
            return Err(LumeError::Generic(
                "无法读取系统已安装字体列表，请重试".to_string(),
            ));
        }
        Ok(families.into_values().collect())
    }
}
