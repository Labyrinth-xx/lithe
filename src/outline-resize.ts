// 给左侧大纲面板（Vditor 内置 .vditor-outline）加一个右边缘拖拽手柄，可改宽度。
// 删除路径：删本文件 + 删 main.ts 的 import/调用 + 删 styles.css 的 .lithe-outline-resizer 区块。

const MIN_W = 160; // 大纲最窄
const MAX_W = 520; // 大纲最宽

/** 把手柄的 left 对到大纲右沿，并按大纲显隐同步手柄显隐。 */
function syncHandle(outline: HTMLElement, handle: HTMLElement) {
  const visible = outline.style.display === "block";
  handle.style.display = visible ? "block" : "none";
  if (visible) {
    handle.style.left = outline.offsetWidth + "px";
  }
}

/** 在大纲右边缘加拖拽手柄；宽度只在本次会话有效，不持久化。 */
export function initOutlineResize() {
  const content = document.querySelector<HTMLElement>(".vditor-content");
  const outline = document.querySelector<HTMLElement>(".vditor-outline");
  if (!content || !outline) {
    return; // vditor 结构异常时安静退出，不影响主流程
  }
  if (content.querySelector(".lithe-outline-resizer")) {
    return; // 防重复初始化：已装过手柄就不再装第二个
  }

  const handle = document.createElement("div");
  handle.className = "lithe-outline-resizer";
  handle.style.display = "none";
  content.appendChild(handle); // content 是 position:relative，手柄绝对定位其内

  // 大纲开关是 Vditor 内部行为（改 style.display）→ 观察 DOM 同步手柄。
  const observer = new MutationObserver(() => syncHandle(outline, handle));
  observer.observe(outline, { attributes: true, attributeFilter: ["style"] });
  syncHandle(outline, handle);
  // 窗口缩放时 Vditor 会重排，但不改大纲宽度 → 仍重新对一下手柄位置，稳妥。
  window.addEventListener("resize", () => syncHandle(outline, handle));

  handle.addEventListener("mousedown", (event: MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startW = outline.offsetWidth;
    document.body.classList.add("outline-resizing");
    let rafPending = false;

    const onMove = (moveEvent: MouseEvent) => {
      const next = Math.min(MAX_W, Math.max(MIN_W, startW + moveEvent.clientX - startX));
      outline.style.width = next + "px";
      handle.style.left = next + "px";
      // 节流地触发 Vditor setPadding（它监听 window resize）重排工具栏/正文。
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          window.dispatchEvent(new Event("resize"));
        });
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onUp);
      document.body.classList.remove("outline-resizing");
      window.dispatchEvent(new Event("resize")); // 收尾再对齐一次
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    // 鼠标在 webview 外松开时 mouseup 不触发 → 用 window blur 兜底解除拖拽态。
    window.addEventListener("blur", onUp);
  });
}
