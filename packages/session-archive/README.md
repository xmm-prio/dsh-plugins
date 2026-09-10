# @dsh-plugins/session-archive

为 DSH 补上「工作区 → 归档区 → 删除」这条链的最后两环。

DSH 自带归档，但它是单向的：会话一旦被隐藏就再也拿不回来，而会话日志根本没有删除入口。本插件不修改、不遮蔽、不分叉任何内置插件，只以外置插件的形式补上取消归档与删除，并把批量归档做成一次点击。

## 它做什么

- **归档区**：侧栏底部多出一个入口，打开后列出归档集合里的所有会话，带工作区归属、创建时间与日志体积。
- **取消归档**：把会话从归档集合中移出，它回到原来的工作区和原来的位置。
- **删除**：不可逆地移除会话日志。只有已在归档集合中的会话可以被删除——归档是删除的前置动作，用户必须先做出「隐藏它」这个决定，再做出「不要它」这个决定。
- **批量归档**：内置侧栏的每个工作区行与未分组行上多出一个归档按钮，一次点击归档整行，跳过不该动的会话（当前会话、子代理会话）。
- **全部停机**：一次性停止所有活体会话，用于收工。

## 安装

```bash
dsh plugin add @dsh-plugins/session-archive
```

## 配置

只有一项，且通常不需要填：

```yaml
session-archive:
  # 会话日志的根目录。仅在删除路径遇到旧版格式的日志时用到。
  sessionRoot: ~/.dsh/sessions
```

`sessionRoot` 是一个逃生口，不是常规配置。JSONL 后端的 `resolveCurrentLog` 对旧版格式的日志返回 `undefined`——文件确实存在，但后端拒绝指出它在哪。此时插件不会把它当成「无可删除」，而是报告一个独立的拒绝原因；配了 `sessionRoot` 之后，插件会在该目录下按会话 id 扫描出日志目录并正常删除。

不配它的后果是明确的：旧版格式的会话删不掉，界面上会说明原因。除此之外没有任何影响。

## 能力探测

插件启动时探测宿主上每一项能力所依赖的形状，探测结果直接决定界面上哪些按钮可用。任一探测失败不会让插件崩溃，也不会影响宿主启动——只会让对应能力标记为不可用，并在归档区里说明缺了什么。

| 能力 | 依赖 | 失效时的表现 |
| --- | --- | --- |
| 归档 | `workspaceRegistry` 的归档写入路径 | 批量归档不可用 |
| 取消归档 | 归档 + `storageDomain` 的 workspace 域可读写 | 取消归档不可用 |
| 停机 | cordis registry 上可扫描的 agent 生命周期 effect | 全部停机不可用 |
| 删除 | 停机 + 取消归档 + JSONL 后端的日志定位 | 删除不可用 |
| 元数据 | `sessionProjectionCache` | 归档区仍可用，但只显示会话 id，不显示标题 |

删除同时依赖停机与取消归档不是耦合，而是删除本身的语义：不停机就删日志会在写租约还被持有时抽掉目录；删完之后必须把 id 从归档集合里移出，否则归档区会留下一条指向不存在会话的记录。

## 结构

```text
src/
├── contract.ts              # 两半共享的唯一接口：端点名、载荷与返回形状
├── config.ts
├── index.ts                 # 宿主侧入口
├── domain/                  # 纯函数，不碰宿主
│   ├── grouping.ts          # 可见性与可归档性判据
│   ├── session-id.ts        # 会话 id 校验
│   └── fs-guard.ts          # 删除路径的目录归属校验
├── host/
│   ├── internals/           # 唯一允许触碰宿主私有形状的地方
│   │   ├── workspace-state.ts
│   │   ├── agent-effects.ts
│   │   └── jsonl-backend.ts
│   ├── transport/
│   │   └── endpoint-router.ts   # 宿主侧唯一处理信封的模块
│   ├── capabilities.ts
│   ├── archive-writer.ts
│   ├── agent-teardown.ts
│   ├── log-remover.ts
│   ├── metadata-reader.ts
│   ├── service.ts           # 编排层，能力门禁只在这里
│   └── errors.ts            # 按 error.name 识别宿主错误，不 import 宿主错误类
└── client/
    ├── index.ts             # 浏览器侧入口
    ├── transport/
    │   └── archive-api.ts   # 浏览器侧唯一处理信封的模块
    ├── panel/               # 归档区
    ├── sidebar/             # 侧栏行内按钮
    │   ├── adapter.ts       # 唯一识别内置侧栏 DOM 与 fiber 的地方，带版本号
    │   ├── row-buttons.ts   # 注入、幂等重扫、kill-switch
    │   └── install.ts       # 观察器与生命周期
    └── text.ts              # 全部界面文案
```

`host/internals/` 下的三个模块各自封死一处宿主私有形状，`client/sidebar/adapter.ts` 封死侧栏的 DOM 与 fiber 形状。宿主哪天改了对应实现，需要改的正好是一个文件。

## 通道

七个端点走 `ctx.connection.fetch.register`，路径为 `/api/session-archive.<操作>`。它们挂在共享的 `/api` 通道上，因此宿主的 Host/Origin 围栏与 token/cookie 校验自动生效——已验证：无 cookie 返回 401，外域 Origin 返回 403。

不使用 `ctx.connection.rpc.handle`：该方法在 0.1.5-rc.1 上必然抛异常（它内部访问未 inject 的 `webServer`），而且异常发生在 `apply` 里，会打死整个宿主进程。也不使用 `ctx.webServer.register` 自注册路由：那样注册的路由完全绕过鉴权，而本插件能删除会话日志。

代价是信封需要自己拆装。信封编解码集中在每一半各一个模块里，端点处理函数从不接触信封。

## 已知限制

- **分叉会话与未落盘会话没有标题。** 标题来自 `sessionProjectionCache` 的检查点。宿主自己的会话列表在这两种情况下也拿不到标题，行为一致。归档区此时显示会话 id。
- **冷会话的 `blank` 一律为假。** `blank` 同样来自投影检查点，没有检查点时宿主自己的冷路径也取 `false`。因此一个从未开始对话、又没有检查点的会话会被算作可见、可归档。这与内置会话列表的判断完全一致。
- **侧栏行上的数字是侧栏的可见数，不是可归档数。** 数字直接取自宿主的 `group.sessionCount`，里面可能含有当前空会话这类会被跳过的成员。差额由点击后的结果文案交代（「已归档 2 个会话；跳过 1 个（空会话不归档）」），插件不在浏览器里另算一遍。
- **归档区的列表是平铺的**，按最近活动排序，工作区归属以标签呈现，没有分组容器，也没有搜索框。
- **删除是单个会话粒度的。** 批量删除是逐个执行，其中一个失败不影响其余，每个会话各自报告结果。

## 侧栏行内按钮

内置侧栏没有任何靠近行的扩展点：工作区行的菜单是硬编码数组，未分组行连菜单都没有。所以这一个功能是全插件唯一一处 DOM 改写与 React fiber 回溯，`client/sidebar/` 三个文件是它的全部。

行的身份不靠猜，直接读侧栏自己传给行组件的 `props.group`：`workspaceId === undefined` 即未分组行，数量取 `group.sessionCount`。按钮插在该行「＋」之前，`className` 克隆同一行的「＋」，所以尺寸、配色、悬停才显形这些行为全部随宿主走——插件不写一行 CSS，也不出现任何 lightningcss 哈希。点击只把「哪一行」发给宿主，成员判据留在宿主上。

识别规则集中在 `adapter.ts` 一个文件里并带版本号。**识别累计落空 8 次即整体停用**：移除全部已注入的按钮，在 console 打一条带版本号的说明，此后不再注入。宿主改版时的结果是这个功能消失，而不是官方侧栏上留下半残的东西。

这条路依赖的两件事已在真实浏览器上实测（见 `.scratch/session-archive/host-internals.md` §11.5）：fiber 深度**不是常数**（工作区行 4 层、未分组行 2 层），所以用有界向上搜索加形状校验；React **不会**清掉注入的节点，只有整行 unmount（侧栏收成 56px 轨、视口收窄）会连带带走它，因此模块的重心是重扫幂等而不是抢救节点。

## 与 AGENTS.md 的两处出入

`AGENTS.md` 里有两条说法在 DSH 0.1.5-rc.1 上不成立，本包按实际行为实现：

1. **「overlay 中的插件路径必须为绝对路径」** —— 相对路径可用，`./` 与 `../` 相对 overlay 文件本身解析。本包的 `cordis.yml` 就用相对路径，这在 monorepo 里更合适。
2. **「必须显式 inject，不能用 `ctx.get`」** —— 方向相反。属性访问 `ctx.foo` 才需要 `inject`；`ctx.get('foo')` 绕过 Guard，无需声明。本包因此把硬依赖（`connection`、`workspaceRegistry`、`sessionPersistence`）放进 `inject` 并用属性访问，把可降级的软依赖（`storageDomain`、`sessionProjectionCache`、`agents`）用 `ctx.get(name)?.` 读取——后者正是宿主自己的可选依赖写法。

`AGENTS.md` 是用户所有的规则文件，本次未做修改。

## 开发

```bash
pnpm install
pnpm --filter @dsh-plugins/session-archive build   # 产出 lib/index.js 与 lib/client.js
pnpm test
```

本地挂载调试：

```bash
dsh --profile web --patch packages/session-archive/cordis.yml --no-open
```

### 端到端回归

`e2e/` 下有一套 Playwright 回归，跑真实 DSH、真实 Chromium、真实数据：

```bash
pnpm --filter @dsh-plugins/session-archive build
node packages/session-archive/e2e/verify.mjs        # 加 --headed 看着它跑
```

它会另起一个 DSH web 进程、从 stdout 抓一次性 token、把 `DSH_HOME` 指到临时目录，用宿主自己的 `workspaceRegistry` / `sessionPersistence` 造工作区与会话，跑完连同临时目录一起删掉——不碰你的 `~/.dsh`。需要全局装好 DSH，或用 `DSH_BIN` 指到它的 `lib/bin.js`。

保留它的理由只有一条：侧栏行内按钮依赖宿主未公开的 DOM 层级与 fiber 形状，而 kill-switch 的行为是**静默停用**。没有这套回归，下一次 DSH 升级会让这个功能悄无声息地消失。单测里那份 jsdom fixture 是照真实 DOM 量出来的，也只有它能告诉你 fixture 过期了。

Playwright 是**仓库根的 devDependency**，不是本包的依赖，更不是 `@deepseek-ai/*` 的兄弟包。
