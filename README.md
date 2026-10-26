<p align="center">
  <img src="docs/assets/logo.png" width="88" alt="Lume icon" />
</p>

<h1 align="center">Lume</h1>

<p align="center"><strong>A quiet space for your words.</strong></p>

<p align="center">A desktop Markdown editor for personal writing, everyday notes, and local knowledge.</p>

<p align="center"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>

<p align="center">
  <a href="https://github.com/sh3yee/lume/releases">Download</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="docs/markdown-guide.md">Guide</a> ·
  <a href="https://github.com/sh3yee/lume/issues">Feedback</a>
</p>

![Status: early development](https://img.shields.io/badge/status-early_development-d98b2b?style=flat-square)
![Local first](https://img.shields.io/badge/documents-local_first-4f7f6f?style=flat-square)
![Markdown](https://img.shields.io/badge/format-Markdown-5d6673?style=flat-square)

Lume works directly with ordinary Markdown files on your device. No account is required to write, and your documents remain readable and portable. Use it to capture an idea, organize reading notes, or work through a longer article at your own pace.

## Screenshots

**Write directly on the page.** Keep open documents on the left and your outline on the right, with room for the text in between.

![Lume light theme: WYSIWYG writing, document list, and heading outline](docs/assets/lume-light.jpg)

**Keep the Markdown in view.** Split view combines source highlighting and line numbers with a live preview and synchronized scrolling.

![Lume split view: Markdown source alongside the rendered document](docs/assets/lume-split-view.jpg)

<details>
<summary>Dark theme and preferences</summary>

Choose light, dark, or system appearance. Translucent side panels frame the writing area in both themes.

![Lume dark theme with document navigation and outline](docs/assets/lume-dark.jpg)

Adjust language, typography, editing layout, Markdown extensions, and image preferences in one place.

![Lume preferences: language and writing typography](docs/assets/lume-preferences.jpg)

</details>

Screenshots were captured from the current browser preview with an English interface and sample document.

## Features

### Write the way you prefer

- **WYSIWYG editing** — Edit formatted text directly. Use Markdown input, the selection toolbar, or context menus to format and insert content.
- **Source and live preview** — Switch to split view when you want to work with Markdown syntax and see the result alongside it.
- **Focus mode** — Hide the file panel, outline, and document tabs to make more room for writing.
- **Comfortable typography** — Choose the writing font, size, line spacing, and page width. Set interface fonts and outline size separately.
- **Your preferred appearance** — Light, dark, and system themes, plus Simplified Chinese and English interfaces. Document tabs and the status bar can be hidden independently.
- **Custom application shortcuts** — Search, change, clear, or reset file and view shortcuts under **Preferences → Shortcut**. Changes take effect immediately and are saved locally.

### Keep your documents close

- **Local folders as workspaces** — Browse a file tree and create, rename, move, or delete files and folders without leaving the app.
- **Multiple documents** — Switch between tabs or the open-document list; drag tabs to reorder them and see which documents have unsaved changes.
- **Autosave** — In the desktop app, documents with a save location are automatically written back to their files. Save new drafts once to choose a location.
- **Session recovery** — Open documents and draft contents are stored locally so you can continue after reopening the app.
- **External change handling** — Detect changes in the open workspace and choose how to handle conflicting edits or deleted files.

### Find your place

- **Outline navigation** — Jump to headings from the right panel; drag either side panel to adjust its width.
- **Document search** — Find, replace, and highlight text matches in WYSIWYG mode.
- **Command palette** — Create, open, and save documents, switch views, toggle focus mode, and run image commands from the keyboard.
- **Writing statistics** — Check words, characters, lines, and estimated reading time in the statistics panel; the status bar also shows cursor position.

### Share your writing

Export the current document, including unsaved edits, as styled HTML, unstyled HTML, or a PNG image. PDF export opens the system print dialog, where you can choose **Save as PDF**. Open **Export…** from the command palette or the title-bar context menu, or press `Ctrl+Alt+E`. See the [guide](docs/markdown-guide.md#export-a-document) for format details and resource limits.

## Markdown support

For syntax examples, editing interactions, and differences between modes, see the [Markdown guide](docs/markdown-guide.md).

| Content                   | What you can do                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Everyday formatting       | Headings, bold, italic, strikethrough, inline code, quotes, nested lists, and horizontal rules                    |
| Tables and tasks          | Insert tables, edit rows and columns, set column alignment, and check off tasks in WYSIWYG mode                   |
| Links and references      | Edit inline and reference links, follow heading anchors, and work with footnotes                                  |
| Code                      | Choose a code language, edit with syntax highlighting, and copy a code block                                      |
| Math                      | Write inline and block LaTeX equations and view their rendered form                                               |
| Mermaid                   | Edit `mermaid` code blocks in WYSIWYG mode; render diagrams in split-view preview                                 |
| Document structure        | Edit YAML front matter and insert a clickable heading list with a standalone `[toc]` marker                       |
| Alerts                    | Use GitHub-style `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION` blocks                                      |
| Extra inline formatting   | Enable `==highlight==`, `H~2~O` subscripts, and `X^2^` superscripts in preferences                                |
| Emoji and automatic links | Use emoji shortcodes and completion, and recognize plain URLs as links                                            |
| HTML and media            | Work with supported inline HTML, HTML blocks, SVG, audio, video, and iframe embeds; edit the HTML source in place |

Under **Preferences → Markdown**, you can choose which optional extensions to enable. Highlight, subscript, and superscript are off by default. Media playback and remote embeds depend on the system webview and the source website.

## Images and assets

Bring illustrations into your writing without interrupting the flow:

- Insert local images, paste screenshots, drag and drop image files, or use an image URL.
- Edit the source, alt text, and title. Resize by dragging or choosing a scale preset, restore the original size, and set alignment.
- Keep images where they are or copy them to a chosen asset folder. Use relative paths and document-specific image roots.
- Copy or move document images in batches, or download remote images for local use.
- Optionally configure an external uploader. Individual documents can override image handling through YAML metadata.

Set these rules under **Preferences → Images**. An uploader is optional; local writing and local images do not require one. Remote images, embeds, and uploaders use a network connection when used.

## Getting started

1. Visit [Releases](https://github.com/sh3yee/lume/releases) and choose an installer for your system. Lume targets Windows, macOS (Apple Silicon and Intel), and Linux; check each release for available assets.
2. Open an existing `.md` or `.markdown` file, create a document, or open a local folder as your workspace.
3. Start writing in the default WYSIWYG mode. Use **Preferences → Editor** or the command palette to switch to source and preview.
4. Save a new document to choose its file location. Subsequent edits to saved files are autosaved in the desktop app.
5. Use the outline to navigate, or adjust typography and appearance in preferences to settle into your writing space.

Lume is a desktop application. The browser preview offers basic editing and download-based saving; workspace management, autosave to original files, and local asset processing require the desktop app.

## Keyboard shortcuts

| Action                        | Windows / Linux           |
| ----------------------------- | ------------------------- |
| New document                  | `Ctrl+T`                  |
| Open file                     | `Ctrl+O`                  |
| Save / Save As                | `Ctrl+S` / `Ctrl+Shift+S` |
| Export                        | `Ctrl+Alt+E`              |
| Close current document        | `Ctrl+W`                  |
| Command palette               | `Ctrl+P`                  |
| Preferences                   | `Ctrl+,`                  |
| Toggle file panel             | `Ctrl+Shift+E`            |
| Toggle outline and statistics | `Ctrl+Shift+O`            |
| Find and replace (WYSIWYG)    | `Ctrl+F`                  |
| Insert image                  | `Ctrl+Shift+I`            |

These are the default bindings. On macOS, use `Command` instead of `Ctrl`. Customize application bindings under **Preferences → Shortcut**; editor formatting shortcuts are fixed. Focus mode and editing-mode switching are available in the command palette and can be assigned shortcuts.

## Status and feedback

Lume is in early development; the current repository version is **0.8.0**. The interface and editing behavior continue to evolve. Keep independent backups of important documents; session recovery is a convenience, not a backup system.

The English interface is available, but its audience and usage are still uncertain, so it has had less real-world validation. Some layouts may not yet accommodate longer English labels: text can be clipped, wrap awkwardly, or outgrow a button or input. Reports and screenshots of these issues are welcome and will help guide further English-language improvements.

Workspace-wide full-text search, recent-file history, and source-editor find and replace are not yet available. Future work will mainly focus on optional WebDAV and Git sync, self-hosted storage, and Baidu Netdisk / Alibaba Cloud Drive integrations. These integrations are planned, not currently available; see the [roadmap](docs/roadmap.md).

Found a problem or have an idea? [Open an issue](https://github.com/sh3yee/lume/issues) with the steps to reproduce, your operating system, and a screenshot where helpful. Please remove private content from examples. Contributions are welcome; setup and development details live in the [development guide](docs/development.md).

## License

Lume is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Noncommercial use, modification, and redistribution are permitted under its terms. Commercial use requires a separate license from the author.

This is a source-available project with a noncommercial license.

---

**Lume · A quiet light for your words.**
