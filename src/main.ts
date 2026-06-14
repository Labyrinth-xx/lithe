import Vditor from "vditor";
import "vditor/dist/index.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save } from "@tauri-apps/plugin-dialog";
import { decideExternalChange } from "./sync-logic";
import { confirmUnsavedClose } from "./unsaved-dialog";
import { buildToolbar } from "./toolbar";
import { basename } from "./utils";
import {
  initWorkspace,
  openFile,
  ensureFolderFor,
  adoptNewFile,
  reflectDirty,
} from "./workspace";
import { openInNewWindow } from "./windows";
import {
  initTheme,
  toggleTheme,
  getPreferredTheme,
  CONTENT_THEME_PATH,
  type ThemeMode,
} from "./theme";

declare const __APP_VERSION__: string; // 由 vite define 在构建期注入（见 vite.config.ts）

const SAVE_DELAY = 500; // 停止输入后多久自动存盘（毫秒）

let vditor: Vditor;
let currentPath: string | null = null;
let dirty = false;
let loading = false; // setValue 期间为 true，避免把“加载”误当成“用户编辑”触发存盘
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastWrittenContent: string | null = null; // 本程序最后写盘/载入的内容，用于回声抑制

function setStatus(file: string, state: string): void {
  const fileEl = document.querySelector<HTMLElement>("#status-file");
  const stateEl = document.querySelector<HTMLElement>("#status-state");
  if (fileEl) fileEl.textContent = file;
  if (stateEl) stateEl.textContent = state;
}

function setTitle(name: string): void {
  void getCurrentWindow().setTitle(name);
}

/** 主题切换按钮图标随当前主题更新。 */
function updateThemeButton(mode: ThemeMode): void {
  const btn = document.querySelector<HTMLButtonElement>("#theme-toggle");
  if (btn) btn.textContent = mode === "dark" ? "☀️" : "🌙";
}

/** 把磁盘内容放进编辑器，期间屏蔽自动存盘。 */
function applyContent(content: string): void {
  loading = true;
  vditor.setValue(content);
  dirty = false;
  reflectDirty(false); // 清掉 active 标签的未保存圆点
  lastWrittenContent = content; // 编辑器与磁盘此刻一致
  setTimeout(() => {
    loading = false;
  }, 50);
}

/** 加载 currentPath 指向的文件；无路径则给一篇空白的「未命名」新文档（可编辑、⌘S 另存为）。 */
async function loadCurrent(): Promise<void> {
  if (!currentPath) {
    applyContent("");
    setStatus("未命名（新文档）", "⌘S 保存到本地");
    setTitle("未命名 — Lithe");
    return;
  }
  try {
    const content = await invoke<string>("read_file", { path: currentPath });
    applyContent(content);
    setStatus(basename(currentPath), "已加载");
    setTitle(`${basename(currentPath)} — Lithe`);
  } catch (e) {
    setStatus(basename(currentPath), String(e));
  }
}

function scheduleSave(): void {
  if (loading) return;
  if (!dirty) reflectDirty(true); // 仅在 false→true 翻转时刷标签圆点，避免每次按键重建标签栏
  dirty = true;
  if (!currentPath) {
    // 未命名新文档：没有磁盘位置，不自动写盘，等用户 ⌘S 选位置另存为。
    setStatus("未命名（新文档）", "未保存 · ⌘S 保存到本地");
    return;
  }
  setStatus(basename(currentPath), "未保存…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), SAVE_DELAY);
}

/** 立即存盘。返回是否成功——切换文件时据此决定要不要中止（存盘失败不丢编辑）。
 *  无路径（未命名新文档）→ 走「另存为」让用户选位置。 */
async function saveNow(): Promise<boolean> {
  if (!currentPath) return saveAsNew();
  if (!dirty) return true;
  const content = vditor.getValue();
  try {
    await invoke("write_file", { path: currentPath, content });
    dirty = false;
    reflectDirty(false);
    lastWrittenContent = content; // 记下自己写的内容，供回声抑制
    setStatus(basename(currentPath), "已保存");
    return true;
  } catch (e) {
    setStatus(basename(currentPath), String(e));
    return false;
  }
}

/** 未命名新文档「另存为」：弹系统保存框选位置+文件名，写盘后采纳为当前文件
 *  （建标签、让后端开始监听、此后自动保存）。用户取消或失败返回 false。 */
async function saveAsNew(): Promise<boolean> {
  const content = vditor.getValue();
  let target: string | null;
  try {
    target = await save({
      title: "保存到本地",
      defaultPath: "未命名.md",
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
  } catch (e) {
    setStatus("未命名（新文档）", String(e));
    return false;
  }
  if (!target) return false; // 用户取消
  try {
    await invoke("write_file", { path: target, content });
  } catch (e) {
    setStatus("未命名（新文档）", String(e));
    return false;
  }
  currentPath = target; // 采纳新路径
  lastWrittenContent = content;
  dirty = false;
  try {
    await invoke("set_target_file", { path: target }); // 后端开始监听该文件
  } catch (e) {
    console.error("设置监听目标失败：", e);
  }
  await adoptNewFile(target); // workspace 建标签 + 带出所在文件夹
  reflectDirty(false);
  setStatus(basename(target), "已保存");
  setTitle(`${basename(target)} — Lithe`);
  return true;
}

/** 关窗时若有未保存改动的处理：
 *  - 已有磁盘文件 → 静默存盘后关（本应用本就自动保存，无需打扰）。
 *  - 未命名新文档 → 弹「保存/不保存/取消」（Word 式）。保存走另存为；取消则不关。 */
async function handleUnsavedClose(win: ReturnType<typeof getCurrentWindow>): Promise<void> {
  if (currentPath) {
    if (await saveNow()) await win.destroy(); // 存盘失败则不关，避免丢内容
    return;
  }
  const choice = await confirmUnsavedClose();
  if (choice === "cancel") return; // 不关
  if (choice === "save" && !(await saveNow())) return; // 取消了另存为对话框 → 不关
  await win.destroy(); // 保存成功 或 不保存 → 关闭窗口
}

/** 切换当前文件：存旧 → 改后端 target → 载新。返回是否切换成功。
 *  灵魂机制要害：set_target_file 必须在 loadCurrent 之前，把后台轮询改盯新文件，
 *  否则切换后「外部改动自动刷新」仍盯旧文件、对新文件失灵。 */
async function switchToFile(path: string): Promise<boolean> {
  if (path === currentPath) return true;
  if (dirty && !(await saveNow())) return false; // 旧文件存盘失败 → 中止切换
  clearTimeout(saveTimer); // 取消旧文件待发的防抖存盘
  // 先把后端轮询改盯新文件；改不成功就不切，绝不让「轮询」与「编辑器」脱钩。
  try {
    await invoke("set_target_file", { path });
  } catch (e) {
    setStatus(basename(path), String(e));
    return false;
  }
  currentPath = path; // 后端已就位，再提交前端指针
  await loadCurrent();
  return true;
}

/** 无文件态：存好当前改动后清空 currentPath + 让后端停止轮询，显示示例。供关掉最后一个标签时用。 */
async function showSample(): Promise<void> {
  if (dirty) await saveNow();
  clearTimeout(saveTimer);
  currentPath = null;
  try {
    await invoke("set_target_file", { path: null }); // 清空后端目标，轮询线程闲置
  } catch (e) {
    console.error("清空后端目标失败：", e);
  }
  await loadCurrent();
}

/** 外部（如 CC 后台）改了文件时，后端轮询线程会推 file-changed。 */
function handleExternalChange(diskContent: string): void {
  if (!currentPath) return;
  const decision = decideExternalChange({
    diskContent,
    editorContent: vditor.getValue(),
    lastWrittenContent,
    dirty,
  });
  if (decision === "ignore") return;
  if (decision === "reload") {
    applyContent(diskContent);
    setStatus(basename(currentPath), "已按外部更新刷新");
    return;
  }
  // conflict：有未保存改动，交给用户裁决
  const ok = window.confirm(
    "文件被外部程序修改了。\n\n点“确定”：载入外部最新版本（丢弃我未保存的改动）\n点“取消”：保留我正在编辑的内容"
  );
  if (ok) {
    applyContent(diskContent);
    setStatus(basename(currentPath), "已按外部更新刷新");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  // 状态栏显示版本号（构建期注入，单一来源 package.json）。
  const verEl = document.querySelector<HTMLElement>("#status-version");
  if (verEl) verEl.textContent = `v${__APP_VERSION__}`;

  // 构造前先定初始主题，避免深色用户出现「先浅后深」的首帧闪烁。
  const initial = getPreferredTheme();
  const dark = initial === "dark";
  document.body.classList.toggle("dark", dark); // 让状态栏从第一帧就对

  vditor = new Vditor("editor", {
    mode: "ir",
    height: "100%",
    cdn: "/vditor",
    cache: { enable: false },
    value: "",
    toolbar: buildToolbar({
      onToggleSidebar: () => document.body.classList.toggle("sidebar-collapsed"),
      onSave: () => void saveNow(),
    }),
    counter: { enable: true, type: "text" },
    outline: { enable: false, position: "left" },
    theme: dark ? "dark" : "classic",
    preview: {
      hljs: { enable: true, lineNumber: false, style: dark ? "github-dark" : "github" },
      math: { engine: "KaTeX", inlineDigit: true },
      theme: { current: initial, path: CONTENT_THEME_PATH },
    },
    input: () => scheduleSave(),
    after: async () => {
      // vditor 已就绪：同步主题 + 绑定切换按钮（绑在这里避免 ready 前被点的竞态）。
      updateThemeButton(initTheme(vditor));
      document
        .querySelector<HTMLButtonElement>("#theme-toggle")
        ?.addEventListener("click", () => updateThemeButton(toggleTheme(vditor)));
      // 侧边栏 + 标签：把编辑器操作以 bridge 形式交给 workspace 编排。
      initWorkspace({ switchToFile, saveNow, showSample });
      const opened = await invoke<string | null>("get_opened_file");
      if (opened) {
        await openFile(opened); // 建标签 + 切到该文件
        await ensureFolderFor(opened); // 自动带出所在文件夹的 .md 树
      } else {
        void loadCurrent(); // 无指定文件 → 示例文档，树留空
      }
    },
  });
  (window as unknown as { __vditor: Vditor }).__vditor = vditor;

  // 快捷键：⌘S 存盘（新文档则另存为）/ ⌘N 开新空白文档窗口
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === "s") {
      e.preventDefault();
      dirty = true;
      void saveNow();
    } else if (k === "n") {
      e.preventDefault();
      void openInNewWindow(null); // 空白新文档窗口
    }
  });

  // 关窗前：有未保存改动则拦下处理（新文档弹保存确认，已存文件静默存盘）。
  const appWindow = getCurrentWindow();
  void appWindow.onCloseRequested((event) => {
    if (!dirty) return; // 无未保存 → 正常关
    event.preventDefault(); // 必须同步拦下，再异步处理
    void handleUnsavedClose(appWindow);
  });

  // 外部文件变动 → 实时刷新。payload 带 path，只认本窗口正在看的那份。
  void listen<{ path: string; content: string }>("file-changed", (e) => {
    if (e.payload.path !== currentPath) return;
    handleExternalChange(e.payload.content);
  });
  // 注：app 运行时再从桌面双击文件，后端直接开新窗口（见 lib.rs RunEvent::Opened），
  // 新窗口走 get_opened_file 取文件，故此处不再需要 "open-file" 事件监听。
});
