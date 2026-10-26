# Lume Product Roadmap

**English** | [简体中文](roadmap.zh-CN.md)

This roadmap contains unfinished work only. For available features, see the [README](../README.md) and [Markdown guide](markdown-guide.md).

Future development will mainly focus on syncing ordinary Markdown files and their assets through storage you choose. WebDAV and Git provide paths to self-hosted storage; Baidu Netdisk and Alibaba Cloud Drive are separate cloud-service integrations. All integrations below are planned or under evaluation, with no committed release dates.

## Main Priorities

| Direction           | Planned work                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WebDAV              | Connect to a chosen server, select a remote folder, and sync documents and assets; support personal NAS and self-hosted services.                                        |
| Git                 | Connect a local workspace to a repository, commit and sync changes, and expose history and conflicts; support user-chosen Git hosts, including self-hosted repositories. |
| Baidu Netdisk       | Evaluate available integration methods for authorization, folder mapping, and document / asset synchronization.                                                          |
| Alibaba Cloud Drive | Evaluate available integration methods for authorization, folder mapping, and document / asset synchronization.                                                          |

## Sync Behavior to Work Through

- Keep local writing usable offline and make every remote connection optional.
- Sync Markdown and referenced assets together, preserving relative paths and handling moves, renames, and deletions.
- Detect concurrent edits and present conflicts without silently overwriting local or remote content.
- Show connection state, pending changes, progress, and failures; allow retries after interruptions.
- Keep credentials on the device and make connecting, disconnecting, and choosing sync scope explicit.

## Ongoing Maintenance

Continue addressing reproducible editing, saving, and recovery problems, along with performance and cross-platform compatibility. Improve English layouts where longer labels overflow or controls are too narrow. Other feature requests will be prioritized around actual writing and sync use cases.

## Feedback

For sync requests, describe your storage service, devices, folder structure, and how you expect concurrent edits to be handled. For bugs, include reproduction steps, expected and actual results, and your operating system in an [issue](https://github.com/sh3yee/lume/issues). Remove private content and credentials from examples.
