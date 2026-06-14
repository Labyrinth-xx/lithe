# 多窗口（标签拖出 / 新开窗口）

> 让 Lithe 像浏览器一样：把标签拖出成独立窗口、右键「在新窗口打开」、⌘N 开新窗口。
> 每个窗口都是同一份前端 app 的独立实例，复用「一窗口一编辑器」模型。

## Entrypoint（入口）
- **拖出**：抓住顶部标签拖到窗口外松手 → 该文件在**松手处**开新窗口，原窗口移除该标签。
  拖动期间窗口内有跟随光标的虚影（出窗口边缘即不可见——webview 画不到窗口外，框架局限）。
- **右键**：右键标签 →「在新窗口打开」（拖拽的稳定等价入口，居中打开）
- **快捷键**：`⌘N` 开新「空白新文档」窗口（写完 `⌘S` 另存为）
- **桌面双击**：app 运行中再从 Finder 双击 .md → 开**新窗口**（冷启动首个文件仍用主窗口）。
  侧边栏文件树点文件则仍在**当前窗口加标签**——「桌面双击=新窗口、侧边栏=标签」分流。
- **代码入口**：前端 `src/windows.ts`（开窗 + 窗外判定）；后端 `spawn_doc_window` /
  命令 `open_in_new_window` / `RunEvent::Opened`（`src-tauri/src/lib.rs`）

## Depends（依赖）
- 内部模块：`tabs/`（标签状态+渲染）、`workspace.ts`（编排 tearOutTab）、`main.ts`（快捷键 + file-changed 过滤）
- 外部包/服务：
  - Tauri 窗口 API：`WebviewWindowBuilder`（建窗）、`getCurrentWindow().outerPosition/outerSize/scaleFactor`（窗外判定）
  - capabilities 权限：`core:webview:allow-create-webview-window` + `core:window:allow-outer-position/outer-size/scale-factor/close`，且 `windows` glob 含 `doc-*`

## Owns（拥有的数据）
- 后端 `AppState`：
  - `watched: HashMap<窗口label, 文件路径>` —— 各窗口正在看的文件，监听线程盯其**并集**
  - `pending: HashMap<窗口label, 初始文件>` —— 新建窗口的初始文件，供该窗口 `get_opened_file` 来取
  - `next_window: u64` —— 自增计数，生成 `doc-1`/`doc-2`… 窗口 label
  - `main_ready: bool` —— 主窗口是否已取过初始文件；就绪后桌面双击一律开新窗口
- 文件监听通知载荷 `FileChange { path, content }`（带 path，前端按窗口 currentPath 过滤）
- 前端文件：`src/windows.ts`
- **不拥有用户文档**：仍只读写用户打开的 .md，多窗口不引入任何持久化

## Delete Path（干净删除多窗口功能，回到单窗口）
1. 删 `src/windows.ts`
2. `src/tabs/tab-view.ts`：删 `onTearOut`/`onOpenInNewWindow` 回调、`el.draggable`、`dragstart`/`dragend`/`contextmenu` 监听、`showTabMenu`/`closeTabMenu`
3. `src/workspace.ts`：删 `windows` import、`maybeTearOut`/`tearOutTab`/`closeActiveTab`/`hasActiveTab`，renderAllTabs 去掉两个新回调
4. `src/main.ts`：删 `windows` import 与 `closeActiveTab`/`hasActiveTab` import；keydown 去掉 ⌘N/⌘W 分支；`file-changed` 还原为 `listen<string>(..., (e) => handleExternalChange(e.payload))`
5. `src/styles.css`：删 `.tab-menu` / `.tab-menu-item` 及其 `body.dark` 变体
6. `src-tauri/src/lib.rs`：
   - `AppState` 还原为 `target_file: Mutex<Option<PathBuf>>`（删 watched/pending/next_window/main_ready）
   - `get_opened_file`/`set_target_file` 去掉 `window` 参数、还原读写 `target_file`（删 main_ready 置位）
   - 删 `spawn_doc_window` 与 `open_in_new_window` 命令、`FileChange` 结构体，invoke_handler 去掉 `open_in_new_window`
   - 监听线程还原为单文件 `seen` 版本、emit 纯 content
   - 删 `.on_window_event(...)` 清理块；`RunEvent::Opened` 还原为写 target_file + 广播 emit "open-file"
   - `src/main.ts` 还原 `listen("open-file", …)` 监听（多窗口版已删，单窗口版靠它加标签）
   - 去掉 `use std::collections::HashMap;`
7. `src-tauri/capabilities/default.json`：`windows` 还原为 `["main"]`，删新增的 4 条 window 权限 + create-webview-window
8. 删本卡片自己
