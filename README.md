![Lume icon](docs/assets/logo.png)

# Lume

**English** | [简体中文](README.zh-CN.md)

**A calm, lightweight Markdown editor for local writing.**

Keep your words on your own device. Bring your attention back to writing.

![Status: early development](https://img.shields.io/badge/status-early_development-d98b2b?style=flat-square)
![Local first](https://img.shields.io/badge/documents-local_first-4f7f6f?style=flat-square)
![Markdown](https://img.shields.io/badge/format-Markdown-5d6673?style=flat-square)

[Screenshots](#screenshots) · [Highlights](#highlights) · [Markdown Support](#markdown-support) · [Images and Assets](#images-and-assets) · [Project Status](#project-status) · [Contributing](#contributing)

---

## About Lume

Lume is a desktop editor for personal writing and organizing local knowledge.

It works directly with ordinary Markdown files. No account is required, your content stays in an open format, and you can keep organizing your documents the way you already do. From quick notes and study materials to long articles, Lume gives you a simple, comfortable place to write.

> Your words belong to you. Open them anywhere, move them freely, and keep them readable for years.

## Screenshots

Choose a light, dark, or frosted glass theme to suit your surroundings and mood.

| Light                                           | Dark                                          | Frosted Glass                                           |
| ----------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| ![Lume light theme](docs/assets/lume-light.png) | ![Lume dark theme](docs/assets/lume-dark.png) | ![Lume frosted glass theme](docs/assets/lume-glass.png) |

## Highlights

| Feature                       | Description                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| ✍️ **Focused writing**        | Focus mode hides the sidebar and document tabs. Adjust text width and font size to your preference.                                            |
| 📄 **Local first**            | Open and save local Markdown files directly, without an account or online service.                                                             |
| ✨ **Two editing modes**      | Switch between WYSIWYG editing and Markdown source with a live preview, with synchronized scrolling in split view.                             |
| 🗂️ **Workspaces and tabs**    | Open local folders and manage documents in a file tree. Reorder tabs by dragging and see unsaved changes at a glance.                          |
| 💾 **Autosave and conflicts** | Documents with a file path are saved automatically. External edits, renames, and deletions are detected, with choices for resolving conflicts. |
| 🛟 **Session recovery**       | Open tabs and their contents are saved locally so you can continue writing when you reopen the app.                                            |
| 🔎 **Find and navigate**      | Find, replace, and highlight matches in WYSIWYG mode. Jump to headings through the sidebar outline or an in-document table of contents.        |
| ⌨️ **Command palette**        | Quickly create, open, and save documents, switch editing modes, and run image commands.                                                        |
| 🌗 **Comfortable themes**     | Choose light, dark, system, or frosted glass appearance.                                                                                       |
| 📊 **Writing statistics**     | Track word count, character count, estimated reading time, and cursor position.                                                                |

## Markdown Support

| Content                 | Current support                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Basic formatting**    | Headings, paragraphs, bold, italic, blockquotes, ordered and unordered lists, horizontal rules, and inline code |
| **GFM extensions**      | Tables, task lists, and strikethrough; table insertion and row and column editing in WYSIWYG mode               |
| **Links and footnotes** | Inline links, reference links, and footnotes, with editing in the document                                      |
| **Code blocks**         | Language selection and syntax highlighting                                                                      |
| **Math**                | Inline and block equations rendered with KaTeX                                                                  |
| **Diagrams**            | Mermaid diagram editing and rendering                                                                           |
| **Document metadata**   | YAML front matter at the start of a document, editable in WYSIWYG mode                                          |
| **Table of contents**   | A standalone `[toc]` marker generates a clickable list of document headings                                     |
| **Alerts**              | GitHub-style `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION` blocks                                        |

WYSIWYG mode provides a selection toolbar and context menus for common formatting, block conversion, and content insertion. Source mode lets you edit Markdown directly while the preview renders supported extensions.

## Images and Assets

- **Flexible insertion**: Select local images, paste screenshots, drag and drop files, or use image URLs and Markdown syntax. Edit image paths inline.
- **Image editing**: Change the source, alt text, and title; drag to resize, choose a scale preset, restore the original size, or set alignment.
- **Asset organization**: Keep images in their original location or copy them to a chosen folder. Use relative paths, path escaping, and document-specific image roots. Copy or move images in batches, or download remote images.
- **Optional uploads**: Configure an external uploader to upload local images. Use YAML metadata to choose image handling rules for individual documents.

Configure insertion rules, path formatting, and uploaders under Preferences → Images. Local writing does not require an uploader.

## Keyboard Shortcuts

| Action                                     | Windows / Linux           |
| ------------------------------------------ | ------------------------- |
| New document                               | `Ctrl+N` / `Ctrl+T`       |
| Open file                                  | `Ctrl+O`                  |
| Save / Save As                             | `Ctrl+S` / `Ctrl+Shift+S` |
| Close current document                     | `Ctrl+W`                  |
| Command palette                            | `Ctrl+P`                  |
| Preferences                                | `Ctrl+,`                  |
| Find and replace in the document (WYSIWYG) | `Ctrl+F`                  |
| Insert image                               | `Ctrl+Shift+I`            |

On macOS, use `Command` instead of `Ctrl`.

## What You Can Use It For

- Capture ideas, journals, and everyday notes
- Organize course notes, reading notes, and technical learning materials
- Write blog posts, articles, and longer pieces
- Manage Markdown documents that remain portable and readable over time
- Write quietly without connecting to a cloud service

## Design Principles

| Principle                   | Meaning                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| **Local first**             | Your content stays on your own device, under your control.               |
| **Markdown first**          | Files stay open, readable, and portable.                                 |
| **Writing first**           | The writing experience and clear expression come before adding features. |
| **Simple and reliable**     | Clear interactions for everyday work.                                    |
| **Progressive enhancement** | Add capabilities carefully on top of a stable foundation.                |

## Project Status

Lume is in early development. The current repository version is **0.3.0**. Local document editing, workspace file management, autosave, external conflict handling, and session recovery are implemented. Markdown extensions and image workflows continue to improve.

The desktop app uses Tauri 2, Rust, Vue 3, and TypeScript. WYSIWYG editing is powered by Milkdown / ProseMirror, and split-view previews use markdown-it. Workspace management, automatic saves to source files, and local image asset handling require the desktop environment. Browser mode is intended for frontend development and a preview of the basic experience.

Planned improvements include:

- Find and replace in the source editor
- Workspace search, full-text indexing, and quick open
- Recent files and workspace history
- General attachment management and relative-path insertion
- Large-document performance and consistent interactions across editing modes
- HTML and PDF export

See the [Product and Development Roadmap](docs/roadmap.md) for details.

## Contributing

Issues, feedback, and contributions are welcome. Interaction suggestions, wording improvements, and new use cases all help shape Lume.

- Read the [Development Guide](docs/development.md) before contributing.
- See the [Product and Development Roadmap](docs/roadmap.md) for future plans.
- When reporting a problem, include reproduction steps, your system environment, and relevant screenshots where possible.

## Current Notice

> Lume has not reached a stable release. Its interface, features, and documentation may change. Keep independent backups of important documents.

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md).

- Personal learning, research, experimentation, hobby projects, and other noncommercial uses are permitted.
- Modification and redistribution for noncommercial purposes are permitted, provided the license and required notices are retained.
- **Commercial use of this project or derivative works is prohibited.**
- Contact the project author for a separate commercial license.

> Because the license restricts commercial use, this is a source-available project, not open-source software under the OSI definition.

---

**Lume · A quiet light for your words.**
