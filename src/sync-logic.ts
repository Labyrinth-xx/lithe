/**
 * 外部文件变动的处置决策（纯函数，便于单测）。
 *
 * 后台轮询发现目标文件 mtime 前进时，会把磁盘最新内容交给前端。
 * 前端要判断这究竟是「自己刚存的回声」「已同步」还是「真·外部改动」，
 * 避免把自己的自动保存误当成外部改动而重新灌回编辑器（会导致光标乱跳）。
 */
export type ExternalDecision = "ignore" | "reload" | "conflict";

export function decideExternalChange(args: {
  /** 轮询读到的磁盘内容 */
  diskContent: string;
  /** 编辑器当前内容 */
  editorContent: string;
  /** 本程序最后一次成功写盘的内容（没写过为 null） */
  lastWrittenContent: string | null;
  /** 编辑器是否有未保存改动 */
  dirty: boolean;
}): ExternalDecision {
  const { diskContent, editorContent, lastWrittenContent, dirty } = args;

  // 1) 磁盘内容正是我们自己最后写进去的 → 自存回声，铁定忽略（不管编辑器现在是什么）
  if (lastWrittenContent !== null && diskContent === lastWrittenContent) {
    return "ignore";
  }
  // 2) 磁盘内容已与编辑器一致 → 无需动作
  if (diskContent === editorContent) {
    return "ignore";
  }
  // 3) 真正的外部改动：编辑器有未保存改动则交由用户裁决，否则直接刷新
  return dirty ? "conflict" : "reload";
}
