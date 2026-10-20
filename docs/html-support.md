# HTML 兼容

HTML 扩展参考 [Typora 的 HTML 支持](https://support.typora.io/HTML/)，与普通 Markdown 共用文档、保存和撤销历史。

## 行内 HTML

`<u>`、`<span style="color:red">`、`<sup>`、`<sub>`、`<kbd>`、`<ruby>` 等共用行内容器，闭合标签后显示效果。行内可以嵌套 Markdown 格式，也可以直接修改其中的文字。HTML 实体由 Markdown 解析器转换为对应字符。

Ctrl / Cmd + 点击行内 HTML 可展开源码，Ctrl / Cmd + Enter、Escape 或移出选区后收起。未补全的内容继续保留源码。空标签和 `display:none` 内容在编辑器中可见，预览保留原本的隐藏语义。

## HTML 块

块级标签、SVG、视频、音频和 iframe 共用 HTML 对象的渲染与源码编辑。点击非交互区域、Ctrl / Cmd + 点击或通过键盘选中对象可编辑源码；点击“完成”或按 Ctrl / Cmd + Enter 退出。折叠标题和媒体控件保留自身交互。

HTML 块内不解析 Markdown；块的划分遵循 CommonMark。注释以及 `script`、`style`、`meta` 等不可见内容在编辑器中显示源码，在预览中不产生可见内容。

图片、视频、音频、媒体封面及子资源的相对路径使用当前文档的图片路径解析规则。HTML 块中的链接通过现有文档链接入口打开。媒体播放和远程嵌入取决于 WebView 支持及站点的嵌入策略。

## 源码与渲染规则

原始标签和属性随 Markdown 保存。渲染副本仅接受常见 HTML / SVG 标签、支持的属性及展示样式；`class`、`id`、`data-*`、事件属性和未知属性不应用到页面。脚本、样式表、外部对象及自定义组件不会获得执行能力。

iframe 仅接受 HTTP(S) 地址，并固定添加不含 `allow-same-origin` 的 sandbox；不接受调用方的 sandbox 或 srcdoc。依赖页面脚本执行的第三方分享代码没有单独的服务商白名单，应使用提供方的 iframe 嵌入地址。

统一入口位于 `src/features/editor/extensions/html`：标签与属性规则、Markdown 转换、节点结构、编辑交互和预览渲染各自集中维护。新增普通标签通常只需补充支持集合及允许的属性，无需复制解析、保存和编辑逻辑。
