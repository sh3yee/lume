# Lume Product and Development Roadmap

**English** | [简体中文](roadmap.zh-CN.md)

This document covers Lume's product principles, technical direction, syntax plans, and development phases, based on the current **0.5.0** repository code. For setup, project structure, and commands, see the [Development Guide](development.md). Architecture refactoring tasks are tracked in the [Refactoring Plan (Chinese)](refactoring-plan.md).

In this roadmap, `[x]` means an implementation exists in the code, and `[ ]` means the feature remains to be implemented or improved.

## Product Principles

- **Local first**: Documents belong to the user. Read and write local Markdown files directly.
- **Markdown first**: Content remains portable plain text that can be tracked in version control.
- **Writing first**: Typing, cursor movement, selection, undo, and input method support take priority over additional features.
- **Two editing modes**: Offer WYSIWYG editing by default while keeping Markdown source and a split-view preview available.
- **Progressive enhancement**: Introduce complex capabilities as needed while keeping basic editing stable and lightweight.

## Current Architecture

| Layer                    | Technology                                    | Current responsibilities                                                                                                 |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Desktop container        | Tauri 2                                       | Window lifecycle, system permissions, native dialogs, and app packaging                                                  |
| Native layer             | Rust                                          | Tauri startup, plugin registration, command boundaries, and a shared error model                                         |
| Frontend                 | Vue 3 + TypeScript + Vite                     | App layout, interaction state, file workflows, and UI components                                                         |
| WYSIWYG editor           | Milkdown / ProseMirror                        | Markdown editing, node and selection interactions, input rules, and undo / redo; CodeMirror 6 embedded in code blocks    |
| Split-view editor        | Native textarea + markdown-it                 | Markdown source, live preview, and scrolling synchronized by scroll ratio; the source editor does not yet use CodeMirror |
| Markdown extensions      | Paired Milkdown / markdown-it extensions      | GFM, links, footnotes, math, diagrams, YAML front matter, tables of contents, and alerts                                 |
| Files and workspaces     | Tauri Dialog / FS plugins + Rust services     | File I/O, directory scanning, file management, snapshot polling, and change events                                       |
| Image assets             | Frontend image services + Rust image services | Local assets, copying / moving / downloading, staging, and external uploader invocation                                  |
| Sessions and preferences | Frontend state + localStorage                 | Tabs and unsaved content, last workspace path, window state, and writing / appearance / image preferences                |

Editing interactions stay inside the WebView so individual keystrokes do not require a round trip to Rust. Rust already handles system capabilities such as workspace scanning, external change detection, and image assets. Full-text indexing and workspace search remain planned. App commands, lifecycle handling, documents, files, workspaces, editing, and images are organized by responsibility. Vue components access native capabilities through platform adapters.

The complete file workflow targets the Tauri desktop environment. Browser mode supports frontend development and basic file opening and saving through downloads. Image uploads are optional and require an external uploader; local writing needs neither an account nor an upload service.

## Roadmap

### Current Status

Lume implements the main workflows for local Markdown writing: two editing modes, multiple tabs, a workspace file tree, autosave, external conflict handling, session recovery, outline navigation, and a command palette.

Recent changes add inline and reference link editing, footnote interactions, YAML front matter, `[toc]` tables of contents, and GitHub-style alerts, along with broader image insertion, path editing, and asset organization. Future work will continue covering the Markdown syntax in the Typora reference while improving editing and save consistency, source-mode find and replace, and workspace search.

### Markdown Syntax Plans

The block elements, inline elements, and HTML content in [Typora's Markdown reference (Chinese)](https://support.typora.io/zh/Markdown-Reference/) are part of Lume's planned syntax scope. Input, editing, preview, and save support will be expanded progressively. The statuses below reflect Lume's current code.

#### Block Elements

- [x] Paragraphs and line breaks: ordinary paragraphs, soft breaks, and explicit line breaks.
- [x] Headings: levels one through six.
- [x] Blockquotes: ordinary and nested quotes.
- [x] Lists: ordered, unordered, and nested lists.
- [x] Task lists: incomplete and complete states, editable checkboxes in WYSIWYG mode, and read-only checkboxes in previews.
- [x] Fenced code blocks: language selection, code editing, and syntax highlighting.
- [x] Math blocks: LaTeX content wrapped in `$$`, rendered with KaTeX.
- [x] Tables: GFM tables, row and column editing, and column alignment.
- [x] Footnotes: references, definitions, and navigation.
- [x] Horizontal rules: Markdown rule input and editing.
- [x] YAML front matter: metadata blocks at the start of a document.
- [x] Table of contents: automatically generated from headings using `[toc]`.
- [x] Mermaid: editable code in WYSIWYG mode and rendered diagrams in split-view previews.
- [ ] Support standalone Sequence / Flowchart diagram syntax.

#### Inline Elements

- [x] Links: inline links, heading anchors, and reference links.
- [x] URL and email links: angle-bracket links are supported, with automatic linking enabled in split-view previews.
- [ ] Improve automatic URL and email link input and editing in WYSIWYG mode.
- [x] Images: Markdown image syntax, alt text, and optional titles, with local and remote sources.
- [x] Italic, bold, inline code, and strikethrough.
- [x] Escaped characters: use backslashes to preserve syntax characters such as asterisks and underscores.
- [x] Inline math: LaTeX content wrapped in `$...$`.
- [ ] Underline: display and edit `<u>...</u>`.
- [x] Emoji: support shortcodes such as `:smile:` and completion; ordinary Unicode emoji can already be entered directly.
- [ ] Subscript: support syntax such as `H~2~O`.
- [ ] Superscript: support syntax such as `X^2^`, keeping it distinct from footnote references.
- [ ] Highlight: support `==highlighted text==`.
- [ ] Provide shared syntax preferences for optional extensions.

#### HTML Content

- [x] Support HTML images that follow the project's conventions; other HTML is currently preserved or escaped as source.
- [ ] Support inline HTML styles and common tags, including text colors and `<br>` line breaks.
- [ ] Support embedded content using `<iframe>`.
- [ ] Support embedded video using `<video>`.
- [ ] Gradually expand display, editing, and save support for other common HTML elements.

#### Existing Lume Extensions

- [x] GitHub-style alerts: NOTE, TIP, IMPORTANT, WARNING, and CAUTION.
- [x] Image handling metadata: document-specific image roots, copy destinations, and upload rules.

### Phase 0: Project Foundation

Goal: establish a desktop app foundation that can support continued development.

- [x] Initialize Tauri 2, Rust, Vue 3, TypeScript, and Vite.
- [x] Establish ESLint, Prettier, TypeScript, and directory conventions.
- [x] Define design tokens for colors, typography, spacing, and layout.
- [x] Build a custom title bar, editor area, and status bar.
- [x] Establish Tauri command bridges, permissions, and a shared error model.
- [x] Connect native minimize, maximize, and close controls.
- [x] Separate app, feature, service, and platform adapter responsibilities.
- [x] Configure GitHub Actions to build and publish Windows, macOS, and Linux packages from version tags.

### Phase 1: Single-Document Editing

Goal: reliably create, edit, preview, and save Markdown documents.

- [x] Implement Markdown-first WYSIWYG editing with Milkdown.
- [x] Provide Markdown source with a live split-view preview.
- [x] Create, open, and save local Markdown files.
- [x] Show word count, character count, reading time, and cursor position.
- [x] Support basic Markdown such as headings, lists, quotes, emphasis, and code blocks.
- [x] Check for unsaved changes when closing tabs and confirm before discarding them.
- [x] Provide common keyboard shortcuts for creating, opening, saving, and closing documents.
- [x] Implement Save As and protect unsaved changes when closing the app.
- [x] Support GFM tables, task lists, and strikethrough in WYSIWYG mode.
- [x] Insert and edit GFM tables through editor context menus.
- [x] Provide split-view editing, selection and image toolbars, and context menus.
- [x] Offer context-specific actions for text, images, math, code, and tables, with command availability checks.
- [x] Toggle task checkboxes in WYSIWYG mode and show read-only checkboxes in split-view previews.
- [ ] Improve undo and redo consistency across editing modes.
- [ ] Improve desktop interactions involving input methods, keyboards, pointers, floating controls, and the system clipboard.
- [ ] Continue checking complex Markdown through editing, mode switches, saving, and reopening, with clear rules for formatting normalization and content preservation.

### Phase 2: Workspaces and Files

Goal: make local Markdown folders reliable workspaces.

- [x] Open, switch, identify, and close multiple document tabs.
- [x] Save and restore tabs, contents, and the active document, including content not yet saved to a file.
- [x] Reorder document tabs by dragging.
- [x] Open folders and show a collapsible file tree.
- [x] Create, rename, move, and delete workspace documents and directories.
- [x] Remember and restore the last workspace path.
- [x] Detect external workspace changes with Rust background snapshot polling and notify the frontend in batches.
- [x] Handle conflicts caused by external edits, renames, and deletions without silently overwriting documents with unsaved changes.
- [x] Insert images from local selection, pasted screenshots, multiple dropped files, image URLs, and Markdown input, with inline path editing.
- [x] Resolve and preview relative local image paths, keeping original files or copying them to a chosen folder according to preferences.
- [x] Resize images by dragging and align them left, center, or right.
- [x] Provide image scale presets, size reset, source / alt / title editing, and Markdown / address copying.
- [x] Copy or move images in batches, download remote images, and upload local images through an external uploader.
- [x] Support image path preferences, document-specific image roots, and YAML image handling rules.
- [x] Schedule autosave for documents with a file path and check disk contents before saving; pause autosave for conflicting documents and start conflict resolution.
- [ ] Provide recent file and workspace history beyond restoring the last session.
- [ ] Add a Reveal in Folder action for local images; a platform command exists but is not yet used by the image menu.
- [ ] Support general attachments and relative-path insertion, and improve local document link insertion.
- [ ] Evaluate SQLite for settings and workspace metadata.

### Phase 3: Reading and Writing Experience

Goal: improve long-term writing and reading of complex documents.

- [x] Support system, light, dark, and frosted glass themes.
- [x] Integrate the implemented math, footnote, link, metadata, table of contents, alert, and code highlighting capabilities listed above.
- [x] Provide document-level find, replace, and match highlighting in WYSIWYG mode.
- [x] Provide editing interactions for images, code blocks, and tables.
- [x] Offer frontend writing preferences for text width and font size.
- [x] Synchronize scrolling between the source editor and preview.
- [x] Provide a focus mode and a minimal writing interface.
- [x] Organize settings into categories for editing, writing, appearance, and images.
- [x] Provide a sidebar document outline with heading navigation.
- [x] Provide an app command palette for file, view, writing preference, and image commands.
- [ ] Add document-level find, replace, and match highlighting to the source editor.
- [ ] Improve outline extraction, table of contents navigation, and split-view scroll accuracy for complex documents.
- [ ] Add underline, emoji shortcodes, subscript, superscript, highlighting, and related syntax preferences.
- [ ] Add Sequence / Flowchart diagrams, HTML, embedded content, and video support.
- [ ] Support HTML and PDF export.

### Phase 4: Search, Indexing, and Productivity

Goal: make information easier to find across documents.

- [ ] Build a workspace full-text index in the Rust backend.
- [ ] Implement workspace search by file name, body text, headings, and tags.
- [ ] Provide quick open by file name and backlinks.
- [ ] Support tags and favorites.
- [ ] Evaluate Git status, diff previews, and version history.
- [ ] Introduce chunked parsing and preview virtualization for very large files.

### Phase 5: Sync and Extensibility

Goal: expand capabilities while preserving local-first principles.

- [ ] Design optional sync interfaces that do not upload user content by default.
- [ ] Evaluate WebDAV, Git, and self-hosted sync options.
- [ ] Define a controlled plugin API and permission boundaries.
- [ ] Support custom themes, templates, and keyboard shortcuts.
- [ ] Design optional error reporting with transparent privacy practices.

## Current Priorities

1. **Stabilize editing and saving**: prioritize image, link, footnote, table, math, and document block input, selections, undo / redo, mode switching, and save round trips. Continue checking core behavior through the existing regression entry point.
2. **Expand Markdown syntax**: first improve automatic URL links, underline, emoji shortcodes, subscript, superscript, and highlighting, then expand standalone diagram syntax and HTML content.
3. **Improve source mode**: implement find and replace with match navigation, and improve consistency with WYSIWYG operations.
4. **Improve local file reliability**: cover autosave, external edits / renames / deletions, session recovery, and image asset organization in desktop workflows.
5. **Build workspace search**: develop recent history, quick open by file name, and Rust full-text indexing and search in that order.
6. **Improve long-document workflows**: refine outline and table of contents navigation and scroll synchronization, then work toward HTML / PDF export. Sync and plugins remain later plans.
