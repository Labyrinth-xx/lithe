# DEVLOG — Markdown Reader

## 2026-06-11 — 从零搭出本地 Markdown 阅读/批注桌面应用（替代 Typora）

### 完成内容
- **Stage 0/1**：Tauri v2 + Vditor(IR 即时渲染) 脚手架，所见即所得编辑跑通，Vditor 资源本地化（断网可用）。
- **Stage 2**：Rust std::fs 读写命令 + 前端防抖自动存盘(500ms)+⌘S。实测**不锁文件**（app 开着时终端可追加/覆盖，无 EPERM）。
- **Stage 3**：文件关联（双击 .md 用本 app 打开），RunEvent::Opened → AppState → 前端 get_opened_file。debug bundle 装到 /Applications 并 lsregister，实测打开正确。
- **Stage 4**：Rust 后台轮询线程监测外部改动 → emit → 前端实时刷新；冲突护栏（未保存时弹确认）。
- **Bug 修复（竞态）**：自动存盘被轮询误判为外部改动 → 重灌编辑器 → 光标乱跳/内容错乱。修复=记 `lastWrittenContent` 精确回声抑制，抽 `sync-logic.ts` + 6 用例单测，用户真窗口确认无乱跳。
- **Stage 5（进行中）**：正式 release 打包；架构文档/模块卡/本日志；待办：设默认打开程序、用户验收双击全流程。

### 关键决策
- 文件读写走 **Rust std::fs 而非 JS fs 插件**：免权限 scope + 天然不持句柄（不锁文件）。
- 外部监测用**轮询而非 fs-watch 库**：简单、跨平台无坑、自动适配换文件。
- 编辑器**不自研引擎**，嵌成熟开源 Vditor IR 模式（类 Typora）。

### 自测手段（新会话可复用）
- `node test-sync-logic.ts` —— 外部变动决策逻辑单测。
- `inspect.mjs`（playwright + 系统 Chrome 驱动 localhost:1420）—— 无头验证编辑器行为；注意 Tauri IPC(invoke/listen) 在纯 Chrome 不可用，只能验纯前端。

### 遗留问题 / 下次继续
- 设为 `.md` 默认打开程序（duti），用户验收双击全流程 + 实时刷新（正式版）。
- 可选：自定义应用图标（现用 Tauri 默认）；偶发懒加载 404（当前未复现，断网核心可用）。
- 未签名 app 首次打开需右键→打开一次（Gatekeeper），属一次性。
