// 关闭未保存新文档时的「保存 / 不保存 / 取消」确认弹窗（Word 式）。
// 系统 dialog 插件只有两个按钮，这里自建三按钮的轻量模态，返回用户选择。
//
// Delete Path：删 src/unsaved-dialog.ts；main.ts 去掉 onCloseRequested 里的引用；
//   styles.css 删 .modal-* 规则。

export type CloseChoice = "save" | "dont" | "cancel";

/** 弹出三按钮确认框，返回用户选择的 Promise。Esc / 点遮罩 = 取消。 */
export function confirmUnsavedClose(): Promise<CloseChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const box = document.createElement("div");
    box.className = "modal-box";

    const msg = document.createElement("div");
    msg.className = "modal-msg";
    msg.textContent = "有未保存的新文档，关闭前要保存吗？";

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    const done = (choice: CloseChoice) => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(choice);
    };
    const mkBtn = (label: string, choice: CloseChoice, primary = false): HTMLButtonElement => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.className = primary ? "modal-btn primary" : "modal-btn";
      b.addEventListener("click", () => done(choice));
      return b;
    };

    // 取消 / 不保存 / 保存（主按钮在右）
    actions.append(
      mkBtn("取消", "cancel"),
      mkBtn("不保存", "dont"),
      mkBtn("保存", "save", true)
    );
    box.append(msg, actions);
    overlay.append(box);

    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) done("cancel"); // 点遮罩空白 = 取消
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") done("cancel");
    };
    document.addEventListener("keydown", onKey);

    document.body.append(overlay);
  });
}
