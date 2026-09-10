# 11 · 侧栏行内按钮注入

Status: blocked（无浏览器，两处运行期未知项无法验证）
Blocked by: 08

在工作区行与未分组行上各加一个「一键归档」行内按钮。这是全插件唯一一处必须靠 DOM 改写与 React fiber 回溯的地方——内置侧栏的会话行菜单与工作区行菜单都是硬编码数组，未分组标题连菜单都没有，整个 workspace browser 里也没有任何 `onContextMenu`。

## 形式

两种行**统一**注入行内按钮，位置在 `.rowActions` 里那个「＋」按钮之前。机制单一，不依赖 portal 菜单的出现时机与识别启发式。

未分组行本来就没有菜单可克隆，而它那个「＋新建会话」按钮对未分组是**死的**（`onCreate` 里 `group.workspaceId === undefined` 直接 no-op，上游有测试固化了这一点）。这个位置放归档按钮不与任何现有行为冲突。

**不注入会话行菜单**，明确排除。

## 识别

用 React fiber 上的 `props.group`：

- `group.workspaceId === undefined` → 未分组行（等价判据 `key === ''`）
- 否则为工作区行
- `group.sessionCount` 直接给出数量，可渲染成「一键归档 (N)」；它现成、准确、随归档立即更新

`label` 字段对未分组是**空串**而非「未分组」——本地化字符串是渲染时才取的，不要拿它做判据。

**不要硬编码 CSS 类名**：构建期 lightningcss 以 `[hash]_[local]` 打散，hash 随版本变。可用 `_projectRow` 这类 local 名后缀匹配，但优先用 role/aria 与 fiber。

未分组分组在无成员时**根本不渲染**，注入逻辑必须容忍它随时出现与消失。

`.rowActions` 默认 `display: none`，只在 `:hover` 或菜单展开时显示——注入的按钮会自然继承这个行为，与宿主设计语言一致。

## kill-switch

识别连续落空累计到阈值即**整体停用全部注入**并在控制台给出一条说明。上游改版时绝不把半残行为强加到官方侧栏上。adapter 带版本号，识别规则集中在一处，便于随上游改版整体替换。

## 验收

- 工作区行与未分组行都出现按钮，点击后该组会话进入归档区
- 未分组无成员时不报错
- 人为破坏识别规则后注入整体停用，官方侧栏行为完全不受影响
- 插件卸载后注入的按钮与观察器被清理干净

## Comments

**没有实现，阻塞。** 两处运行期未知项在这台机器上无法验证：

1. 通过 `__reactFiber$<随机后缀>` 键走到 `props.group` 拿工作区 id ——键名带随机后缀，且 fiber 结构完全是 React 内部实现细节，只能在真实渲染树上确认。
2. React 的协调过程会不会把外部注入到 `.rowActions` 里的 DOM 节点清掉 ——只能在真实浏览器里观察重渲染。

开发环境没有浏览器。Node 里 stub `__ModuleLoader__` 能证明 factory 执行、能证明 `slots.register` 被正确调用，但证明不了上面两件事——它们都依赖真实的 React 协调与真实的 DOM。

按要求，不发一个猜出来的实现。

**替代方案（已实现）**：批量归档做在插件自己的面板里，按行提供，数据来自宿主侧新增的 `groups` 端点（`ArchivableGroup { workspaceId, title, visibleCount, archivableCount }`，`workspaceId === undefined` 即未分组行）。成员判据留在宿主上，浏览器侧只展示。这比 DOM 注入耦合更低，也不依赖内置侧栏的 class 名与 DOM 结构——原方案里「别硬编码 lightningcss 哈希、用 `[class*="_rowActions"]` 后缀匹配」这类要求本身就说明了那条路有多脆。

`src/client/panel/BulkActions.tsx` 的文件头注释记录了这个决定的原因。

**若将来要重开这个 issue**，需要的东西是：一台有浏览器的机器，先只做探测（读 fiber 拿 `props.group` 打日志、注入一个节点后触发侧栏重渲染看它还在不在），两项都确认之后再谈实现。
