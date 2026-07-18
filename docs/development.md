# Lume 开发说明

本文档描述 Lume 项目的开发环境配置、目录结构和常用命令。

## 环境要求

| 工具 | 最低版本 | 用途 |
| --- | --- | --- |
| Node.js | 20.0+ | 前端构建与开发服务器 |
| npm | 10.0+ | 依赖管理 |
| Rust | 1.77+ | Tauri 后端编译 |
| Cargo | 随 Rust 安装 | Rust 包管理 |

### 安装 Rust（如尚未安装）

Windows 环境下，推荐通过 scoop 安装 rustup（MSVC 工具链）：

```powershell
# 通过 scoop 安装（推荐）
scoop install rustup-msvc

# 或通过 rustup 官方安装器
# 访问 https://rustup.rs/ 下载安装器
```

> **国内加速**：如果下载速度很慢，设置环境变量使用国内镜像：
> ```powershell
> $env:RUSTUP_DIST_SERVER = "https://rsproxy.cn"
> $env:RUSTUP_UPDATE_ROOT = "https://rsproxy.cn/rustup"
> scoop install rustup-msvc
> ```

安装完成后重启终端，验证：

```powershell
rustc --version
cargo --version
```

### 安装 MSVC 构建工具（必需）

Rust 在 Windows 上默认使用 MSVC 工具链，需要 Visual Studio Build Tools 提供 `link.exe` 和 Windows SDK：

```powershell
# 通过 winget 安装（推荐）
winget install --id Microsoft.VisualStudio.2022.BuildTools --source winget `
  --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" `
  --accept-package-agreements --accept-source-agreements
```

或手动下载安装：访问 <https://visualstudio.microsoft.com/visual-cpp-build-tools/>，安装时勾选：
- **MSVC - VS C++ x64/x86 build tools**
- **Windows SDK**

### 配置 Cargo 国内镜像（可选）

在 `~/.cargo/config.toml` 中配置 rsproxy 镜像，加速 crate 下载：

```toml
[source.crates-io]
replace-with = 'rsproxy-sparse'

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[net]
git-fetch-with-cli = true
```

## 快速开始

```bash
# 安装前端依赖
npm install

# 仅前端开发（无需 Rust 环境）
npm run dev

# Tauri 桌面应用开发（需要 Rust 环境）
npm run tauri:dev

# 构建桌面应用安装包
npm run tauri:build
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 前端开发服务器（端口 1420） |
| `npm run build` | 类型检查 + 前端生产构建 |
| `npm run type-check` | 仅运行 TypeScript 类型检查 |
| `npm run lint` | ESLint 检查并自动修复 |
| `npm run format` | Prettier 格式化源码 |
| `npm run tauri:dev` | 启动 Tauri 桌面应用开发模式 |
| `npm run tauri:build` | 构建桌面应用安装包 |

## 发布 GitHub Release

仓库通过 `.github/workflows/release.yml` 自动构建 Windows、macOS 和 Linux 安装包。发布前请确保 `package.json`、`src-tauri/Cargo.toml` 与 `src-tauri/tauri.conf.json` 中的版本号保持一致。

提交版本变更后，创建并推送以 `v` 开头的标签：

```powershell
git tag v0.1.0
git push origin v0.1.0
```

工作流完成后会在 GitHub Releases 中生成草稿版本，并自动附加各平台安装包。Windows 会同时提供两种安装程序：

- `.exe`：NSIS 安装程序，适合大多数用户直接下载安装
- `.msi`：Windows Installer 安装包，适合系统管理和批量部署

检查发布说明和附件无误后，在 GitHub 页面点击 **Publish release** 正式发布。

也可以在 GitHub 仓库的 **Actions → Release → Run workflow** 中手动运行，填写 `v0.1.0` 形式的版本标签。正式发布仍建议直接推送版本标签，以确保 Release 标签和项目版本号一致。

## 目录结构

```text
lume/
├── src/                        # 前端源码
│   ├── components/             # Vue 组件
│   │   ├── TitleBar.vue        # 标题栏
│   │   ├── SideBar.vue         # 侧栏
│   │   ├── EditorPane.vue      # 编辑区
│   │   ├── PreviewPane.vue     # 预览区
│   │   └── StatusBar.vue       # 状态栏
│   ├── styles/                 # 全局样式
│   │   ├── tokens.css          # 设计 Token（颜色、排版、间距等）
│   │   ├── reset.css           # 基础重置
│   │   └── index.css           # 样式入口
│   ├── types/                  # TypeScript 类型与桥接
│   │   └── tauri.ts            # Tauri 命令桥接层
│   ├── App.vue                 # 应用根组件
│   ├── main.ts                 # 前端入口
│   └── env.d.ts                # 环境类型声明
├── src-tauri/                  # Tauri / Rust 后端
│   ├── src/
│   │   ├── lib.rs              # 应用入口与插件注册
│   │   ├── main.rs             # 二进制入口
│   │   ├── commands.rs         # Tauri 命令定义
│   │   └── error.rs            # 统一错误处理
│   ├── capabilities/           # 权限配置
│   ├── Cargo.toml              # Rust 依赖
│   ├── build.rs                # 构建脚本
│   └── tauri.conf.json         # Tauri 配置
├── docs/                       # 项目文档
├── index.html                  # HTML 入口
├── package.json                # 前端依赖与脚本
├── tsconfig.json               # TypeScript 配置
├── vite.config.ts              # Vite 配置
├── .eslintrc.cjs               # ESLint 配置
├── .prettierrc.json            # Prettier 配置
└── .editorconfig               # 编辑器格式约定
```

## 设计 Token

设计 Token 定义在 `src/styles/tokens.css` 中，通过 CSS 自定义属性实现主题切换。

- 所有 Token 以 `--lume-` 前缀命名。
- 亮色主题为默认，暗色主题通过 `:root[data-theme='dark']` 覆盖。
- 组件中直接引用 Token 变量，禁止硬编码颜色值。

### 主要分类

| 分类 | 示例 | 说明 |
| --- | --- | --- |
| 颜色 | `--lume-bg-base`、`--lume-text-primary` | 背景与文字 |
| 品牌色 | `--lume-accent-default` | 强调与交互 |
| 语义色 | `--lume-color-success`、`--lume-color-danger` | 状态反馈 |
| 排版 | `--lume-font-size-base`、`--lume-line-height-normal` | 字体与行高 |
| 间距 | `--lume-space-1` ~ `--lume-space-12` | 布局间距 |
| 圆角 | `--lume-radius-sm` ~ `--lume-radius-xl` | 边角圆角 |
| 阴影 | `--lume-shadow-sm` ~ `--lume-shadow-xl` | 层级投影 |
| 布局 | `--lume-titlebar-height`、`--lume-sidebar-width` | 应用壳尺寸 |

## Tauri 命令边界

### 命名规范

- 所有 Lume 自定义命令以 `lume_` 前缀命名，避免与插件命令冲突。
- 命令名使用下划线分隔的小写形式（如 `lume_health_check`）。

### 错误处理

- Rust 端所有命令返回 `LumeResult<T>`（即 `Result<T, LumeError>`）。
- `LumeError` 使用 `thiserror` 派生，通过 `serde` 序列化为 `{ kind, message }` 结构。
- 前端通过 `src/types/tauri.ts` 桥接层统一调用，错误以 `LumeError` 类型返回。
- 前端组件不直接调用 `invoke`，必须通过桥接模块访问原生能力。

### 添加新命令

1. 在 `src-tauri/src/commands.rs` 中定义命令函数，添加 `#[tauri::command]` 宏。
2. 在 `src-tauri/src/lib.rs` 的 `invoke_handler` 中注册命令。
3. 在 `src/types/tauri.ts` 中添加对应的类型化封装函数。
4. 如需新权限，在 `src-tauri/capabilities/default.json` 中声明。

## 提交规范

项目遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```text
<type>(<scope>): <subject>

<body>
<footer>
```

可用类型：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`。