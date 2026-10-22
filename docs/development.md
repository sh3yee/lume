# Lume Development Guide

**English** | [简体中文](development.zh-CN.md)

This document describes the development environment, project structure, and common commands for Lume.

## Requirements

| Tool    | Minimum version    | Purpose                                |
| ------- | ------------------ | -------------------------------------- |
| Node.js | 20.0+              | Frontend builds and development server |
| npm     | 10.0+              | Dependency management                  |
| Rust    | 1.77+              | Tauri backend compilation              |
| Cargo   | Included with Rust | Rust package management                |

### Install Rust (If Needed)

On Windows, install rustup with the MSVC toolchain using Scoop:

```powershell
# Install with Scoop (recommended)
scoop install rustup-msvc

# Alternatively, use the official rustup installer
# Download it from https://rustup.rs/
```

> **Optional mirror for users in China**: If downloads are slow, configure the following environment variables to use a regional mirror:
>
> ```powershell
> $env:RUSTUP_DIST_SERVER = "https://rsproxy.cn"
> $env:RUSTUP_UPDATE_ROOT = "https://rsproxy.cn/rustup"
> scoop install rustup-msvc
> ```

Restart your terminal after installation and verify:

```powershell
rustc --version
cargo --version
```

### Install MSVC Build Tools (Required on Windows)

Rust's default Windows MSVC toolchain requires Visual Studio Build Tools to provide `link.exe` and the Windows SDK:

```powershell
# Install with winget (recommended)
winget install --id Microsoft.VisualStudio.2022.BuildTools --source winget `
  --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" `
  --accept-package-agreements --accept-source-agreements
```

Alternatively, download the installer from <https://visualstudio.microsoft.com/visual-cpp-build-tools/> and select:

- **MSVC - VS C++ x64/x86 build tools**
- **Windows SDK**

### Configure a Cargo Mirror (Optional)

To speed up crate downloads in China, configure the rsproxy mirror in `~/.cargo/config.toml`:

```toml
[source.crates-io]
replace-with = 'rsproxy-sparse'

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[net]
git-fetch-with-cli = true
```

## Quick Start

```powershell
# Install frontend dependencies
npm install

# Frontend development only (no Rust environment required)
npm run dev

# Tauri desktop development (requires a Rust environment)
npm run tauri:dev

# Build desktop installation packages
npm run tauri:build
```

## Common Commands

| Command               | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `npm run dev`         | Start the Vite frontend development server on port 1420 |
| `npm run build`       | Run type checking and build the frontend for production |
| `npm run type-check`  | Run TypeScript type checking only                       |
| `npm run lint`        | Run ESLint with automatic fixes                         |
| `npm run format`      | Format source files with Prettier                       |
| `npm run tauri:dev`   | Start the Tauri desktop app in development mode         |
| `npm run tauri:build` | Build desktop installation packages                     |

## Publishing a GitHub Release

The repository uses `.github/workflows/release.yml` to build Windows, macOS, and Linux packages automatically. Before releasing, keep the version numbers in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` in sync.

After committing the version changes, create and push a tag starting with `v`:

```powershell
git tag -a v0.6.0 -m "发布 v0.6.0"
git push --atomic origin main v0.6.0
```

Pushing the tag triggers the workflow to publish a release directly on GitHub Releases and attach platform installation packages. Windows provides two installer formats:

- `.exe`: an NSIS installer suitable for most users.
- `.msi`: a Windows Installer package suitable for system administration and bulk deployment.

After publishing, confirm that all platform builds succeeded in Actions and check the release notes and attached packages.

You can also run the workflow manually from **Actions → Release → Run workflow** in the GitHub repository, supplying a version tag such as `v0.1.0`. For normal releases, pushing a version tag is recommended to keep the release tag aligned with the project version.

## Project Structure

```text
lume/
├── src/                        # Frontend source
│   ├── components/             # Vue components
│   │   ├── TitleBar.vue        # Title bar
│   │   ├── SideBar.vue         # Sidebar
│   │   ├── EditorPane.vue      # Editor area
│   │   ├── PreviewPane.vue     # Preview area
│   │   └── StatusBar.vue       # Status bar
│   ├── styles/                 # Global styles
│   │   ├── tokens.css          # Design tokens (colors, typography, spacing, etc.)
│   │   ├── reset.css           # Base reset
│   │   └── index.css           # Style entry point
│   ├── platform/               # Platform adapters
│   │   ├── browser/            # Browser file picker and download fallbacks
│   │   └── tauri/              # Tauri clients organized by domain
│   ├── App.vue                 # Root component
│   ├── main.ts                 # Frontend entry point
│   └── env.d.ts                # Environment type declarations
├── src-tauri/                  # Tauri / Rust backend
│   ├── src/
│   │   ├── lib.rs              # App initialization and plugin registration
│   │   ├── main.rs             # Binary entry point
│   │   ├── commands/           # File, image, workspace, and system commands
│   │   ├── services/           # Image asset and workspace scanning services
│   │   └── error.rs            # Shared error handling
│   ├── capabilities/           # Permission configuration
│   ├── Cargo.toml              # Rust dependencies
│   ├── build.rs                # Build script
│   └── tauri.conf.json         # Tauri configuration
├── docs/                       # Project documentation
├── index.html                  # HTML entry point
├── package.json                # Frontend dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── vite.config.ts              # Vite configuration
├── .eslintrc.cjs               # ESLint configuration
├── .prettierrc.json            # Prettier configuration
└── .editorconfig               # Editor formatting conventions
```

## Design Tokens

Design tokens are defined in `src/styles/tokens.css`. Themes are applied through CSS custom properties.

- All tokens use the `--lume-` prefix.
- The light theme is the default; the dark theme overrides it through `:root[data-theme='dark']`.
- Components must reference token variables instead of hardcoding color values.

### Main Categories

| Category        | Examples                                             | Purpose                     |
| --------------- | ---------------------------------------------------- | --------------------------- |
| Colors          | `--lume-bg-base`, `--lume-text-primary`              | Backgrounds and text        |
| Brand color     | `--lume-accent-default`                              | Accents and interactions    |
| Semantic colors | `--lume-color-success`, `--lume-color-danger`        | Status feedback             |
| Typography      | `--lume-font-size-base`, `--lume-line-height-normal` | Font sizes and line heights |
| Spacing         | `--lume-space-1` through `--lume-space-12`           | Layout spacing              |
| Border radius   | `--lume-radius-sm` through `--lume-radius-xl`        | Rounded corners             |
| Shadows         | `--lume-shadow-sm` through `--lume-shadow-xl`        | Visual depth                |
| Layout          | `--lume-titlebar-height`, `--lume-sidebar-width`     | App shell dimensions        |

## Tauri Command Boundaries

### Naming

- Prefix all custom Lume commands with `lume_` to avoid conflicts with plugin commands.
- Use lowercase names separated by underscores, such as `lume_health_check`.

### Error Handling

- All Rust commands return `LumeResult<T>`, an alias for `Result<T, LumeError>`.
- `LumeError` uses `thiserror` and is serialized by `serde` as `{ kind, message }`.
- The frontend invokes commands through `src/platform/tauri/client.ts`, which converts serialized Rust errors into standard `Error` instances.
- File, image, workspace, window, and system capabilities live in their respective domain modules under `src/platform/tauri`.
- Frontend components must use bridge modules to access native capabilities instead of calling `invoke` directly.

### Adding a Command

1. Add a lightweight command function with `#[tauri::command]` in `src-tauri/src/commands/{domain}.rs`.
2. Put image or workspace business logic in `src-tauri/src/services`. Commands handle parameter boundaries and delegate to services.
3. Register the command in `invoke_handler` in `src-tauri/src/lib.rs`.
4. Add a typed wrapper in `src/platform/tauri/{domain}.ts`. Vue components must not call Tauri APIs directly.
5. Declare any new permissions in `src-tauri/capabilities/default.json`.

### Workspace Watching Conventions

- File management commands must verify that both source and destination paths are inside the current workspace.
- Workspace watching runs in a background thread in `services/workspace_watcher.rs` and sends batched `lume://workspace-change` events.
- The frontend subscribes only in `app/lifecycle/useWorkspaceLifecycle.ts`. Sidebar visibility does not affect the watcher lifecycle.
- Documents without unsaved changes can be refreshed safely. Documents with unsaved changes must enter conflict resolution and must never be silently overwritten.
- The current polling interval is 750 ms, with a limit of 5000 entries and a maximum recursion depth of 32. The scanner skips symbolic links and tracks directories and `.md` / `.markdown` files.
- When changing these limits or intervals, check large-workspace loading, external change latency, continuous typing, and conflict handling. Record the environment and workspace size with performance measurements.

## Commit Conventions

The project follows [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <subject>

<body>
<footer>
```

Supported types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`.
