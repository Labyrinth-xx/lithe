// 工具栏：把「文件夹（展开/收起侧栏）」「保存」做成最左侧两个自定义按钮，
// 后面接 Typora 风格的常用编辑项，全部排在 Vditor 工具栏同一行。
// 觉得编辑项太满就改 EDIT_ITEMS；自定义按钮的字段见 vditor 的 IMenuItem。

/** 工具栏项：字符串(内置项/分隔符) 或 自定义按钮对象。 */
type ToolbarItem =
  | string
  | {
      name: string;
      className?: string;
      tip?: string;
      tipPosition?: string;
      icon?: string;
      click?: (event: Event) => void;
    };

export interface ToolbarHandlers {
  /** 文件夹按钮：展开/收起侧栏文件树。 */
  onToggleSidebar: () => void;
  /** 保存按钮：存盘（新文档触发另存为）。 */
  onSave: () => void;
}

// 文件夹图标 + 右侧小箭头（.lithe-chevron，侧栏展开时由 CSS 旋转 90° 作状态提示）。
const FOLDER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.5a1 1 0 0 1 1-1h3.6l1.6 1.8H15a1 1 0 0 1 1 1V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><polyline class="lithe-chevron" points="19.5 9 22 12 19.5 15"/></svg>`;

// 保存图标：线条风（Feather save），与界面其他符号统一。
const SAVE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;

// 故意不放 edit-mode（源码/分屏切换）—— 留到后续梯队，避免与 ir 加载时序交互。
const EDIT_ITEMS: ToolbarItem[] = [
  "headings",
  "bold",
  "italic",
  "strike",
  "|",
  "list",
  "ordered-list",
  "check",
  "|",
  "quote",
  "code",
  "inline-code",
  "|",
  "table",
  "link",
  "|",
  "undo",
  "redo",
  "|",
  "outline",
  "fullscreen",
];

/** 组装完整工具栏：文件夹 + 保存 + 分隔 + 编辑项。 */
export function buildToolbar(h: ToolbarHandlers): ToolbarItem[] {
  return [
    {
      name: "lithe-folder",
      className: "lithe-folder-toggle",
      tip: "文件夹",
      tipPosition: "n",
      icon: FOLDER_ICON,
      click: () => h.onToggleSidebar(),
    },
    {
      name: "lithe-save",
      className: "lithe-save-btn",
      tip: "保存（⌘S）",
      tipPosition: "n",
      icon: SAVE_ICON,
      click: () => h.onSave(),
    },
    "|",
    ...EDIT_ITEMS,
  ];
}
