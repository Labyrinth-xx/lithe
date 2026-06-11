# DEVLOG — Markdown Reader

## 2026-06-12 — 对标 Typora 第一批：编辑增强（点亮 Vditor 内置能力）

### 完成内容
- **启用工具栏**：精选常用项（标题/加粗/斜体/列表/引用/代码/表格/链接/撤销重做/大纲/全屏），抽到 `src/toolbar.ts`，原 `toolbar:[]` 替换。故意不放 `edit-mode`（留后续梯队，避免与 ir 加载时序交互）。
- **公式 / 高亮 / 图表**：`preview.math` 启用 KaTeX；`preview.hljs` 开 `enable` + 跟随主题的 code style；Mermaid 等资源已本地、IR 渲染管线自动处理。
- **字数统计**：`counter:{enable,type:"text"}`（Vditor 自带，显示在编辑区右下角）。
- **大纲面板**：`outline` 默认收起，工具栏按钮切换，Vditor 容器内自渲染，无需改布局。
- **深色/浅色主题切换**：新增 `src/theme.ts`（系统偏好 + localStorage + `setTheme` 同步皮肤/内容/代码主题 + `body.dark`）；状态栏加 `#theme-toggle` 按钮。构造 Vditor 前先定初值 + 提前设 `body.dark`，消除首帧闪烁；按钮事件绑在 `after` 内避免 ready 前竞态。

### 关键决策
- **第一批只点内置开关**：Vditor 已内置大半 Typora 能力且资源早已本地化，性价比最高；文件树/查找替换/导出等留作梯队二、三（见 `~/.claude/plans/` 计划）。
- **全部改动限于前端**：零新增 Rust 命令，不碰 sync-logic，灵魂机制（不锁文件/轮询刷新/回声抑制/防抖存盘）零风险——经独立 code-reviewer 确认四条机制未被破坏。
- **拆 toolbar.ts / theme.ts 独立小文件**：main.ts 保持编排角色。

### 自测手段
- `npm run build`（tsc + vite）通过；`node test-sync-logic.ts` 6/6 通过（确认 sync-logic 未波及）。
- 待用户在 `npm run tauri dev` 真窗口烟测：公式/Mermaid/表格/代码渲染、工具栏点按、大纲切换、字数刷新、主题切换记忆、以及自动存盘 + 外部刷新回归。

### 遗留问题 / 下次继续
- GUI 烟测待用户确认（尤其 Mermaid 在 IR 模式是否开箱即渲染；若不渲染查 `preview.markdown`）。
- 梯队二：文件树侧边栏、查找替换(⌘F/⌘H)、图片粘贴存本地 assets。

---

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
