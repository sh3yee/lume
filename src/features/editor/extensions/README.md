# Markdown 扩展约定

编辑器扩展按 Markdown 能力组织，而不是按底层库组织。每个扩展必须同时说明 WYSIWYG、源码模式和 Preview 中的行为，Markdown 始终是持久化真源。

## 目录与命名

- 每项能力位于 `extensions/<name>/index.ts`，目录使用小写 kebab-case。
- Milkdown 接入函数命名为 `use<Name>WysiwygExtension`，接收并返回 `Editor`，以支持链式装配。
- markdown-it 接入函数命名为 `use<Name>PreviewExtension`，接收并返回 `MarkdownIt`。
- `extensions/index.ts` 是编辑器内核使用的唯一装配入口；根组件不直接导入具体扩展。
- 扩展专属命令放在同目录的 `commands.ts`，扩展专属样式放在 `styles.css`，并由该扩展的公开入口导出或引入。没有实际实现时不创建占位文件。

## 接入要求

1. WYSIWYG 接入点只注册该能力所需的 Milkdown preset、schema、remark、ProseMirror 插件或 NodeView。
2. Preview 接入点只配置与该能力对应的 markdown-it 规则或渲染器。
3. 源码模式不维护独立文档状态，只编辑同一份 Markdown。
4. 重型渲染不得阻塞普通键入；必要时在 Preview 侧延迟执行或缓存结果。

## 手动验收

每个扩展至少验证以下 Markdown 往返流程：

1. 在 WYSIWYG 中创建或编辑语法并保存。
2. 切换源码模式，确认 Markdown 可读且没有无关改写。
3. 切换 Preview，确认语义和样式一致。
4. 重新打开文件，再次切换三个模式，确认内容保持一致。
5. 验证空内容、嵌套内容、中文输入、撤销和重做等相关边界。
