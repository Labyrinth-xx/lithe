// 编排层：把「文件树侧边栏」「顶部标签」和 main.ts 的编辑器状态串起来。
// 自己只持有 UI 状态（tabsState / treeState），编辑器状态仍归 main.ts 所有，
// 通过 WorkspaceBridge 单向调用 main 的 switchToFile / saveNow / showSample。
//
// Delete Path（删除侧边栏+标签整套）：
//   1. 删 src/workspace.ts、src/tabs/、src/file-tree/
//   2. main.ts 去掉 workspace import 与 init/openFile/ensureFolderFor 调用，
//      还原 open-file 监听与 after 启动逻辑为「直接 setValue + loadCurrent」
//   3. index.html 还原为只有 #editor + #statusbar；styles.css 删 #tabbar/#folder-popover/#tree/.tab/.tree-* 规则
//   4. lib.rs 删 set_target_file/read_dir_tree；Cargo.toml/capabilities/package.json 删 dialog 依赖

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  EMPTY_TABS,
  addTab,
  activateTab,
  closeTab,
  setActiveDirty,
  type TabsState,
} from "./tabs/tab-state";
import { renderTabs } from "./tabs/tab-view";
import {
  EMPTY_TREE,
  setRoot,
  toggleExpanded,
  type TreeNode,
  type TreeState,
} from "./file-tree/tree-data";
import { renderTree } from "./file-tree/tree-view";
import { parentDir } from "./utils";
import { openInNewWindow, isOutsideCurrentWindow } from "./windows";

/** main.ts 暴露给 workspace 的编辑器操作（workspace 只调这三个，不碰编辑器内部状态）。 */
export interface WorkspaceBridge {
  /** 存旧文件→改后端 target→载新文件。返回是否切换成功（存盘失败会中止）。 */
  switchToFile: (path: string) => Promise<boolean>;
  /** 立即存盘，返回是否成功。 */
  saveNow: () => Promise<boolean>;
  /** 无文件态：currentPath=null 显示示例。 */
  showSample: () => Promise<void>;
}

let bridge: WorkspaceBridge;
let tabbarEl: HTMLElement;
let treeEl: HTMLElement;
let popoverEl: HTMLElement;
let tabs: TabsState = EMPTY_TABS;
let tree: TreeState = EMPTY_TREE;

function renderAllTabs(): void {
  renderTabs(tabbarEl, tabs, {
    onActivate: (p) => void activate(p),
    onClose: (p) => void close(p),
    onTearOut: (p, x, y) => void maybeTearOut(p, x, y),
    onOpenInNewWindow: (p) => void tearOutTab(p),
  });
}

function renderAllTree(): void {
  renderTree(treeEl, tree, tabs.activePath, {
    onOpenFile: (p) => void openFile(p),
    onToggleDir: (p) => {
      tree = toggleExpanded(tree, p);
      renderAllTree();
    },
  });
}

/** 启动：拿到 bridge + 容器，绑定「选择文件夹」按钮 + 浮窗外点关闭，首帧渲染。 */
export function initWorkspace(b: WorkspaceBridge): void {
  bridge = b;
  tabbarEl = document.querySelector<HTMLElement>("#tabbar")!;
  treeEl = document.querySelector<HTMLElement>("#tree")!;
  popoverEl = document.querySelector<HTMLElement>("#folder-popover")!;

  document
    .querySelector<HTMLButtonElement>("#pick-folder")
    ?.addEventListener("click", () => void pickFolder());

  // 点浮窗外（且不是文件夹按钮——它由 toggle 自己处理）→ 收起浮窗。
  document.addEventListener("mousedown", (e) => {
    if (popoverEl.hidden) return;
    const t = e.target as HTMLElement;
    if (popoverEl.contains(t) || t.closest(".lithe-folder-toggle")) return;
    closeFolderPopover();
  });
  // 窗口尺寸变了浮窗锚点会失准，直接收起更稳妥。
  window.addEventListener("resize", () => closeFolderPopover());

  renderAllTabs();
  renderAllTree();
}

/** 顶部文件夹按钮：开关左侧抽屉式浮窗（贴窗口最左边，从工具栏下方一直到状态栏上方）。
 *  只动态设 top（紧贴工具栏底部）；left=0、bottom 由 CSS 固定，保证“从最左侧打开”。 */
export function toggleFolderPopover(): void {
  if (!popoverEl) return; // initWorkspace 尚未跑完（按钮在 Vditor after 回调前就可点）→ 忽略
  if (popoverEl.hidden) {
    const rect = document
      .querySelector<HTMLElement>(".lithe-folder-toggle")
      ?.getBoundingClientRect();
    if (rect) popoverEl.style.top = `${Math.round(rect.bottom)}px`;
    popoverEl.hidden = false;
  } else {
    closeFolderPopover();
  }
}

function closeFolderPopover(): void {
  popoverEl.hidden = true;
}

/** 打开（或激活）一个文件：先切文件（存旧→载新），成功后再建标签 + 高亮。
 *  顺序很关键：切换内部会存旧文件并清掉旧 active 标签的圆点（reflectDirty），
 *  必须在 activePath 还指向旧文件时发生，所以「先 switch 再 addTab」。 */
export async function openFile(path: string): Promise<void> {
  const ok = await bridge.switchToFile(path);
  if (!ok) return; // 切换被中止（旧文件存盘失败）—保持原标签与高亮
  tabs = addTab(tabs, path);
  renderAllTabs();
  renderAllTree();
  closeFolderPopover(); // 选完文件即收起浮窗（阅读流：弹出→挑文件→消失）
}

/** 未命名新文档「另存为」成功后：内容已在编辑器、已写盘，这里只补建标签 + 高亮 + 带出文件夹，
 *  不触发 switchToFile（无需重载，避免把刚写的内容又从盘读一遍）。 */
export async function adoptNewFile(path: string): Promise<void> {
  tabs = addTab(tabs, path);
  renderAllTabs();
  renderAllTree();
  await ensureFolderFor(path);
}

async function activate(path: string): Promise<void> {
  if (path === tabs.activePath) return;
  const ok = await bridge.switchToFile(path);
  if (!ok) return;
  tabs = activateTab(tabs, path);
  renderAllTabs();
  renderAllTree();
}

async function close(path: string): Promise<void> {
  const wasActive = path === tabs.activePath;
  const prev = tabs; // 切换失败时回滚用
  const { state, nextActive } = closeTab(tabs, path);
  tabs = state;
  renderAllTabs();
  if (!wasActive) return; // 关的是后台标签，编辑器不动
  if (nextActive) {
    if (!(await bridge.switchToFile(nextActive))) {
      tabs = prev; // 切换被中止（存盘失败）→ 恢复被关的标签，不丢未存编辑
      renderAllTabs();
      return;
    }
  } else {
    await bridge.showSample(); // 没标签了 → 回示例
  }
  renderAllTree();
}

/** 拖拽松手：落点在窗口外才拖出，落在窗口内当普通拖动忽略。 */
async function maybeTearOut(path: string, screenX: number, screenY: number): Promise<void> {
  if (await isOutsideCurrentWindow(screenX, screenY)) await tearOutTab(path, screenX, screenY);
}

/** 把一个标签拖出/移到新窗口（浏览器式「移动」语义）：开新窗口装它，再从本窗口移除。
 *  唯一标签视为 no-op——它本就独占一窗，拖出没意义。
 *  若拖出的是当前未存盘文件，先存盘，确保新窗口从磁盘读到最新内容（避免竞态）。
 *  x/y 为松手处的屏幕坐标，传给后端在该处开窗（右键入口不传 → 居中）。 */
async function tearOutTab(path: string, x?: number, y?: number): Promise<void> {
  if (tabs.tabs.length <= 1) return;
  if (path === tabs.activePath && !(await bridge.saveNow())) return; // 存盘失败则中止
  await openInNewWindow(path, x, y);
  await close(path); // 复用关闭逻辑：是 active 则自动切到相邻标签
}

/** 选文件夹按钮：弹系统目录选择框，选中则载入该文件夹的树（不动编辑器）。 */
async function pickFolder(): Promise<void> {
  const dir = await open({ directory: true, multiple: false });
  if (typeof dir === "string") await loadFolder(dir);
}

/** 读取文件夹的 .md 树并渲染。 */
export async function loadFolder(path: string): Promise<void> {
  try {
    const root = await invoke<TreeNode>("read_dir_tree", { path });
    tree = setRoot(root);
    renderAllTree();
  } catch (e) {
    console.error("读取文件夹失败：", e);
  }
}

/** 文件被打开时，若树为空或该文件不在当前根下，则自动带出它所在的文件夹。 */
export async function ensureFolderFor(path: string): Promise<void> {
  if (tree.root && path.startsWith(tree.root.path + "/")) return;
  await loadFolder(parentDir(path));
}

/** main.ts dirty 变化时回调：把 dirty 镜像到 active 标签的圆点。 */
export function reflectDirty(dirty: boolean): void {
  tabs = setActiveDirty(tabs, dirty);
  renderAllTabs();
}
