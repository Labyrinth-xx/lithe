# Lithe

**A Markdown editor that doesn't fight your AI agent.**

Leave a `.md` open in Lithe while **Claude Code, Cursor, or `git` rewrites the same file on disk** — Lithe never locks the file, notices the change, and live-reloads it instead of overwriting your view. Edit on one side, let the agent edit on the other, and neither loses work.

Native macOS, Typora-style inline WYSIWYG, ~23 MB, fully offline.

![Lithe — inline WYSIWYG Markdown editing on macOS](docs/screenshots/editor.png)

---

## The problem it solves

Most editors either **hold a lock** on the open file or **cache a stale copy and silently overwrite** outside changes on the next save. That's a long-standing way to lose work the moment `git`, another editor, or an AI coding agent touches the same file. As more of your `.md` files get written *by* agents, "open it in an editor while the agent edits it" stops being an edge case — and most editors handle it badly.

Lithe is built the opposite way:

- **No lock.** Every read/write is open → read-or-write → close (Rust `std::fs`). External programs can always edit the file, even while Lithe has it open.
- **Detects external changes.** A background watcher notices when the file changes on disk and pushes the update to the open window in real time.
- **Reconciles instead of clobbering.** A pure decision function ([`src/sync-logic.ts`](src/sync-logic.ts)) picks one of three outcomes: _ignore_ (it was our own echo), _reload_ (no unsaved edits — refresh silently), or _conflict_ (unsaved local edits **and** a disk change — ask the user, never overwrite blindly).

The result: watch your AI agent rewrite a document live, or keep editing while it works — no clobbered files, no "file changed on disk, reload? (you'll lose changes)" guessing game.

## Why else you'd use it

- **Native & light.** Built on Tauri (Rust shell + system WebView), not Electron. ~23 MB, instant launch, no CDN calls, no telemetry.
- **Typora-style WYSIWYG.** Vditor IR mode renders Markdown inline as you type — one pane, no split preview.
- **Stays out of the way.** Clean toolbar with hover tooltips, a folder browser that pops out only when you want it, and a document outline a click away.

## Features

- Inline WYSIWYG editing (Vditor IR) with a focused toolbar (headings, bold/italic/strikethrough, lists, quote, code, table, link, undo/redo) — every button has a hover tooltip
- A pop-out folder browser (left) + browser-style tabs for juggling multiple files, with tab tear-out into new windows
- Document outline (right) and live word count
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
