// 精选工具栏：对标 Typora 的常用项，保持干净。
// 觉得太满就在这里删项；想加按钮就在这里加（合法名见 Vditor 文档 / index.d.ts 的 ITips）。
// 故意不放 edit-mode（源码/分屏切换）—— 留到后续梯队，避免与 ir 加载时序交互。

export const TOOLBAR: Array<string | { name: string }> = [
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
