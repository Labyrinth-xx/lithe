use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};
use tauri::{Emitter, Manager, State};

/// 递归遍历目录的最大深度，防止极深/异常目录把主线程卡死。
const TREE_MAX_DEPTH: usize = 12;

/// 文件树节点：目录带 children，文件 children 为空。
#[derive(serde::Serialize, Clone)]
struct TreeNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Vec<TreeNode>,
}

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

/// 前端经侧边栏/标签切换文件时，必须同步更新后端 target_file，
/// 否则后台轮询线程仍盯着旧文件、新文件的外部改动收不到。
/// path 为 null（关掉最后一个标签）时清空目标，轮询线程随即闲置不再读盘。
/// 不 emit：让轮询线程下一拍在 `_ =>` 臂自行 re-baseline，避免切换瞬间误触发刷新。
#[tauri::command]
fn set_target_file(path: Option<String>, state: State<AppState>) -> Result<(), String> {
    *state.target_file.lock().map_err(|e| e.to_string())? = path.map(PathBuf::from);
    Ok(())
}

/// 是否为 Markdown 文件（与 tauri.conf.json 的 fileAssociations 保持一致）。
fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("md") | Some("markdown")
    )
}

/// 递归构建一层目录节点：目录在前、文件在后，均按名不区分大小写排序；
/// 剪掉不含任何 .md 的空目录分支。返回 None 表示该目录（连同子孙）没有 .md，应剪掉。
fn build_node(dir: &Path, depth: usize) -> Option<TreeNode> {
    let mut dirs: Vec<TreeNode> = Vec::new();
    let mut files: Vec<TreeNode> = Vec::new();

    if depth < TREE_MAX_DEPTH {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let Ok(ft) = entry.file_type() else { continue };
                if ft.is_symlink() {
                    continue; // 跳过软链，防环
                }
                let p = entry.path();
                if ft.is_dir() {
                    if let Some(child) = build_node(&p, depth + 1) {
                        dirs.push(child);
                    }
                } else if ft.is_file() && is_markdown(&p) {
                    files.push(make_leaf(&p));
                }
            }
        }
    }

    if dirs.is_empty() && files.is_empty() {
        return None; // 空分支（无 .md）剪掉
    }
    sort_by_name(&mut dirs);
    sort_by_name(&mut files);
    dirs.append(&mut files);
    Some(TreeNode {
        name: file_name(dir),
        path: dir.to_string_lossy().to_string(),
        is_dir: true,
        children: dirs,
    })
}

fn make_leaf(path: &Path) -> TreeNode {
    TreeNode {
        name: file_name(path),
        path: path.to_string_lossy().to_string(),
        is_dir: false,
        children: Vec::new(),
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn sort_by_name(nodes: &mut [TreeNode]) {
    nodes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
}

/// 递归列出文件夹内所有 .md 组成的嵌套树（供前端文件树侧边栏渲染）。
#[tauri::command]
fn read_dir_tree(path: String) -> Result<TreeNode, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("不是文件夹：{path}"));
    }
    // 根目录即使无 .md 也返回一个空根，让前端显示「该文件夹没有 Markdown」。
    Ok(build_node(&root, 0).unwrap_or_else(|| TreeNode {
        name: file_name(&root),
        path: root.to_string_lossy().to_string(),
        is_dir: true,
        children: Vec::new(),
    }))
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
        .plugin(tauri_plugin_dialog::init())
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
            write_file,
            set_target_file,
            read_dir_tree
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
