# Lume Product Roadmap

**English** | [简体中文](roadmap.zh-CN.md)

This document records future directions and priorities without duplicating the list of completed features. For current capabilities and editing behavior, see the [project introduction](../README.md) and [Markdown guide](markdown-guide.md). Setup details live in the [development guide](development.md).

The items below remain to be improved or evaluated. They are not a list of available features or a commitment to release dates.

## Product Principles

- Local first: work directly with local Markdown files under the user's control.
- Writing first: prioritize reliable input, cursor movement, selections, undo, and saving.
- Markdown first: keep content readable and portable.
- Keep both editing modes: WYSIWYG and source with split preview serve different writing habits.
- Expand capabilities in response to actual needs while keeping everyday editing clear.

## Near-Term Priorities

### Editing and Saving Reliability

- Continue improving input methods, object selections, mouse and keyboard behavior, and system clipboard interactions.
- Check editing, undo, mode switching, and save-and-reopen behavior for images, tables, links, footnotes, math, and HTML.
- Distinguish acceptable Markdown formatting normalization from content, addresses, and attributes that must be preserved.
- Improve coordination between autosave, external edits, renames, deletions, and session recovery.

### Consistency Between Editing Modes

- Add find, replace, and match navigation to the source editor.
- Unify heading anchor rules and improve table of contents, outline, and cross-mode navigation.
- Improve synchronized scrolling in complex documents and undo behavior across modes.
- Expand compatibility checks for long documents, nested structures, and invalid syntax.

### Local Files and Assets

- Provide recent-file and workspace history lists.
- Add quick open by file name.
- Improve insertion of general attachments, relative paths, and local document links.
- Improve image file location, asset organization, and recovery after failed operations.

## Future Directions

| Area                       | Plans                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Workspace search           | Background full-text indexing and search by file name, body, and headings                      |
| Reading and export         | HTML / PDF export and improved long-document reading and navigation                            |
| Large-document performance | Evaluate chunked parsing and preview virtualization to reduce input and scrolling delays       |
| Content expression         | Expand diagram and HTML / media compatibility according to user needs                          |
| Document organization      | Evaluate tags, favorites, backlinks, and version history                                       |
| Personalization            | Evaluate custom themes, templates, and keyboard shortcuts                                      |
| Optional sync              | Evaluate WebDAV, Git, and self-hosted options while keeping local writing independently usable |
| Extensibility              | Evaluate controlled plugin interfaces and permission boundaries                                |

## Feedback and Contributions

Reproducible editing and saving problems, along with real writing use cases, are especially helpful. When opening an [issue](https://github.com/sh3yee/lume/issues), include the steps, expected and actual results, and operating system. Remove private content from examples.
