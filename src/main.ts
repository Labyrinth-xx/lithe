import Vditor from "vditor";
import "vditor/dist/index.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { decideExternalChange } from "./sync-logic";

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

/** 把磁盘内容放进编辑器，期间屏蔽自动存盘。 */
function applyContent(content: string): void {
  loading = true;
  vditor.setValue(content);
  dirty = false;
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
  setStatus(basename(currentPath), "未保存…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY);
}

async function saveNow(): Promise<void> {
  if (!currentPath || !dirty) return;
  const content = vditor.getValue();
  try {
    await invoke("write_file", { path: currentPath, content });
    dirty = false;
    lastWrittenContent = content; // 记下自己写的内容，供回声抑制
    setStatus(basename(currentPath), "已保存");
  } catch (e) {
    setStatus(basename(currentPath), String(e));
  }
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
  vditor = new Vditor("editor", {
    mode: "ir",
    height: "100%",
    cdn: "/vditor",
    cache: { enable: false },
    value: "",
    toolbar: [],
    preview: { hljs: { lineNumber: false } },
    input: () => scheduleSave(),
    after: async () => {
      currentPath = await invoke<string | null>("get_opened_file");
      void loadCurrent();
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

  // app 已在运行时，又双击了另一个 .md
  void listen<string>("open-file", async (e) => {
    if (dirty) await saveNow();
    currentPath = e.payload;
    void loadCurrent();
  });
});
