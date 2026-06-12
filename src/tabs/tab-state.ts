// 顶部标签页状态：纯不可变数据 + 纯函数，不碰 DOM、不碰编辑器。
// 每个改动函数返回新状态，绝不就地修改（遵循 immutability 红线）。
//
// 关键不变量：一次只有 active 文件在编辑器里，切走前总会先存盘，
// 所以任意时刻最多只有 active 标签是 dirty，非 active 标签恒为已保存。
//
// 依赖 ../utils 的 basename（与 main.ts 共用，勿在此重复实现）。
//
// Delete Path（删除标签功能）：
//   1. 删 src/tabs/ 整个目录
//   2. workspace.ts 去掉 TabsState 相关编排
//   3. index.html 删 #tabbar；styles.css 删 #tabbar/.tab 规则

import { basename } from "../utils";

export interface OpenTab {
  readonly path: string;
  readonly name: string; // basename，预算好供渲染
  readonly dirty: boolean;
}

export interface TabsState {
  readonly tabs: readonly OpenTab[];
  readonly activePath: string | null;
}

export const EMPTY_TABS: TabsState = { tabs: [], activePath: null };

/** 打开（或激活已存在的）标签。已存在则只切 active，不重复加。 */
export function addTab(s: TabsState, path: string): TabsState {
  if (s.tabs.some((t) => t.path === path)) {
    return { ...s, activePath: path };
  }
  const tab: OpenTab = { path, name: basename(path), dirty: false };
  return { tabs: [...s.tabs, tab], activePath: path };
}

/** 切到已存在的标签；不存在则原样返回。 */
export function activateTab(s: TabsState, path: string): TabsState {
  if (!s.tabs.some((t) => t.path === path)) return s;
  return { ...s, activePath: path };
}

/** 关闭标签，并算出关闭后应激活谁（关的是 active 时取相邻一个，否则保持原 active）。 */
export function closeTab(
  s: TabsState,
  path: string
): { state: TabsState; nextActive: string | null } {
  const idx = s.tabs.findIndex((t) => t.path === path);
  if (idx === -1) return { state: s, nextActive: s.activePath };

  const tabs = s.tabs.filter((t) => t.path !== path);
  if (s.activePath !== path) {
    return { state: { tabs, activePath: s.activePath }, nextActive: s.activePath };
  }
  // 关的正是 active：优先取右邻，没有则取左邻，再没有则空
  const nextActive = tabs.length === 0 ? null : (tabs[idx] ?? tabs[idx - 1]).path;
  return { state: { tabs, activePath: nextActive }, nextActive };
}

/** 设置 active 标签的 dirty（镜像 main.ts 的单个 dirty 标志）。 */
export function setActiveDirty(s: TabsState, dirty: boolean): TabsState {
  if (s.activePath === null) return s;
  return {
    ...s,
    tabs: s.tabs.map((t) => (t.path === s.activePath ? { ...t, dirty } : t)),
  };
}
