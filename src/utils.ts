// 路径小工具：纯字符串处理，前端各处共用，避免重复实现。
// 跨平台：分隔符按「路径里实际出现的」判断（Windows 反斜杠 / 其余斜杠），
// 不看运行平台——路径都来自后端，字符串自带答案。

/** 最后一个分隔符的下标；-1 表示没有分隔符。 */
function lastSep(p: string): number {
  return Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
}

/** 该路径用的分隔符：含反斜杠即 Windows 路径。 */
function sepOf(p: string): string {
  return p.includes("\\") ? "\\" : "/";
}

/** 取路径最后一段（文件名）。 */
export function basename(p: string): string {
  const i = lastSep(p);
  return i < 0 ? p : p.slice(i + 1) || p;
}

/** 取父目录路径；根下文件返回根（POSIX "/"、Windows "C:\"）。 */
export function parentDir(path: string): string {
  const i = lastSep(path);
  if (i <= 0) return "/"; // POSIX 根下的文件，或无分隔符（非绝对路径，实际用不到）
  if (path[i - 1] === ":") return path.slice(0, i + 1); // Windows 盘符根 C:\
  return path.slice(0, i);
}

/** 拼接目录与文件名，沿用该目录的分隔符。 */
export function joinPath(dir: string, name: string): string {
  const sep = sepOf(dir);
  return dir.endsWith(sep) ? `${dir}${name}` : `${dir}${sep}${name}`;
}

/** path 是否在 root 目录之下（按分隔符边界比，"/a/bc" 不算在 "/a/b" 下）。 */
export function isUnder(path: string, root: string): boolean {
  const sep = sepOf(root);
  return path.startsWith(root.endsWith(sep) ? root : root + sep);
}
