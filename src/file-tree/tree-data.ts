// 文件树状态：纯不可变数据 + 纯函数。TreeNode 结构与 Rust read_dir_tree 返回一一对应。
//
// Delete Path（删除文件树侧边栏）：
//   1. 删 src/file-tree/ 整个目录
//   2. workspace.ts 去掉 TreeState 相关编排
//   3. lib.rs 删 read_dir_tree/build_node/TreeNode；capabilities 删 dialog:allow-open
//   4. index.html 删 #folder-popover；styles.css 删 #folder-popover/#tree 规则

export interface TreeNode {
  readonly name: string;
  readonly path: string;
  readonly isDir: boolean;
  readonly children: readonly TreeNode[];
}

export interface TreeState {
  readonly root: TreeNode | null;
  readonly expanded: ReadonlySet<string>; // 展开的目录 path 集合
}

export const EMPTY_TREE: TreeState = { root: null, expanded: new Set() };

/** 设新根，并默认展开根目录本身。 */
export function setRoot(root: TreeNode): TreeState {
  return { root, expanded: new Set([root.path]) };
}

/** 切换某目录的展开/折叠，返回新状态（新 Set，不就地改）。 */
export function toggleExpanded(s: TreeState, path: string): TreeState {
  const next = new Set(s.expanded);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return { ...s, expanded: next };
}
