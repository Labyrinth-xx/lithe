// 阅读模式：把当前 Markdown 用 Vditor.preview 渲染成只读 HTML，盖在工具栏下方。
// 只读 HTML 不是 contenteditable 编辑器，所以选中复制出去是纯文字（无 md 符号）——这是本功能的核心价值。
// 工具栏保留可见，#reader 顶部对齐到工具栏底部（高度运行时实测，窄窗换行也不错位）。
//
// Delete Path（删除本功能）：
//   1. 删本文件 src/reading-mode.ts
//   2. main.ts 去掉 import 与 initReadingMode/refreshIfReading 调用、buildToolbar 的 onToggleReadMode
//   3. toolbar.ts 删 BOOK_ICON/PEN_ICON、onToggleReadMode 字段、阅读模式按钮项
//   4. index.html 删 <div id="reader">
//   5. styles.css 删 #reader / #workspace.reading-mode / body.dark #reader / .lithe-read-mode-btn 相关规则

import Vditor from "vditor";
import { CONTENT_THEME_PATH } from "./theme";
import { BOOK_ICON, PEN_ICON } from "./toolbar";

/** 依赖：取当前 md 文本 + 当前是否深色。由 main.ts 注入，避免本模块直接依赖 vditor 实例。 */
export interface ReadingDeps {
  getMarkdown: () => string;
  isDark: () => boolean;
}

const READER_ID = "reader";
const WORKSPACE_ID = "workspace";
const BTN_SELECTOR = ".lithe-read-mode-btn";

let deps: ReadingDeps | null = null;
let reading = false;
let toolbarObserver: ResizeObserver | null = null;

function workspaceEl(): HTMLElement | null {
  return document.getElementById(WORKSPACE_ID);
}
function readerEl(): HTMLDivElement | null {
  return document.getElementById(READER_ID) as HTMLDivElement | null;
}
function toolbarEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".vditor-toolbar");
}

/** 把 #reader 顶部对齐到工具栏底部，露出工具栏（按钮才点得到）。 */
function syncReaderTop(): void {
  const reader = readerEl();
  const tb = toolbarEl();
  if (!reader || !tb) return;
  reader.style.top = `${tb.offsetHeight}px`;
}

/** 用 Vditor.preview 渲染只读 HTML。配置与 main.ts 的 preview 一致，保证深浅色/代码高亮/公式一致。 */
async function renderReader(markdown?: string): Promise<void> {
  const reader = readerEl();
  if (!reader || !deps) return;
  // 优先用调用方直接传入的内容（如切文件时直接传 content），避免依赖 vditor.setValue 后
  // getValue() 是否已同步完成的时序假设；未传则回退到取编辑器当前内容（切换/切主题场景）。
  const md = markdown ?? deps.getMarkdown();
  const dark = deps.isDark();
  try {
    await Vditor.preview(reader, md, {
      mode: dark ? "dark" : "light",
      cdn: "/vditor",
      hljs: { enable: true, lineNumber: false, style: dark ? "github-dark" : "github" },
      math: { engine: "KaTeX", inlineDigit: true },
      theme: { current: dark ? "dark" : "light", path: CONTENT_THEME_PATH },
    });
  } catch (e) {
    console.error("[reading-mode] 阅读区渲染失败", e);
  }
}

/** 切换工具栏按钮图标与提示：阅读态显示「笔」（点去编辑）、编辑态显示「书」（点去阅读）。
 *  注意：Vditor 把图标渲染在内层 <button data-type> 里，并把点击监听直接绑在那个 button 上。
 *  所以这里只替换内层的 <svg>，绝不动 <button> 本身——否则会连带删掉点击监听（点不动）+ 破坏对齐。 */
function swapButtonIcon(): void {
  const wrap = document.querySelector<HTMLElement>(BTN_SELECTOR);
  if (!wrap) return;
  const svg = wrap.querySelector("svg");
  if (svg) svg.outerHTML = reading ? PEN_ICON : BOOK_ICON;
  const inner = wrap.querySelector("button") ?? wrap;
  inner.setAttribute("aria-label", reading ? "编辑模式" : "阅读模式");
}

/** 应用当前模式：切 workspace class + 换图标；进阅读则对齐顶部并渲染。 */
function applyMode(): void {
  const ws = workspaceEl();
  if (!ws) return;
  ws.classList.toggle("reading-mode", reading);
  swapButtonIcon();
  if (reading) {
    syncReaderTop();
    void renderReader();
  }
}

/** 初始化：注入依赖、定默认模式、监听工具栏高度变化（窄窗换行时同步 #reader 顶部）。 */
export function initReadingMode(d: ReadingDeps, defaultReading: boolean): void {
  toolbarObserver?.disconnect(); // 防二次调用残留旧 observer（单页应用通常只调一次，留作保险）
  deps = d;
  reading = defaultReading;
  const tb = toolbarEl();
  if (tb && "ResizeObserver" in window) {
    toolbarObserver = new ResizeObserver(() => {
      if (reading) syncReaderTop();
    });
    toolbarObserver.observe(tb);
  }
  applyMode();
}

/** 切换阅读/编辑模式（工具栏按钮点击调用）。 */
export function toggleReadingMode(): void {
  reading = !reading;
  applyMode();
}

/** 内容或主题变化后，若正处于阅读模式则重渲染。可传 markdown 直接渲染（避免二次 getValue 时序问题）。 */
export function refreshIfReading(markdown?: string): void {
  if (!reading) return;
  syncReaderTop();
  void renderReader(markdown);
}
