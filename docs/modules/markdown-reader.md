# Markdown Reader（整个应用）

> 本项目是单一功能应用，这张卡覆盖全部。最重要的是 Delete Path（干净卸载）。

## Entrypoint（入口）
- **GUI**：双击 `.md` / `.markdown` 文件 → 用 Markdown Reader 打开（macOS 文件关联）
- **代码入口**：`src-tauri/src/lib.rs` 的 `run()`；前端 `src/main.ts` 的 DOMContentLoaded
- **开发期**：`MD_READER_FILE=/path/to.md npm run tauri dev`

## Depends（依赖）
- 内部模块：none（单体应用）
- 外部包/服务：
  - Tauri v2（Rust 外壳）
  - Vditor 3（编辑器内核，资源本地化在 `public/vditor/`）
  - Vite + TypeScript（前端构建）
  - 系统 Chrome（仅开发期自测用 playwright 驱动，运行时不需要）

## Owns（拥有的数据）
- 代码目录：`/Users/zzx/Code/AI_code/md-reader/`
- 安装产物：`/Applications/Markdown Reader.app`
- 打包产物：`src-tauri/target/release/bundle/`（.app + .dmg）
- macOS 注册：Launch Services 里登记为 `.md`/`.markdown` 处理程序（identifier `com.zzx.markdownreader`）
- **不拥有任何用户文档**：只读写用户主动打开的那个 .md 文件，不建自己的数据库/配置目录

## Delete Path（干净卸载路径）
1. 退出 app（⌘Q）
2. 删安装的应用：`rm -rf "/Applications/Markdown Reader.app"`
3. 删项目源码：`rm -rf /Users/zzx/Code/AI_code/md-reader`
4. 注销 Launch Services 关联：
   `/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -u "/Applications/Markdown Reader.app"`
5. 把 `.md` 默认打开程序改回去（如之前是 VS Code）：
   `duti -s com.microsoft.VSCode md all`
6. （可选）删 app 缓存：`rm -rf ~/Library/WebKit/com.zzx.markdownreader ~/Library/Caches/com.zzx.markdownreader`
7. 删本卡片自己

> 卸载后系统与原状态一致，无残留后台进程（app 不常驻、无 launchd 项）。
