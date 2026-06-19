# DEVLOG — Lithe

## 2026-06-19 — 工具栏交互打磨：悬浮提示 + 图标重绘 + 文件夹抽屉 + 大纲靠右

### 完成内容
- **悬浮提示修复**：Vditor 工具栏提示默认朝上弹，被顶部标签栏 + `overflow:hidden` 裁掉，鼠标悬浮看不到按钮名。改 CSS 让所有工具栏提示统一朝下弹（`.vditor-toolbar .vditor-tooltipped::after/::before`）。
- **文件夹/保存图标重绘**：原图标被 Vditor 的 `fill:currentColor;stroke-width:0` 强填成黑团。改为描边（空心）风格——SVG 用 `fill:none`，并加针对性 CSS（`.lithe-folder-toggle/.lithe-save-btn/.lithe-outline-btn svg`）改回 `stroke:currentColor` 细线，和其余按钮观感一致。
- **侧栏 → 文件夹浮窗（左侧抽屉）**：去掉常驻左栏，文件树改为由文件夹按钮唤出的左侧边缘抽屉（贴最左、工具栏下方到状态栏上方）。选中文件即开档并收起；点窗外/再点按钮/改窗口大小都收起。`#workspace` 改单列、编辑区铺满。
- **大纲靠右**：大纲按钮 `float:right` 顶到工具栏最右边缘；换成层级线条自绘图标（原为 Vditor 的 align-center，看着像“居中排版”）；面板改从右侧打开（`outline.position:"right"`）；保留 `name:"outline"` 沿用内置开关行为。

### 关键决策
- 用 object 覆盖内置 `outline` 的 icon/className（`mergeToolbar` 的 `Object.assign` 合并）而非全自定义，保留内置“开关大纲面板”逻辑、不用自己重接。
- 文件夹定位用 JS 设 `top`（按钮底边）+ CSS 固定 `left:0/bottom`，保证“从最左侧打开”且不依赖固定工具栏高度。

### 遗留问题 / 下次继续
- `toggleFolderPopover` 已加 `popoverEl` 空值守卫（按钮可能在 Vditor `after` 回调前被点）。
- 次要：`mousedown/resize` 监听用匿名函数、无清理（当前 `initWorkspace` 只调一次，无害）。

## 2026-06-13（夜）— 工具栏重排：文件夹/保存并入编辑工具栏

### 完成内容
- **保存 + 文件夹按钮并入 Vditor 编辑工具栏最左侧**（同一行：文件夹 → 保存 → ┃ → 编辑项）。`toolbar.ts` 改为 `buildToolbar({onToggleSidebar,onSave})`，用 Vditor `IMenuItem`（icon/className/tip/click）注入两个自定义按钮。
- **侧栏默认收起**：`<body class="sidebar-collapsed">`；工具栏文件夹按钮点击切换侧栏显隐，按钮上小箭头（`.lithe-chevron`，CSS `transform-box:fill-box` 旋转 90°）作展开状态提示。
- 撤掉上一轮的 `#topbar`/底部 `#save-btn`，顶部恢复纯 `#tabbar`；保存图标仍线条风。

### 关键决策
- **注入 Vditor 工具栏而非自建一行**：满足「文件夹、保存、编辑项同一行」诉求，且复用 Vditor 既有工具栏样式；经查 `vditor/dist/types/index.d.ts` 的 `IMenuItem` 确认支持自定义 icon+click，非臆测。

## 2026-06-13（傍晚）— 关闭保存确认 + 保存按钮移位/换图标

### 完成内容
- **关窗未保存确认（Word 式）**：`onCloseRequested` 拦截关窗——已有磁盘文件 → 静默存盘后 `destroy`；未命名新文档 → 自建三按钮模态（保存/不保存/取消，新文件 `src/unsaved-dialog.ts`）。保存走另存为，取消另存为则不关。capabilities 加 `core:window:allow-destroy`。
- **保存按钮移到左上角**：从底部状态栏移到新建的 `#topbar`（保存按钮 + 标签栏并排），背景/边框从 `#tabbar` 上移到 `#topbar`。
- **保存图标换线条风**：去掉 💾 emoji，改用 stroke SVG（Feather save 风格，`currentColor` 跟随主题），与界面其他符号风格统一、更干净。

### 关键决策
- **关窗策略分流**：已存文件静默保存（本应用自动保存哲学，不打扰）；只有未命名新文档才弹确认（真正会丢内容的场景）。空白未编辑的新窗口 `dirty=false`，关窗不弹。
- **三按钮自建模态**：系统 dialog 插件只有两按钮，无法做「保存/不保存/取消」，故自建轻量模态。

## 2026-06-13（下午）— 多窗口体验打磨 + 新建/另存为

### 完成内容
- **修拖出 bug**：原用 HTML5 拖放，拖到桌面被 macOS 当文本生成 `.textclipping`。改为纯指针拖拽（pointerdown/move/up + setPointerCapture），不接入系统拖放，不再污染桌面；拖动期窗口内显示跟随光标的虚影（出窗口不可见＝webview 框架局限，已如实告知用户）。
- **拖出窗口在松手处打开**：`open_in_new_window` 加 x/y 逻辑屏幕坐标，`WebviewWindowBuilder.position` 在松手点开窗（负坐标钳为 0）；右键入口与 ⌘N 仍居中。
- **新建文档 + 另存为（Word 式）**：无路径文档现为空白可编辑；`scheduleSave` 对无路径文档不自动写盘，`saveNow` 无路径时走 `saveAsNew`（plugin-dialog `save` 选位置）→ 写盘后采纳路径、建标签、开监听、此后自动保存。capabilities 加 `dialog:allow-save`。
- **状态栏加「💾 保存」按钮**（点 = saveNow，新文档触发另存为）。
- **去掉 ⌘W**（用户暂不需要），连带删除 workspace 的 closeActiveTab/hasActiveTab/closingTab。

### 关键决策 / 说明
- **保存策略**：已存盘文件 = 停输入 500ms 自动保存（准实时）；未命名新文档 = 不自动存，需手动 ⌘S/按钮选位置另存为后才进入自动保存（同 Word）。
- **真·浏览器式拖拽虚影做不到**：webview 内容无法绘制到窗口外，跨桌面实时窗口预览需原生代码，Tauri 不支持；折中＝窗口内虚影 + 松手处开窗。

## 2026-06-13 — 多窗口：标签拖出 / 新开窗口

### 完成内容
- 实现「同时看两个文档」= 多独立窗口（用户明确偏好独立窗口自由摆桌面，而非应用内分屏）。三个入口：标签**拖出**窗口外 / 右键**「在新窗口打开」** / **⌘N** 开新空窗口；附带 **⌘W** 关当前标签。
- 后端从「单文件监听」升级为「按窗口管理」：`AppState` 换成 `watched`/`pending`/`next_window`；`set_target_file`/`get_opened_file` 按 `window.label()` 取键；新增 `open_in_new_window` 命令（`WebviewWindowBuilder` 建窗，label `doc-N`）；监听线程改盯所有窗口文件的并集、通知载荷带 `path`；窗口关闭清理条目；`RunEvent::Opened` 改只发聚焦窗口。
- 前端：新建 `src/windows.ts`（开窗 + 拖拽窗外判定）；`tab-view.ts` 加 draggable/dragend/右键单项菜单；`workspace.ts` 加 `tearOutTab`（存盘→开窗→移除，唯一标签 no-op）；`main.ts` 的 `file-changed` 按 `payload.path === currentPath` 过滤，只刷新本窗口在看的文件。
- 配置：capabilities 加窗口创建/查询/关闭权限，`windows` glob 扩到 `["main","doc-*"]`。
- **桌面双击分流**（追加）：app 运行中再从 Finder 双击 .md → 开**新窗口**（而非在现有窗口加标签），冷启动首个文件仍用主窗口；侧边栏点文件仍是当前窗口加标签。靠 `AppState.main_ready`（主窗口 get_opened_file 取过初始文件即置位）区分冷启动与运行中；抽 `spawn_doc_window` 给命令与 `RunEvent::Opened` 共用；删掉前端已无人 emit 的 `open-file` 监听。

### 关键决策
- **多窗口而非分屏**：每个 Tauri 窗口本就是同一前端的独立实例，复用现有单编辑器模型，无需重构成分屏多实例；也契合用户「窗口自由摆放」诉求。
- **拖出 = 移动语义**：拖出后原窗口移除该标签；唯一标签拖出视为 no-op（它本就独占一窗）。
- **拖出前先存盘**：拖出当前未存盘文件时先 saveNow，避免新窗口从磁盘读到旧内容的竞态。
- **⌘W 关最后标签显示示例、不自动关窗**；无标签时放行让系统原生关窗。
- **file-changed 载荷带 path**：多窗口下广播改动，各窗口按自己 currentPath 过滤，杜绝「A 的改动套到 B」串味。

### 遗留问题 / 下次继续
- 拖出边界检测靠屏幕坐标×缩放比换算，极端多显示器/缩放场景可能需微调阈值（右键 + ⌘N 为可靠兜底，功能不缺）。
- 两个窗口打开**同一文件**的并发编辑冲突未专门处理，沿用现有 conflict 弹窗。
- 额外标签快捷键（⌘1~9 跳转 / Ctrl+Tab 循环 / 拖动重排）本期未做，留待后续。

## 2026-06-12 — 改名 Lithe + 作品集门面

### 完成内容
- 定方向：放弃「打市场」，按「自己每天用 + 作品集」轻装发布（市场调研结论见 `~/.claude/plans/md-typora-skill-generic-sphinx.md`）。
- 全项目从 Markdown Reader / md-reader 改名 **Lithe**：productName / identifier(`com.zzx.lithe`) / 窗口标题 / package 名 / Rust crate(`lithe` + `lithe_lib`) / 文档。
- 新品牌图标：「钢笔尖＝向下箭头」靛紫方块（源文件 `src-tauri/icons/icon-source.svg`，`tauri icon` 生成全套）。
- 重写 README 为作品集级（含「不锁文件 + 与 AI agent 实时调和编辑」技术亮点 + 构建/安装说明）；加 MIT LICENSE。

### 关键决策
- 名字选 Lithe：12 个候选里唯一同类目零撞车（首选 Marco 已被同名 Markdown 编辑器占用，淘汰）。
- 「AI 协同」从市场卖点降级为作品集技术亮点——调研显示该需求用户尚未成规模喊出（详见 plan 第一节）。
- 内部 localStorage 键 `md-reader-theme` 保留不改（改了会清掉已存主题偏好，且对用户不可见）。

### 遗留问题 / 下次继续
- README 截图待补（`docs/screenshots/`，自用时截或让我用 run skill 自动截）。
- 日用功能（Find&Replace ⌘F、图片粘贴本地化）等「自己用顺」后按真实摩擦再做。

## 2026-06-12 — 梯队二（上）：文件树侧边栏 + 浏览器式标签页

### 完成内容
- **文件树侧边栏**：新增 Rust `read_dir_tree` 命令，递归列文件夹内所有 `.md`（目录在前/文件在后排序、剪空分支、深度上限 12、跳 symlink）；前端 `src/file-tree/`（纯状态 `tree-data.ts` + 递归渲染 `tree-view.ts`）支持子文件夹展开折叠、点文件切换。「选择文件夹」按钮走 `tauri-plugin-dialog`，双击打开文件时自动带出同目录。
- **顶部浏览器式标签页**：新增 `src/tabs/`（纯不可变状态 `tab-state.ts` + 渲染 `tab-view.ts`）；每开一个文件一个标签，并排顶端，点标签切换，标签显示文件名 + 未保存圆点 + 关闭叉。
- **编排层 `src/workspace.ts`**：把文件树 ↔ 标签 ↔ main 串起来，main 仅经 `WorkspaceBridge`（switchToFile/saveNow/showSample）被调用，编辑器状态仍集中在 main。
- **布局重排**：`index.html` + `styles.css` 从「编辑器 + 固定底栏」改为 grid 三行（标签栏 / 工作区[侧栏+编辑器] / 状态栏），保留 `#editor` 挂载点，侧栏可折叠，全部深色态联动。
- **灵魂机制要害**：新增 `set_target_file` 命令，`switchToFile` 切文件时「存旧 → 重接后端轮询 → 载新」，后端没改成功就中止切换；关掉最后一个标签 `set_target_file(null)` 让轮询闲置。

### 关键决策
- **切文件必经后端重接轮询**：轮询盯后端 `target_file` 非前端 `currentPath`，是本批最大暗坑；先 set_target_file 成功再提交 currentPath，让「轮询↔编辑器」永不脱钩。
- **标签 dirty 不变量**：只有 active 可脏 → 圆点镜像 main 的单个 dirty，不每标签存储。
- **vertical slice + 干净删除路径**：tabs/ file-tree/ workspace 各带 Delete Path 注释，整套可一次性摘除。

### 自测手段
- `npm run build`（tsc + vite）通过；`src-tauri` `cargo check` 通过；`node test-sync-logic.ts` 6/6（sync-logic 未碰）。
- 独立 code-reviewer 审 diff：0 CRITICAL；2 HIGH 已修（set_target_file 失败时中止切换并回滚、关最后标签时清空后端目标）+ 关闭切换失败时回滚标签。确认四条灵魂机制（不锁文件/轮询跟随切换后的新文件/回声抑制/防抖存盘）完好。
- 待用户 `npm run tauri dev` 真窗口烟测：见 `~/.claude/plans/` 本批计划的「验证」清单，重点验「切到 B 后外部改 B → 1s 内刷新」证明轮询已重接。

### 遗留问题 / 下次继续
- 梯队二（下）：查找替换（⌘F/⌘H）、图片粘贴存本地 assets。梯队三：导出 HTML/PDF、最近文件、源码模式。

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
