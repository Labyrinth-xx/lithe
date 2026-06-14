// 多窗口：开新窗口 + 判断拖拽落点是否在当前窗口外（标签拖出判定）。
// 纯封装 Tauri 窗口 API，供 workspace / main 调用，避免 invoke 散落各处。
//
// Delete Path（删除多窗口功能）：
//   1. 删 src/windows.ts
//   2. tab-view.ts 去掉 onTearOut/onOpenInNewWindow 回调与 draggable/右键菜单；
//      workspace.ts 去掉 tearOutTab；main.ts 去掉 Cmd+N 与 windows import
//   3. lib.rs 删 open_in_new_window 命令；capabilities 删窗口创建/查询权限

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** 开一个新窗口：path 为文件则新窗口加载它，null 则空白新文档（Cmd+N 用）。
 *  传 x/y（拖出松手处的逻辑屏幕坐标）时在该位置打开，否则系统居中。 */
export async function openInNewWindow(
  path: string | null,
  x?: number,
  y?: number
): Promise<void> {
  try {
    await invoke("open_in_new_window", { path, x: x ?? null, y: y ?? null });
  } catch (e) {
    console.error("开新窗口失败：", e);
  }
}

/** 拖拽落点是否落在当前窗口矩形之外——用于标签拖出判定。
 *  dragend 的 screenX/Y 是 CSS（逻辑）像素，窗口 outerPosition/Size 是物理像素，
 *  乘缩放比统一到物理像素再比。测不准时返回 false（当作没拖出，宁可不开窗）。 */
export async function isOutsideCurrentWindow(
  screenX: number,
  screenY: number
): Promise<boolean> {
  try {
    const win = getCurrentWindow();
    const [pos, size, scale] = await Promise.all([
      win.outerPosition(),
      win.outerSize(),
      win.scaleFactor(),
    ]);
    const px = screenX * scale;
    const py = screenY * scale;
    return (
      px < pos.x ||
      py < pos.y ||
      px > pos.x + size.width ||
      py > pos.y + size.height
    );
  } catch (e) {
    console.error("窗口边界检测失败：", e);
    return false;
  }
}
