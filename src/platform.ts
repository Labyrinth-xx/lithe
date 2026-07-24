// 平台判定：Tauri 用系统 WebView，userAgent 带真实操作系统标识，无需额外插件。
// 只用于「显示给人看的文案」（快捷键写法、安装 pandoc 的命令），
// 路径处理不看平台、看路径本身的分隔符（见 utils.ts），避免开发态跨平台调试出错。

export const IS_WINDOWS = navigator.userAgent.includes("Windows");

/** 快捷键修饰键前缀：macOS「⌘S」/ Windows「Ctrl+S」。 */
export const MOD = IS_WINDOWS ? "Ctrl+" : "⌘";

/** 安装 pandoc 的命令，按平台给对应包管理器。 */
export const PANDOC_INSTALL_CMD = IS_WINDOWS
  ? "winget install --id JohnMacFarlane.Pandoc"
  : "brew install pandoc";
