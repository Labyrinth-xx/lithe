// 渲染文件树 DOM：递归画目录/文件，目录可展开折叠，文件点击回调出去。
// 纯展示层：不持有状态，每次 render 由 workspace 传入最新 TreeState。
//
// Delete Path：见 src/file-tree/tree-data.ts 顶部说明。

import type { TreeNode, TreeState } from "./tree-data";

export interface TreeViewCallbacks {
  /** 点了某个 .md 文件 */
  onOpenFile: (path: string) => void;
  /** 点了某个目录的展开/折叠箭头 */
  onToggleDir: (path: string) => void;
}

/** 把整棵树渲染进 #tree 容器。activePath 用于高亮当前文件。 */
export function renderTree(
  container: HTMLElement,
  state: TreeState,
  activePath: string | null,
  cb: TreeViewCallbacks
): void {
  container.replaceChildren();
  if (!state.root) {
    container.appendChild(hint("点「选择文件夹」或双击一个 .md 打开"));
    return;
  }
  if (state.root.children.length === 0) {
    container.appendChild(hint("该文件夹没有 Markdown 文件"));
    return;
  }
  // 根目录的孩子直接平铺（不重复画根目录名一行）
  for (const child of state.root.children) {
    renderNode(container, child, 0, state.expanded, activePath, cb);
  }
}

function renderNode(
  container: HTMLElement,
  node: TreeNode,
  depth: number,
  expanded: ReadonlySet<string>,
  activePath: string | null,
  cb: TreeViewCallbacks
): void {
  const row = document.createElement("div");
  row.className = "tree-row";
  row.style.paddingLeft = `${8 + depth * 14}px`;
  row.title = node.path;

  if (node.isDir) {
    const open = expanded.has(node.path);
    row.classList.add("tree-dir");
    row.textContent = `${open ? "▾" : "▸"} ${node.name}`;
    row.addEventListener("click", () => cb.onToggleDir(node.path));
    container.appendChild(row);
    if (open) {
      for (const child of node.children) {
        renderNode(container, child, depth + 1, expanded, activePath, cb);
      }
    }
  } else {
    row.classList.add("tree-file");
    if (node.path === activePath) row.classList.add("active");
    row.textContent = node.name;
    row.addEventListener("click", () => cb.onOpenFile(node.path));
    container.appendChild(row);
  }
}

function hint(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "tree-hint";
  el.textContent = text;
  return el;
}
