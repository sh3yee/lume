# 在线更新发布配置

Lume 的「偏好设置 → 关于」提供版本、作者、许可证和在线更新。版本取自 `src-tauri/tauri.conf.json`，作者取自 `package.json`。

正式版本通过 Tauri 官方更新器读取 GitHub Release 中的 `latest.json`，下载适合当前系统的安装包并校验签名。下载完成后点击「安装并重启」，应用会先同步编辑内容并暂存当前文档会话；暂存失败时取消安装。下载期间可以继续写作，关闭设置也不会中断下载。开发模式不会执行在线更新。

## 首次启用

新增的 Rust 依赖已在 `src-tauri/Cargo.toml` 声明。在本机准备依赖并更新 `Cargo.lock`：

```powershell
cargo fetch --manifest-path src-tauri/Cargo.toml
```

使用项目已有的 Tauri CLI 生成签名密钥，将密钥保存在仓库以外，并妥善备份：

```powershell
$keyDirectory = Join-Path $env:USERPROFILE '.tauri'
New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null
$keyPath = Join-Path $keyDirectory 'lume-updater.key'
npm run tauri -- signer generate -w $keyPath
```

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 配置：

| 类型     | 名称                                 | 内容                                       |
| -------- | ------------------------------------ | ------------------------------------------ |
| Variable | `LUME_UPDATER_PUBLIC_KEY`            | 生成的 `.key.pub` 文件内容                 |
| Secret   | `TAURI_SIGNING_PRIVATE_KEY`          | 生成的 `.key` 文件内容                     |
| Secret   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 生成密钥时设置的密码；未设置密码时可不配置 |

公钥会嵌入安装包，私钥仅用于签名。后续版本必须继续使用相同密钥，否则已经安装的客户端无法验证更新包。不要将私钥或密码提交到仓库。

## 发布流程

1. 同步 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 和 `src-tauri/tauri.conf.json` 中的版本。
2. 在 `docs/releases/v版本.md` 准备中文发布说明。
3. 推送对应的 `v版本` 标签，或对正确提交运行 Release 工作流。

工作流要求签名配置完整，自动为 Windows、macOS Apple Silicon、macOS Intel 和 Linux 生成安装包、签名和更新清单。各平台构建先上传到草稿 Release，全部成功后检查清单版本、平台、签名及 HTTPS 地址，再公开发布，防止客户端读取尚未上传完整的版本。

若四个平台构建成功、仅最后的发布步骤失败，在 Actions → Release → Run workflow 中选择包含修复的 `main` 分支，`tag` 填写原版本标签，并勾选 `publish_only`。工作流会跳过构建，重新校验已有草稿的更新清单后发布。不要对旧标签运行工作流或直接重跑旧任务来应用工作流修复：它们仍会使用旧提交中的工作流文件。

第一次启用在线更新的版本仍需手动安装；安装该版本后，才能在应用内更新到之后发布的较新版本。旧的 v0.8.5 安装包不具备更新入口，也不会因发布新版本而自动获得此功能。

Windows 使用 NSIS 更新包，安装器完成后重新打开应用。macOS 安装完成后由应用重启。Linux 在线更新适用于 AppImage；DEB、RPM 安装请使用对应包管理器或发布页面。

## 本地打包

普通本地打包保留未配置更新公钥的默认设置，不要求签名密钥。需要验证在线更新时，使用与正式发布相同的密钥，并把带公钥的覆盖配置放入系统临时目录：

```powershell
$keyPath = Join-Path $env:USERPROFILE '.tauri/lume-updater.key'
$env:TAURI_SIGNING_PRIVATE_KEY = $keyPath
# 若密钥有密码，请在当前 PowerShell 会话设置 TAURI_SIGNING_PRIVATE_KEY_PASSWORD。
$updaterConfigPath = Join-Path $env:TEMP 'lume-updater.json'
@{
  bundle = @{ createUpdaterArtifacts = $true }
  plugins = @{ updater = @{ pubkey = (Get-Content -LiteralPath "$keyPath.pub" -Raw).Trim() } }
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $updaterConfigPath -Encoding utf8
npm run tauri:build -- --config $updaterConfigPath
```

使用两个递增版本验证「检查 → 下载 → 安装并重启」及文档会话恢复。更新源固定为仓库最新正式 Release，不从前端接受任意更新源、公钥或安装包地址；签名失败的更新包不会安装。

实现参考：[Tauri Updater 官方文档](https://v2.tauri.app/plugin/updater/)。
