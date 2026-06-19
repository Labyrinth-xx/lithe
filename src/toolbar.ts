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
  /** 文件夹按钮：开关文件夹浮窗（浏览/打开 .md）。 */
  onToggleFolder: () => void;
  /** 保存按钮：存盘（新文档触发另存为）。 */
  onSave: () => void;
}

// 这三个图标走描边（空心）风格——描边样式见 styles.css 的 .lithe-*-btn svg 规则。
// 文件夹图标：描边文件夹。
const FOLDER_ICON = `<svg viewBox="0 0 24 24"><path d="M3 6.5a1 1 0 0 1 1-1h4.2l1.6 1.8H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>`;

// 保存图标：描边软盘（Feather save）。
const SAVE_ICON = `<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;

// 大纲图标：描边的层级线条（两条满宽 + 两条缩进），读作“文档大纲/目录结构”——
// 替换 Vditor 内置 outline 用的 align-center 图标（那个看起来像“居中排版”）。
const OUTLINE_ICON = `<svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="8" y1="11" x2="21" y2="11"/><line x1="8" y1="15" x2="21" y2="15"/><line x1="3" y1="20" x2="21" y2="20"/></svg>`;

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
  "fullscreen",
  // 大纲：靠 CSS 的 float:right 顶到工具栏最右边缘（不跟左侧编辑组挤在一起）。
  // 用 object 覆盖内置 outline 的图标（换成层级线条）+ 加 className 供 float/描边样式命中，
  // 但保留 name:"outline" 以沿用内置的“开关大纲面板”行为（mergeToolbar 会 Object.assign 合并）。
  // tipPosition 用 sw：处于右边缘，提示向左下展开，避免被窗口右沿裁掉。
  {
    name: "outline",
    className: "lithe-outline-btn",
    icon: OUTLINE_ICON,
    tipPosition: "sw",
  },
];

/** 组装完整工具栏：文件夹 + 保存 + 分隔 + 编辑项。 */
export function buildToolbar(h: ToolbarHandlers): ToolbarItem[] {
  return [
    {
      name: "lithe-folder",
      className: "lithe-folder-toggle",
      tip: "文件夹（浏览/打开）",
      tipPosition: "s", // 工具栏在窗口顶部，提示统一向下弹，否则被标签栏裁掉
      icon: FOLDER_ICON,
      click: () => h.onToggleFolder(),
    },
    {
      name: "lithe-save",
      className: "lithe-save-btn",
      tip: "保存（⌘S）",
      tipPosition: "s",
      icon: SAVE_ICON,
      click: () => h.onSave(),
    },
    "|",
    ...EDIT_ITEMS,
  ];
}
