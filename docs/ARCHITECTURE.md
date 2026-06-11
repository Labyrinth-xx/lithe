# Markdown Reader — 架构说明

> 活文档：架构有变动（新增/删除模块、依赖变化）就同步更新。

## 项目目标

一个本地 Mac 桌面应用，替代 Typora 用于「读 Markdown + 行内 `//` 批注」。核心诉求：
1. **所见即所得**（类 Typora 即时渲染编辑）
2. **不锁文件** + **外部改动自动刷新**（CC 在后台改文件，窗口实时更新）

## 技术栈

- **外壳**：Tauri v2（Rust）—— 用 macOS 原生 WKWebView，体积小
- **编辑内核**：Vditor 3（IR 即时渲染模式）—— 静态资源本地化在 `public/vditor/`，断网可用
- **前端**：原生 TypeScript + Vite（无框架）

## 目录结构

```
markdown-reader/
├─ src/                    # 前端
│  ├─ main.ts              # 编排：初始化编辑器/加载文件/自动存盘/外部刷新/快捷键
│  ├─ sync-logic.ts        # 纯函数：外部变动决策（ignore/reload/conflict），可单测
│  ├─ styles.css           # 布局 + 标题字号兜底
│  └─ index.html(根目录)   # 编辑器容器 + 状态栏
├─ src-tauri/
│  ├─ src/lib.rs           # Rust：文件读写命令 + 双击打开 + 后台轮询监测
│  ├─ tauri.conf.json      # 文件关联 + 窗口/打包配置
│  └─ capabilities/default.json  # 权限（含 window:set-title）
├─ public/vditor/          # Vditor 运行时资源（本地化，~23MB）
├─ test-sync-logic.ts      # sync-logic 单测（node 直接跑）
└─ docs/                   # 本架构文档 + 模块卡
```

## 核心数据流

```
双击 .md ──► macOS Launch Services ──► RunEvent::Opened(file URL)
                                            │ 存入 AppState.target_file
                                            ▼
前端就绪 ──► invoke get_opened_file ──► invoke read_file ──► Vditor.setValue (渲染)

用户打字 ──► input 事件 ──(防抖500ms)──► invoke write_file (std::fs 写, 不持句柄)
                                            │ 记 lastWrittenContent
                                            ▼
CC 后台改文件 ──► Rust 轮询线程(每秒看 mtime) ──► emit "file-changed"(磁盘内容)
                                            ▼
            decideExternalChange(磁盘, 编辑器, lastWritten, dirty)
              ├─ ignore   : 自存回声 / 已同步 → 不动
              ├─ reload   : 真外部改动且无未存 → setValue 刷新
              └─ conflict : 真外部改动且有未存 → 弹确认让用户裁决
```

## 关键设计决策

- **文件读写走 Rust std::fs，不走 JS fs 插件**：免 capability scope 配置；std::fs 读写即开即关、**不持文件句柄 → 天然不锁文件**（Typora 的病根）。
- **外部监测用轮询而非文件监听库**：每秒看一次 mtime，简单、跨平台无坑、自动适配换文件；对单文件开销可忽略。
- **回声抑制靠 `lastWrittenContent` 精确比对**：避免自动存盘被误判为外部改动（曾导致光标乱跳的竞态，已修）。
