// 深色/浅色主题切换：默认跟随系统偏好，用户切换后记到 localStorage。
// 一处搞定编辑器皮肤 + 内容主题 + 代码高亮主题，并给 body 加 dark class 供状态栏响应。
//
// Delete Path（删除本功能）：
//   1. 删本文件 src/theme.ts
//   2. main.ts 去掉 initTheme/toggleTheme 的 import 与调用
//   3. index.html 删 #theme-toggle 按钮
//   4. styles.css 删 body.dark 相关规则

import type Vditor from "vditor";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "md-reader-theme";
// 与 main.ts 的 `cdn: "/vditor"` 对应；改 cdn 时这里要同步。
export const CONTENT_THEME_PATH = "/vditor/dist/css/content-theme";

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function readStored(): ThemeMode | null {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : null;
}

/** 解析初始主题：localStorage 优先，否则跟随系统。供构造 Vditor 前定初值用，避免首帧闪烁。 */
export function getPreferredTheme(): ThemeMode {
  return readStored() ?? (systemPrefersDark() ? "dark" : "light");
}

/** 切换编辑器皮肤 / 内容主题 / 代码高亮，并同步 body.dark。 */
function apply(vditor: Vditor, mode: ThemeMode): void {
  if (mode === "dark") {
    vditor.setTheme("dark", "dark", "github-dark", CONTENT_THEME_PATH);
    document.body.classList.add("dark");
  } else {
    vditor.setTheme("classic", "light", "github", CONTENT_THEME_PATH);
    document.body.classList.remove("dark");
  }
}

let current: ThemeMode = "light";

/** 初始化：按 getPreferredTheme 决定并应用。返回当前主题。 */
export function initTheme(vditor: Vditor): ThemeMode {
  current = getPreferredTheme();
  apply(vditor, current);
  return current;
}

/** 切换并持久化。返回切换后的主题。 */
export function toggleTheme(vditor: Vditor): ThemeMode {
  current = current === "dark" ? "light" : "dark";
  apply(vditor, current);
  localStorage.setItem(STORAGE_KEY, current);
  return current;
}
