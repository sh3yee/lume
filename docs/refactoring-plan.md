# Lume 重构计划

本文档记录 Lume 的架构重构目标、模块边界、实施阶段和完成进度。产品功能优先级参见 [产品与开发路线图](roadmap.md)，开发命令与环境约定参见 [开发说明](development.md)。

## 状态说明

- `[ ]`：尚未开始或尚未通过验收。
- `[x]`：已经完成并通过对应阶段的检查。
- 任务只有在代码迁移完成、现有行为未发生非预期变化且手动验收通过后才能勾选。
- 每次合并重构提交时同步更新本文档，避免代码与计划状态不一致。

## 当前进度

| 阶段 | 状态 | 目标 |
| --- | --- | --- |
| 架构审查 | 已完成 | 识别当前热点文件、职责混合和后续扩展风险 |
| Phase 0：应用壳 | 已完成 | 将全局生命周期和用户偏好移出根组件 |
| Phase 1：文档与文件 | 已完成 | 分离状态、会话、业务命令与文件 IO |
| Phase 2：编辑器内核 | 进行中 | 拆分 Milkdown 初始化、插件和 Overlay UI |
| Phase 3：Markdown 扩展 | 未开始 | 建立 WYSIWYG 与 Preview 的成对扩展约定 |
| Phase 4：平台与 Rust | 未开始 | 按领域拆分 Tauri 桥接、命令与后台服务 |
| Phase 5：工作区能力 | 未开始 | 在稳定边界上实现工作区、监听和冲突处理 |

## 重构原则

1. **不推倒重写**：保留现有 Milkdown、markdown-it 和文档流程，采用小步迁移。
2. **Markdown 是持久化真源**：所见即所得、源码编辑与预览都围绕同一份 Markdown 工作。
3. **编辑器是适配器**：编辑器负责事务、选区、输入法和撤销历史，不承担文件 IO。
4. **Store 不做 IO**：业务状态与 `localStorage`、文件系统、Tauri 调用分离。
5. **组件不访问平台 API**：Vue 组件通过业务命令或服务访问原生能力。
6. **功能按领域聚合**：优先采用 `features` 垂直模块，而不是继续向全局 `components`、`composables` 和 `utils` 堆放文件。
7. **扩展成对实现**：新的 Markdown 能力必须同时考虑 Milkdown 编辑、Markdown 往返、markdown-it 预览和内容样式。
8. **先验证再勾选**：每个阶段必须通过构建、类型检查和用户手动验收。

## 已完成的架构审查

- [x] 阅读产品路线图并确认 Phase 1 至 Phase 5 的主要架构需求。
- [x] 梳理前端应用壳、文档状态、文件流程、编辑器和 Tauri 桥接边界。
- [x] 确认 `App.vue` 混合布局、主题、窗口状态、快捷键、会话持久化和拖放流程。
- [x] 确认 `WysiwygPane.vue` 混合编辑器创建、插件、图片、搜索、工具栏、菜单和样式。
- [x] 确认 `useDocument.ts` 混合文档状态、统计、关闭队列和会话持久化。
- [x] 确认 `useFileOps.ts` 混合业务流程、浏览器降级、原生 IO 和图片暂存迁移。
- [x] 确认 `types/tauri.ts` 与 Rust `commands.rs` 已包含多个领域，需要按能力拆分。
- [x] 形成“应用壳 + 业务 Feature + 编辑器内核 + 平台适配层 + Shared”的目标架构。

## 目标目录结构

目录按实际迁移进度逐步创建，不提前保留无内容的空目录。

```text
src/
├── app/
│   ├── AppShell.vue
│   ├── bootstrap.ts
│   ├── commands/
│   ├── lifecycle/
│   └── preferences/
├── features/
│   ├── documents/
│   │   ├── components/
│   │   ├── commands/
│   │   └── model/
│   ├── editor/
│   │   ├── components/
│   │   ├── extensions/
│   │   ├── preview/
│   │   ├── styles/
│   │   └── wysiwyg/
│   ├── files/
│   ├── images/
│   ├── settings/
│   └── workspace/
├── platform/
│   ├── browser/
│   └── tauri/
├── shared/
│   ├── components/
│   ├── lib/
│   └── styles/
├── styles/
├── App.vue
└── main.ts
```

Rust 后端目标结构：

```text
src-tauri/src/
├── commands/
│   ├── files.rs
│   ├── images.rs
│   ├── mod.rs
│   ├── system.rs
│   └── workspace.rs
├── services/
│   ├── image_assets.rs
│   ├── mod.rs
│   └── workspace_scanner.rs
├── error.rs
├── lib.rs
└── main.rs
```

## 模块依赖规则

- `app` 负责应用启动、生命周期和业务模块组合，不实现编辑器或文件领域逻辑。
- `features` 按业务领域组织组件、状态、命令和服务。
- `platform` 只封装 Tauri、浏览器和操作系统差异，不修改 Vue 业务状态。
- `shared` 只存放无业务归属的通用组件、样式和纯工具，不依赖任何 Feature。
- Feature 之间通过公开入口、命令或服务协作，不导入其他 Feature 的内部实现。
- Vue 组件不得直接调用 `invoke`、Tauri 文件插件或 `localStorage`。
- Milkdown 与 markdown-it 的具体实现限制在编辑器 Feature 内。

## Phase 0：应用壳瘦身

### 任务

- [x] 将主题读取、解析、持久化和系统主题监听迁移到 `app/preferences`。
- [x] 将窗口尺寸、最大化状态和恢复逻辑迁移到 `app/lifecycle`。
- [x] 将应用级快捷键注册迁移到 `app/commands`。
- [x] 将文件和图片拖放分发迁移到独立生命周期模块。
- [x] 将文档会话持久化调度移出 `App.vue`。
- [x] 将全局错误反馈统一为应用级反馈入口。
- [x] 让 `App.vue` 只保留应用壳组合和少量顶层状态连接。

### 完成标准

- [x] 主题、窗口恢复、快捷键和拖放行为与重构前一致。
- [x] `App.vue` 不再直接实现平台调用和持久化细节。
- [x] 构建、类型检查和用户手动验收通过。

## Phase 1：文档状态与文件流程

### 文档模型

- [x] 将文档统计提取为无副作用纯函数。
- [x] 将会话编解码、版本校验和恢复提取为独立模块。
- [x] 将会话存储实现与文档内存状态分离。
- [x] 将文档列表、活动文档、内容和 dirty 状态整理为明确的 Document Store。
- [x] 将标签关闭确认队列改为职责明确的业务流程。
- [x] 区分持久化内容状态与编辑器选区、撤销历史等会话状态。

### 文件流程

- [x] 建立浏览器文件 Adapter。
- [x] 建立 Tauri 文件 Adapter。
- [x] 建立文档文件 Service，统一打开、保存和另存为流程。
- [x] 建立文档 Command，负责组合文件 Service 与 Document Store。
- [x] 将图片暂存迁移从通用文件操作中移入图片领域服务。
- [x] 实现“另存为”。
- [x] 实现关闭应用时的未保存修改保护。

### 完成标准

- [x] Document Store 不直接访问 `localStorage`、文件系统或 Tauri API。
- [x] 文件 Adapter 不直接修改 Vue 文档状态。
- [x] 新建、打开、保存、另存为、关闭标签和退出保护均通过手动验收。
- [x] 构建和类型检查通过。

## Phase 2：拆分编辑器内核

### 公共内容层

- [x] 提取 WYSIWYG 与 Preview 共用的 Markdown 内容样式。
- [x] 保留 WYSIWYG 的选区、NodeView 和编辑态专用样式。
- [x] 保留 Preview 的只读渲染和滚动容器专用样式。

### Overlay UI

- [x] 提取文本选区浮动工具栏。
- [x] 提取图片工具栏。
- [x] 提取编辑器右键菜单。
- [x] 提取查找替换组件及其 UI 状态。
- [x] 提取 Overlay 定位与窗口边界约束逻辑。

### Milkdown 内核

- [ ] 提取 Milkdown 创建与销毁逻辑。
- [ ] 提取基础 Markdown 和 GFM 配置。
- [ ] 提取搜索高亮插件。
- [ ] 提取代码块退出与空代码块转换插件。
- [ ] 提取图片 Schema 与 Markdown 转换。
- [ ] 提取图片 NodeView、缩放和对齐逻辑。
- [ ] 提取图片粘贴、拖放和 URL 转换逻辑。
- [ ] 将编辑器命令整理为稳定的命令入口。
- [ ] 让 WYSIWYG Vue 组件只负责挂载、生命周期、文档同步和 Overlay 组合。

### 源码编辑与预览

- [x] 将 textarea 源码编辑器迁移为独立 `SourceEditor` 组件。
- [x] 固定源码编辑器与 Document Store 的输入输出边界。
- [x] 将 markdown-it 创建和扩展配置移出 Preview Vue 组件。
- [ ] 在上述边界稳定后单独评估 CodeMirror 6 迁移。

### 完成标准

- [ ] `WysiwygPane.vue` 不再定义具体 Milkdown 插件与图片 NodeView。
- [ ] Preview 组件不再直接配置全部 markdown-it 规则。
- [ ] 中文输入法、选区、撤销重做、搜索替换和图片操作通过人工回归。
- [ ] 常用 Markdown 往返用例通过。

## Phase 3：Markdown 扩展体系

### 内部扩展约定

- [ ] 定义内部 Markdown 扩展目录和命名约定。
- [ ] 定义每个扩展的 Milkdown 接入点。
- [ ] 定义每个扩展的 markdown-it 接入点。
- [ ] 定义扩展命令与样式入口。
- [ ] 定义扩展的 Markdown 往返手动验收要求。

### 迁移现有能力

- [ ] 将基础 Markdown 整理为 `base` 扩展。
- [ ] 将表格、任务列表和删除线整理为 `gfm` 扩展。
- [ ] 将图片编辑和预览整理为 `images` 扩展。
- [ ] 将文档内搜索整理为 `search` 扩展。
- [ ] 将代码块交互整理为 `code-block` 扩展。

### 接入路线图能力

- [ ] 接入 KaTeX 数学公式编辑与预览。
- [ ] 接入 Mermaid 图表编辑与预览。
- [ ] 接入脚注编辑与预览。
- [ ] 接入高质量代码语法高亮。
- [ ] 为所有新增扩展补充往返和性能手动验收项。

### 完成标准

- [ ] 新增 Markdown 能力不需要修改编辑器根组件的核心生命周期。
- [ ] 每项语法在 WYSIWYG、源码与 Preview 中具有明确行为。
- [ ] 普通键入不因重型扩展同步渲染而明显卡顿。

## Phase 4：平台桥接与 Rust 模块

### 前端平台层

- [ ] 将通用 Tauri 调用封装迁移到 `platform/tauri/client.ts`。
- [ ] 按文件、图片、工作区和窗口拆分 Tauri API。
- [ ] 将浏览器文件降级实现迁移到 `platform/browser`。
- [ ] 统一平台错误向业务错误的转换方式。
- [ ] 更新开发文档中的 Tauri 桥接路径和新增命令流程。

### Rust 后端

- [ ] 将 `commands.rs` 拆分为文件、图片、工作区和系统命令模块。
- [ ] 将图片资源存储逻辑提取到 Service。
- [ ] 将工作区扫描逻辑提取到 Service。
- [ ] 保持所有公开命令使用 `lume_` 前缀和统一错误模型。
- [ ] 手动验收路径校验、图片路径转换和工作区扫描行为。
- [ ] 确保命令函数保持轻量，耗时能力可迁移至后台任务。

### 完成标准

- [ ] Vue 组件中不存在直接的 Tauri `invoke` 或插件调用。
- [ ] Rust 命令模块不再混合多个领域的具体实现。
- [ ] 前端构建、Rust 检查和用户手动验收通过。

## Phase 5：工作区与外部文件变化

- [ ] 建立 Workspace Store 与工作区 Service。
- [ ] 实现工作区文件树及折叠状态。
- [ ] 实现新建、重命名、移动和删除文档。
- [ ] 在 Rust 后台实现文件监听。
- [ ] 定义外部修改事件的数据结构和前端处理流程。
- [ ] clean 文档发生外部修改时安全刷新。
- [ ] dirty 文档发生外部修改时进入冲突状态，不静默覆盖。
- [ ] 处理外部删除和重命名。
- [ ] 增加源文件自动保存策略和失败反馈。
- [ ] 为工作区扫描和文件监听建立性能基线。

### 完成标准

- [ ] 外部修改不会静默覆盖用户未保存内容。
- [ ] 工作区扫描与监听不阻塞普通编辑操作。
- [ ] 多文档、会话恢复和文件树状态通过用户手动验收。

## 每阶段通用验收清单

- [ ] 没有删除仍有价值的现有注释；迁移时同步修正失效注释。
- [ ] 没有为目录整齐而创建无实现内容的空模块。
- [ ] 没有新增不必要的跨 Feature 内部导入。
- [ ] `npm run type-check` 通过。
- [ ] `npm run build` 通过。
- [ ] Tauri 相关阶段执行 Rust 检查和桌面手动验收。
- [ ] 中文输入法连续输入正常。
- [ ] 光标、选区、撤销和重做正常。
- [ ] Markdown 保存后重新打开内容一致。
- [ ] 更新本文档中对应任务的勾选状态。

## 建议提交顺序

为降低回归风险，建议每个阶段拆为可独立验证的提交或 PR：

1. `refactor(app): extract lifecycle and preferences`
2. `refactor(documents): separate store session and file commands`
3. `refactor(editor): extract markdown styles and overlays`
4. `refactor(editor): modularize milkdown extensions`
5. `refactor(platform): split tauri capability adapters`
6. `refactor(tauri): split commands and domain services`

## 暂不纳入本轮重构

- 不在边界稳定前更换 Milkdown。
- 不把迁移 CodeMirror 6 与 Milkdown 拆分放在同一阶段。
- 不为目录规范强制引入 Pinia；仅在状态复杂度确有需要时评估。
- 不提前实现面向第三方的动态插件系统。
- 不在需求尚未验证时设计同步、账号或云端抽象。
