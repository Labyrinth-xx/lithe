// 编排层：把「文件树侧边栏」「顶部标签」和 main.ts 的编辑器状态串起来。
// 自己只持有 UI 状态（tabsState / treeState），编辑器状态仍归 main.ts 所有，
// 通过 WorkspaceBridge 单向调用 main 的 switchToFile / saveNow / showSample。
//
// Delete Path（删除侧边栏+标签整套）：
//   1. 删 src/workspace.ts、src/tabs/、src/file-tree/
//   2. main.ts 去掉 workspace import 与 init/openFile/ensureFolderFor 调用，
//      还原 open-file 监听与 after 启动逻辑为「直接 setValue + loadCurrent」
//   3. index.html 还原为只有 #editor + #statusbar；styles.css 删 #tabbar/#sidebar/#tree/.tab/.tree-* 规则
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
let tabs: TabsState = EMPTY_TABS;
let tree: TreeState = EMPTY_TREE;

function renderAllTabs(): void {
  renderTabs(tabbarEl, tabs, {
    onActivate: (p) => void activate(p),
    onClose: (p) => void close(p),
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

/** 启动：拿到 bridge + 容器，绑定「选择文件夹」「折叠侧栏」按钮，首帧渲染。 */
export function initWorkspace(b: WorkspaceBridge): void {
  bridge = b;
  tabbarEl = document.querySelector<HTMLElement>("#tabbar")!;
  treeEl = document.querySelector<HTMLElement>("#tree")!;

  document
    .querySelector<HTMLButtonElement>("#pick-folder")
    ?.addEventListener("click", () => void pickFolder());
  document
    .querySelector<HTMLButtonElement>("#sidebar-toggle")
    ?.addEventListener("click", () =>
      document.body.classList.toggle("sidebar-collapsed")
    );

  renderAllTabs();
  renderAllTree();
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
