// 按 TabsState 渲染顶部标签行 DOM，并把点击/关闭回调出去。
// 纯展示层：不持有状态，每次 render 由 workspace 传入最新 state。
//
// Delete Path：见 src/tabs/tab-state.ts 顶部说明。

import type { TabsState } from "./tab-state";

export interface TabViewCallbacks {
  /** 点了某个标签（切文件） */
  onActivate: (path: string) => void;
  /** 点了某个标签的关闭叉 */
  onClose: (path: string) => void;
}

/** 把标签行渲染进 #tabbar。整段重渲，标签数量有限、开销可忽略。 */
export function renderTabs(
  container: HTMLElement,
  state: TabsState,
  cb: TabViewCallbacks
): void {
  container.replaceChildren();
  for (const tab of state.tabs) {
    container.appendChild(buildTab(tab.path, tab.name, tab.dirty, tab.path === state.activePath, cb));
  }
}

function buildTab(
  path: string,
  name: string,
  dirty: boolean,
  active: boolean,
  cb: TabViewCallbacks
): HTMLElement {
  const el = document.createElement("div");
  el.className = active ? "tab active" : "tab";
  el.title = path;

  const label = document.createElement("span");
  label.className = "tab-name";
  label.textContent = name;
  el.appendChild(label);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "tab-close";
  // dirty 时显示圆点，hover 时仍可点关闭；非 dirty 显示叉
  close.textContent = dirty ? "●" : "✕";
  close.title = "关闭";
  close.addEventListener("click", (e) => {
    e.stopPropagation(); // 别冒泡成「激活」
    cb.onClose(path);
  });
  el.appendChild(close);

  el.addEventListener("click", () => cb.onActivate(path));
  return el;
}
