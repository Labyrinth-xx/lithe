import Vditor from "vditor";
import "vditor/dist/index.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { decideExternalChange } from "./sync-logic";
import { TOOLBAR } from "./toolbar";
import {
  initWorkspace,
  openFile,
  ensureFolderFor,
  reflectDirty,
} from "./workspace";
import {
  initTheme,
  toggleTheme,
  getPreferredTheme,
  CONTENT_THEME_PATH,
  type ThemeMode,
} from "./theme";

const SAMPLE = `# Markdown Reader

没有指定文件时显示这段示例。双击一个 \`.md\` 文件即可加载真实文档。

在句子后面用 // 标注你的问题，例如 //这里我想问你
`;

const SAVE_DELAY = 500; // 停止输入后多久自动存盘（毫秒）

let vditor: Vditor;
let currentPath: string | null = null;
let dirty = false;
let loading = false; // setValue 期间为 true，避免把“加载”误当成“用户编辑”触发存盘
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastWrittenContent: string | null = null; // 本程序最后写盘/载入的内容，用于回声抑制

function basename(p: string): string {
  return p.split("/").pop() || p;
}

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

/** 加载 currentPath 指向的文件；无路径则显示示例。 */
async function loadCurrent(): Promise<void> {
  if (!currentPath) {
    applyContent(SAMPLE);
    setStatus("示例文档（未打开文件）", "");
    setTitle("Markdown Reader");
    return;
  }
  try {
    const content = await invoke<string>("read_file", { path: currentPath });
    applyContent(content);
    setStatus(basename(currentPath), "已加载");
    setTitle(`${basename(currentPath)} — Markdown Reader`);
  } catch (e) {
    setStatus(basename(currentPath), String(e));
  }
}

function scheduleSave(): void {
  if (loading || !currentPath) return;
  dirty = true;
  reflectDirty(true); // active 标签亮起未保存圆点
  setStatus(basename(currentPath), "未保存…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), SAVE_DELAY);
}

/** 立即存盘。返回是否成功——切换文件时据此决定要不要中止（存盘失败不丢编辑）。 */
async function saveNow(): Promise<boolean> {
  if (!currentPath || !dirty) return true;
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
    toolbar: TOOLBAR,
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

  // ⌘S / Ctrl+S 立即保存
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      dirty = true;
      void saveNow();
    }
  });

  // 外部文件变动 → 实时刷新
  void listen<string>("file-changed", (e) => handleExternalChange(e.payload));

  // app 已在运行时，又双击了另一个 .md → 新开标签 + 切换 + 带出其文件夹
  void listen<string>("open-file", async (e) => {
    const path = e.payload;
    await openFile(path);
    await ensureFolderFor(path);
  });
});
