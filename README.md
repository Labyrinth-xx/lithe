# Lithe

A lightweight, native **macOS Markdown editor** — Typora-style inline WYSIWYG, ~23 MB, fully offline. Its party trick: **it never locks your files**, so an AI agent (Claude Code, Cursor) or `git` can rewrite the same `.md` on disk while you have it open, and Lithe reconciles the change instead of clobbering it.

> _Screenshots live in `docs/screenshots/` — run `npm run tauri dev`, open a `.md`, and drop a capture there._

---

## Why Lithe

- **Native & light.** Built on Tauri (Rust shell + system WebView), not Electron. ~23 MB, instant launch, no CDN calls, no telemetry.
- **Typora-style WYSIWYG.** Vditor IR mode renders Markdown inline as you type — one pane, no split preview.
- **Safe to leave open while other tools edit the file.** This is the interesting part (see below).

## Plays nice with external tools & AI agents

Most editors either hold a lock on the open file or cache a stale copy and silently overwrite outside changes on the next save — a long-standing way to lose work when `git`, another editor, or an AI coding agent touches the same file.

Lithe is built the opposite way:

- **No lock.** Every read/write is open → read-or-write → close (Rust `std::fs`). External programs can always edit the file, even while Lithe has it open.
- **Detects external changes.** A background watcher notices when the file changes on disk.
- **Reconciles instead of clobbering.** A pure decision function ([`src/sync-logic.ts`](src/sync-logic.ts)) decides between three outcomes: _ignore_ (it was our own echo), _reload_ (no unsaved edits — refresh silently), or _conflict_ (unsaved local edits **and** a disk change — ask the user, never overwrite blindly).

The result: you can edit a `.md` in Lithe and have Claude Code rewrite it in the background, and neither side loses content.

## Features

- Inline WYSIWYG editing (Vditor IR) with a focused toolbar (headings, bold/italic/strikethrough, lists, quote, code, table, link, undo/redo)
- File-tree sidebar + browser-style tabs for multiple files
- Document outline and live word count
- Math (KaTeX), code highlighting (highlight.js), Mermaid diagrams — all bundled locally
- Light / Dark theme, follows the system, remembered across launches
- Debounced auto-save + ⌘S
- Registers as a handler for `.md` / `.markdown` — double-click to open

## Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri v2 (Rust, macOS WKWebView) |
| Editor core | Vditor 3 (IR mode), assets bundled offline |
| Frontend | TypeScript + Vite, no framework |
| File I/O & watching | Rust `std::fs` + a lightweight polling thread |

Key files: [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) (Rust I/O + file watcher), [`src/main.ts`](src/main.ts) (editor orchestration), [`src/sync-logic.ts`](src/sync-logic.ts) (pure conflict-resolution logic).

## Build & run

Requirements: macOS, Node 18+, and the [Rust toolchain](https://www.rust-lang.org/tools/install).

```bash
git clone <repo-url>
cd markdown-reader
npm install

npm run tauri dev      # run in development
npm run tauri build    # produce Lithe.app + a .dmg under src-tauri/target/release/bundle/
```

**First launch (unsigned build):** Lithe isn't code-signed yet, so macOS Gatekeeper will warn on first open. Right-click `Lithe.app` → **Open** → **Open** once (or System Settings → Privacy & Security → **Open Anyway**). Subsequent launches are normal.

## Status

A personal project — I build it for my own daily Markdown writing. Not affiliated with Typora. Contributions and issues welcome.

## License

[MIT](LICENSE).
