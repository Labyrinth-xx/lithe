# Lithe（整个应用）

> 本项目是单一功能应用，这张卡覆盖全部。最重要的是 Delete Path（干净卸载）。

## Entrypoint（入口）
- **GUI**：双击 `.md` / `.markdown` 文件 → 用 Lithe 打开（macOS Launch Services 文件关联 / Windows 安装包注册的文件关联）
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
- 代码目录：`<项目根>/`（本仓库 clone 后的路径）
- 安装产物：macOS `/Applications/Lithe.app`；Windows `%LOCALAPPDATA%\Programs\Lithe\`（NSIS 默认「仅为我安装」）
- 打包产物：`src-tauri/target/release/bundle/`（macOS .app + .dmg；Windows nsis/*.exe + msi/*.msi）
- macOS 注册：Launch Services 里登记为 `.md`/`.markdown` 处理程序（identifier `com.zzx.lithe`）
- Windows 注册：注册表 `HKCU\Software\Classes\`（`.md`/`.markdown` 关联 + 卸载项）
- **不拥有任何用户文档**：只读写用户主动打开的那个 .md 文件，不建自己的数据库/配置目录

## Delete Path（干净卸载路径）

### macOS
1. 退出 app（⌘Q）
2. 删安装的应用：`rm -rf "/Applications/Lithe.app"`
3. 删项目源码：`rm -rf <项目根>`
4. 注销 Launch Services 关联：
   `/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -u "/Applications/Lithe.app"`
5. 把 `.md` 默认打开程序改回去（如之前是 VS Code）：
   `duti -s com.microsoft.VSCode md all`
6. （可选）删 app 缓存：`rm -rf ~/Library/WebKit/com.zzx.lithe ~/Library/Caches/com.zzx.lithe`
7. 删本卡片自己

### Windows
1. 退出 app
2. 设置 → 应用 → 已安装的应用 → **Lithe** → 卸载（卸载程序会一并清掉 `.md`/`.markdown` 文件关联与注册表项）
3. 把 `.md` 默认打开程序改回去：右键任意 `.md` → 打开方式 → 选择其他应用 → 始终使用
4. （可选）删残留 WebView2 用户数据：`%LOCALAPPDATA%\com.zzx.lithe`
5. 删项目源码（若 clone 过）：`rmdir /s /q <项目根>`

> 卸载后系统与原状态一致，无残留后台进程（app 不常驻、不装服务/计划任务）。
> 注：WebView2 运行时是系统级组件（Win11 自带），别卸——其他软件也在用。
