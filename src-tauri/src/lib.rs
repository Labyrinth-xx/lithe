use std::collections::{HashMap, HashSet};
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

/// 应用状态：多窗口。每个窗口用自己的 label 作 key，互不串扰。
/// - watched：各窗口当前正在看的文件（监听集合 = 所有 value 的并集）。
/// - pending：新建/拖出窗口的初始文件，按 label 暂存，供该窗口前端启动时来取。
///   main 窗口的初始文件（argv/env 或冷启动双击）启动时登记到 pending["main"]。
/// - next_window：自增计数，给拖出/新开窗口生成唯一 label（doc-1、doc-2…）。
/// - main_ready：主窗口是否已取过初始文件。一旦就绪，此后从桌面双击打开文件
///   一律开「新窗口」（而非在现有窗口加标签）；冷启动首个文件仍交给主窗口。
struct AppState {
    watched: Mutex<HashMap<String, PathBuf>>,
    pending: Mutex<HashMap<String, PathBuf>>,
    next_window: Mutex<u64>,
    main_ready: Mutex<bool>,
}

/// 外部改动通知载荷：带上是哪个文件，前端按路径过滤，只认自己窗口在看的那份。
#[derive(serde::Serialize, Clone)]
struct FileChange {
    path: String,
    content: String,
}

/// 前端就绪后主动来取「本窗口该打开哪个文件」。None 表示没指定（显示示例）。
/// 按调用窗口的 label 从 pending 取——Tauri 自动注入调用方 Window。
#[tauri::command]
fn get_opened_file(window: tauri::Window, state: State<AppState>) -> Option<String> {
    // 主窗口一旦来取过初始文件，即标记就绪：此后桌面双击的文件都开新窗口。
    if window.label() == "main" {
        *state.main_ready.lock().unwrap() = true;
    }
    // remove 而非 get：消费一次握手——同一窗口若重载页面不会再取到同一文件而重复开标签。
    state
        .pending
        .lock()
        .unwrap()
        .remove(window.label())
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

/// 找 pandoc 可执行文件。要害：Finder 启动的 GUI App 不继承 shell 的 PATH，
/// `Command::new("pandoc")` 会 NotFound 即使已 `brew install pandoc`。
/// 故先显式探测 Homebrew 常见安装路径（能 exists() 验证），都没有再退回裸名
/// 交给 PATH 解析（开发态 / 已配 PATH 时命中；仍找不到则在 spawn 处按 NotFound 处理）。
fn pandoc_path() -> String {
    for c in ["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc"] {
        if Path::new(c).exists() {
            return c.to_string();
        }
    }
    "pandoc".to_string()
}

/// 用 pandoc 把当前 markdown 转成 .docx 导出。pandoc 是独立命令行程序，
/// 装好后本命令直接以子进程调用它——不联网、不依赖 agent。
/// markdown 经 stdin 喂入（不落临时文件），`-o out_path` 直接产出文件。
/// pandoc 不存在 → Err("PANDOC_NOT_FOUND")（前端据此提示 brew install）；
/// 转换非零退出 → Err(stderr)。
/// 注：本轮用 Word 默认样式；将来要套上报模板，加 `--reference-doc=<模板.docx>` 即可。
#[tauri::command]
fn export_docx(markdown: String, out_path: String) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let pandoc = pandoc_path();
    let mut child = Command::new(&pandoc)
        .args(["-f", "markdown", "-t", "docx", "-o", &out_path])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "PANDOC_NOT_FOUND".to_string()
            } else {
                format!("启动 pandoc 失败：{e}")
            }
        })?;

    // 把 markdown 写进 pandoc stdin，写完 drop 句柄触发 EOF。
    child
        .stdin
        .take()
        .ok_or("无法获取 pandoc stdin")?
        .write_all(markdown.as_bytes())
        .map_err(|e| format!("写入 pandoc 失败：{e}"))?;

    let output = child
        .wait_with_output()
        .map_err(|e| format!("等待 pandoc 失败：{e}"))?;
    if !output.status.success() {
        return Err(format!(
            "pandoc 转换失败：{}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

/// 前端经侧边栏/标签切换文件时，必须同步更新本窗口在后端的 watched 条目，
/// 否则后台轮询仍盯着旧文件、新文件的外部改动收不到。
/// path 为 null（关掉最后一个标签）时移除本窗口条目，该文件若无其他窗口在看即停止轮询。
/// 不 emit：轮询线程见到新路径只记基线、不触发刷新，避免切换瞬间误刷。
#[tauri::command]
fn set_target_file(
    window: tauri::Window,
    path: Option<String>,
    state: State<AppState>,
) -> Result<(), String> {
    let mut watched = state.watched.lock().map_err(|e| e.to_string())?;
    match path {
        Some(p) => {
            watched.insert(window.label().to_string(), PathBuf::from(p));
        }
        None => {
            watched.remove(window.label());
        }
    }
    Ok(())
}

/// 开一个新窗口装指定文件（或空窗口）。供命令 open_in_new_window 与桌面双击两条路径共用。
/// path 为某文件 → 新窗口启动后 get_opened_file 取到它并加载；path 为 null → 空白新文档。
/// pos 为 Some((x,y)) 时在该逻辑屏幕坐标打开（拖出标签时＝松手处）；None 则系统默认居中。
/// 新窗口是同一份前端 app 的独立实例，复用「一窗口一编辑器」模型。
fn spawn_doc_window(
    app: &tauri::AppHandle,
    path: Option<String>,
    pos: Option<(f64, f64)>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let label = {
        let mut n = state.next_window.lock().map_err(|e| e.to_string())?;
        *n += 1;
        format!("doc-{n}")
    };
    let mut builder =
        tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title("Lithe")
            .inner_size(900.0, 680.0);
    if let Some((x, y)) = pos {
        // 不让窗口跑到屏幕外（负坐标）；在松手处打开。
        builder = builder.position(x.max(0.0), y.max(0.0));
    }
    builder.build().map_err(|e| e.to_string())?;
    // 建窗成功后再登记初始文件：建窗失败就不会留下永不被取走的孤儿 pending 条目。
    // 新窗口前端要到 vditor after() 才调 get_opened_file，远晚于此处同步插入，无竞态。
    if let Some(p) = path {
        state
            .pending
            .lock()
            .map_err(|e| e.to_string())?
            .insert(label, PathBuf::from(p));
    }
    Ok(())
}

/// 开一个新窗口（拖出标签 / 右键「在新窗口打开」/ Cmd+N）。
/// x、y 为拖出松手处的逻辑屏幕坐标；二者齐备才用作开窗位置，否则居中。
#[tauri::command]
fn open_in_new_window(
    app: tauri::AppHandle,
    path: Option<String>,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<(), String> {
    let pos = match (x, y) {
        (Some(x), Some(y)) => Some((x, y)),
        _ => None,
    };
    spawn_doc_window(&app, path, pos)
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

/// 后台轮询线程：每秒检查所有窗口正在看的文件（并集）的修改时间。
/// 某文件 mtime 前进 → 被外部改动 → 把 {path, content} 广播给所有窗口（前端按 path 过滤 + 回声抑制）。
/// 每个文件各记一条基线，首次见到只记基线不 emit（避免开文件/切换时立刻"刷新"自己）；
/// 已无任何窗口在看的文件，其基线随之丢弃（下次再被打开会重新记基线、不误刷）。
fn spawn_file_watcher(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut baselines: HashMap<PathBuf, SystemTime> = HashMap::new();
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            // 取当前所有窗口在看文件的并集（HashSet 天然去重，retain 命中 O(1)）
            let paths: HashSet<PathBuf> = {
                let state: State<AppState> = handle.state();
                let set = state.watched.lock().unwrap().values().cloned().collect();
                set
            };
            // 丢弃已无人在看的文件基线
            baselines.retain(|p, _| paths.contains(p));
            for path in &paths {
                let Ok(mtime) = std::fs::metadata(path).and_then(|m| m.modified()) else {
                    continue;
                };
                match baselines.get(path) {
                    Some(&st) => {
                        if mtime > st {
                            baselines.insert(path.clone(), mtime);
                            if let Ok(content) = std::fs::read_to_string(path) {
                                let _ = handle.emit(
                                    "file-changed",
                                    FileChange {
                                        path: path.to_string_lossy().to_string(),
                                        content,
                                    },
                                );
                            }
                        }
                    }
                    None => {
                        // 新路径（或首次）：记下基线，不触发刷新
                        baselines.insert(path.clone(), mtime);
                    }
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
            watched: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            next_window: Mutex::new(0),
            main_ready: Mutex::new(false),
        })
        .setup(move |app| {
            // 初始文件（argv/env 或冷启动双击）登记到 main 窗口的 pending，供其前端来取。
            if let Some(p) = initial {
                app.state::<AppState>()
                    .pending
                    .lock()
                    .unwrap()
                    .insert("main".to_string(), p);
            }
            spawn_file_watcher(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            // 窗口关闭：清掉它在 watched/pending 的条目，避免轮询已关窗口的文件。
            if let tauri::WindowEvent::Destroyed = event {
                let label = window.label().to_string();
                if let Some(state) = window.try_state::<AppState>() {
                    // 用 if-let-Ok 而非 unwrap：万一某锁被毒化也不级联 panic 掉事件线程。
                    if let Ok(mut w) = state.watched.lock() {
                        w.remove(&label);
                    }
                    if let Ok(mut p) = state.pending.lock() {
                        p.remove(&label);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_opened_file,
            read_file,
            write_file,
            set_target_file,
            open_in_new_window,
            read_dir_tree,
            export_docx
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // 双击 .md / “打开方式” 选本 app 时触发，携带 file:// URL
            if let tauri::RunEvent::Opened { urls } = event {
                if let Some(path) = urls.iter().filter_map(|u| u.to_file_path().ok()).next() {
                    let Some(state) = app_handle.try_state::<AppState>() else {
                        return;
                    };
                    let main_ready = *state.main_ready.lock().unwrap();
                    if main_ready {
                        // app 已在运行 + 主窗口已就绪 → 桌面双击开「新窗口」（独立窗口诉求）。
                        let _ = spawn_doc_window(
                            app_handle,
                            Some(path.to_string_lossy().to_string()),
                            None,
                        );
                    } else {
                        // 冷启动首个文件 → 交给主窗口，其前端 get_opened_file 来取。
                        state
                            .pending
                            .lock()
                            .unwrap()
                            .insert("main".to_string(), path);
                    }
                }
            }
        });
}
