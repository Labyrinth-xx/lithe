use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};
use tauri::{Emitter, Manager, State};

/// 应用状态：当前要打开/正在看的目标文件路径。
/// 来源优先级：双击打开（RunEvent::Opened）> 开发期环境变量 MD_READER_FILE。
struct AppState {
    target_file: Mutex<Option<PathBuf>>,
}

/// 前端就绪后主动来取「该打开哪个文件」。None 表示没有指定文件（显示示例）。
#[tauri::command]
fn get_opened_file(state: State<AppState>) -> Option<String> {
    state
        .target_file
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
}

/// 读取文件内容。一次性读完即关闭句柄——不持有、不加锁。
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取失败：{e}"))
}

/// 写回文件内容。一次性写完即关闭——外部程序（含 CC 后台）可随时再改。
#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("保存失败：{e}"))
}

/// 后台轮询线程：每秒检查当前目标文件的修改时间。
/// 同一文件 mtime 前进 → 说明被外部改动 → 把最新内容 emit 给前端（前端再做回声抑制）。
/// 首次见到某路径只记基线、不 emit（避免开文件时立刻"刷新"自己）。
fn spawn_file_watcher(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut seen: Option<(PathBuf, SystemTime)> = None;
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            let path = {
                let state: State<AppState> = handle.state();
                let p = state.target_file.lock().unwrap().clone();
                p
            };
            let Some(path) = path else {
                continue;
            };
            let Ok(mtime) = std::fs::metadata(&path).and_then(|m| m.modified()) else {
                continue;
            };
            match &seen {
                Some((sp, st)) if *sp == path => {
                    if mtime > *st {
                        seen = Some((path.clone(), mtime));
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            let _ = handle.emit("file-changed", content);
                        }
                    }
                }
                _ => {
                    // 新路径（或首次）：记下基线，不触发刷新
                    seen = Some((path.clone(), mtime));
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 开发期：可用 MD_READER_FILE 指定初始文件
    let initial = std::env::var("MD_READER_FILE").ok().map(PathBuf::from);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            target_file: Mutex::new(initial),
        })
        .setup(|app| {
            spawn_file_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_opened_file,
            read_file,
            write_file
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // 双击 .md / “打开方式” 选本 app 时触发，携带 file:// URL
            if let tauri::RunEvent::Opened { urls } = event {
                if let Some(path) = urls.iter().filter_map(|u| u.to_file_path().ok()).next() {
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        *state.target_file.lock().unwrap() = Some(path.clone());
                    }
                    // app 已在运行时：通知前端切换到新文件（冷启动则由前端主动取）
                    let _ = app_handle.emit("open-file", path.to_string_lossy().to_string());
                }
            }
        });
}
