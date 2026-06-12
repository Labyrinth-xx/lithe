// 路径小工具：纯字符串处理，前端各处共用，避免重复实现。

/** 取路径最后一段（文件名）。 */
export function basename(p: string): string {
  return p.split("/").pop() || p;
}

/** 取父目录路径；根下文件返回 "/"。 */
export function parentDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}
