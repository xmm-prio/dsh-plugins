# @dsh-plugins/session-archive

为 DSH 补上「工作区 → 归档区 → 删除」这条链的最后两环。

DSH 自带归档，但它是单向的：会话一旦被隐藏就再也拿不回来，而会话日志根本没有删除入口。本插件不修改、不遮蔽、不分叉任何内置插件，只以外置插件的形式补上取消归档与删除，并把批量归档做成一次点击。

## 它做什么

- **归档区**：侧栏底部多出一个入口，打开后列出归档集合里的所有会话，带工作区归属、创建时间与日志体积。
- **取消归档**：把会话从归档集合中移出，它回到原来的工作区和原来的位置。
- **删除**：不可逆地移除会话日志。只有已在归档集合中的会话可以被删除——归档是删除的前置动作，用户必须先做出「隐藏它」这个决定，再做出「不要它」这个决定。
- **批量归档**：按工作区或按未分组整行归档，跳过不该动的会话（当前会话、子代理会话）。
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
    ├── panel/
    └── text.ts              # 全部界面文案
```

`host/internals/` 下的三个模块各自封死一处宿主私有形状。宿主哪天改了对应实现，需要改的正好是一个文件。

## 通道

八个端点走 `ctx.connection.fetch.register`，路径为 `/api/session-archive.<操作>`。它们挂在共享的 `/api` 通道上，因此宿主的 Host/Origin 围栏与 token/cookie 校验自动生效——已验证：无 cookie 返回 401，外域 Origin 返回 403。

不使用 `ctx.connection.rpc.handle`：该方法在 0.1.5-rc.1 上必然抛异常（它内部访问未 inject 的 `webServer`），而且异常发生在 `apply` 里，会打死整个宿主进程。也不使用 `ctx.webServer.register` 自注册路由：那样注册的路由完全绕过鉴权，而本插件能删除会话日志。

代价是信封需要自己拆装。信封编解码集中在每一半各一个模块里，端点处理函数从不接触信封。

## 已知限制

- **分叉会话与未落盘会话没有标题。** 标题来自 `sessionProjectionCache` 的检查点。宿主自己的会话列表在这两种情况下也拿不到标题，行为一致。归档区此时显示会话 id。
- **冷会话的 `blank` 一律为假。** `blank` 同样来自投影检查点，没有检查点时宿主自己的冷路径也取 `false`。因此一个从未开始对话、又没有检查点的会话会被算作可见、可归档。这与内置会话列表的判断完全一致。
- **不注入侧栏行内按钮。** 详见下节。
- **删除是单个会话粒度的。** 批量删除是逐个执行，其中一个失败不影响其余，每个会话各自报告结果。

## 为什么批量归档在插件自己的面板里

原计划是往侧栏每一行的 `.rowActions` 里注入一个按钮。这条路依赖两件在浏览器里才能验证的事：通过 `__reactFiber$<随机后缀>` 键找到 `props.group` 拿到工作区 id，以及 React 的协调过程是否会把外部注入的 DOM 节点清掉。开发环境没有浏览器，这两件事都无法验证，因此没有实现——宁可不做，也不发一个猜出来的东西。

替代方案是在插件自己的面板里按行提供批量归档，数据来自宿主侧新增的 `groups` 端点。成员判据留在宿主上，浏览器侧只负责展示，耦合度比 DOM 注入更低。

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
