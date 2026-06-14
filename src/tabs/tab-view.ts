// 按 TabsState 渲染顶部标签行 DOM，并把点击/关闭/拖出/右键回调出去。
// 纯展示层：不持有状态，每次 render 由 workspace 传入最新 state；不直接碰 Tauri。
//
// Delete Path：见 src/tabs/tab-state.ts 顶部说明。

import type { TabsState } from "./tab-state";

export interface TabViewCallbacks {
  /** 点了某个标签（切文件） */
  onActivate: (path: string) => void;
  /** 点了某个标签的关闭叉 */
  onClose: (path: string) => void;
  /** 标签被拖拽松手：报告落点屏幕坐标，由上层判断是否拖出成新窗口 */
  onTearOut?: (path: string, screenX: number, screenY: number) => void;
  /** 右键「在新窗口打开」 */
  onOpenInNewWindow?: (path: string) => void;
}

/** 把标签行渲染进 #tabbar。整段重渲，标签数量有限、开销可忽略。 */
export function renderTabs(
  container: HTMLElement,
  state: TabsState,
  cb: TabViewCallbacks
): void {
  closeTabMenu(); // 重渲时先收起可能残留的右键菜单
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
  close.addEventListener("pointerdown", (e) => e.stopPropagation()); // 别触发标签拖拽
  close.addEventListener("click", (e) => {
    e.stopPropagation(); // 别冒泡成「激活」
    cb.onClose(path);
  });
  el.appendChild(close);

  bindTabPointer(el, path, name, cb);

  // 右键：弹一个单项菜单「在新窗口打开」（拖拽的稳定等价入口）。
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showTabMenu(e.clientX, e.clientY, path, cb);
  });

  return el;
}

/** 拖动判定阈值（屏幕像素）：超过才算「拖」，否则算「点击」。 */
const DRAG_THRESHOLD = 6;

/** 用指针事件（而非 HTML5 拖放）处理标签的点击与拖出：
 *  - 没移动 → 点击 → 激活标签
 *  - 移动超阈值后松手，且落点在窗口外 → 拖出成新窗口（交给上层判断窗外）
 *  拖动期间在窗口内显示跟随光标的虚影（出了窗口边缘 webview 画不到，属框架局限）。
 *  关键：指针拖拽不接入系统拖放，绝不会往桌面丢 .textclipping；按住时即便光标移出窗口，
 *  pointerup 仍会回到本窗口（系统隐式捕获），故「窗外松手」判定可靠。 */
function bindTabPointer(el: HTMLElement, path: string, name: string, cb: TabViewCallbacks): void {
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; // 仅左键
    const startX = e.screenX;
    const startY = e.screenY;
    let dragging = false;
    let ghost: HTMLElement | null = null;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.screenX - startX, ev.screenY - startY) > DRAG_THRESHOLD) {
        dragging = true;
        el.classList.add("dragging");
        ghost = document.createElement("div");
        ghost.className = "tab-ghost";
        ghost.textContent = name;
        document.body.appendChild(ghost);
      }
      if (ghost) {
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
      }
    };
    const cleanup = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", cleanup);
      el.classList.remove("dragging");
      ghost?.remove();
    };
    const onUp = (ev: PointerEvent) => {
      cleanup();
      if (dragging) cb.onTearOut?.(path, ev.screenX, ev.screenY);
      else cb.onActivate(path); // 没拖动 = 普通点击
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", cleanup); // 拖拽被系统取消也清理 ghost
  });
}

/** 收起当前的标签右键菜单（若有）。 */
function closeTabMenu(): void {
  document.querySelector(".tab-menu")?.remove();
}

/** 在 (x,y) 弹出单项右键菜单。点菜单项或点别处即收起。 */
function showTabMenu(x: number, y: number, path: string, cb: TabViewCallbacks): void {
  closeTabMenu();
  const menu = document.createElement("div");
  menu.className = "tab-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const item = document.createElement("button");
  item.type = "button";
  item.className = "tab-menu-item";
  item.textContent = "在新窗口打开";
  item.addEventListener("click", () => {
    cb.onOpenInNewWindow?.(path);
    closeTabMenu();
  });
  menu.appendChild(item);

  document.body.appendChild(menu);
  // 下一拍再挂全局关闭监听，避免本次右键的事件立刻把菜单关掉。
  setTimeout(() => {
    document.addEventListener("pointerdown", closeTabMenu, { once: true });
  }, 0);
}
