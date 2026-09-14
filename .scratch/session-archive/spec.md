# session-archive 规格

为 DSH 补上「工作区 → 归档区 → 删除」这条会话生命周期链路。宿主自带的归档是**单向**的：会话进得去出不来，而且从来没有任何删除会话日志的手段。本插件把这条链路补完，并且**不修改、不遮蔽、不 fork 任何内置插件**。

术语一律以仓库根的 `CONTEXT.md` 为准。

本文对宿主内部形状的断言已在 `0.1.5-rc.1` 上逐条核实，结果见 `host-internals.md`。**两者冲突时以核实报告为准**——下文中被推翻的部分已就地更正，并在括号里标注报告的章节号。

## 目标

1. 一键归档一个工作区中的所有会话，以及未分组中的所有会话。
2. 一个「归档区」面板，查看归档会话，并支持取消归档（回到原工作区原位置）。
3. 在归档区中删除会话日志：单个、多选批量、一键全部。
4. 关闭运行中的会话，释放它们占用的资源：在归档区一次性关闭**后台**运行中的会话，在会话标题栏关闭**这一个**会话。

## 非目标

- **移除工作区后自动归档其会话**。这一条曾在需求里，已明确排除。宿主的 `WorkspaceRegistry.delete` 是有意让会话落入未分组的，本插件不改变该行为。
- 回收站、撤销窗口、定时清理。删除是终点。
- 向内置侧栏的**会话行**菜单注入任何东西。
- 跨工作区移动会话。

## 宿主约束

以下均在 `0.1.5-rc.1` 上核实。它们不是实现细节，而是塑造了整个设计的硬约束。

**没有 unarchive。** `WorkspaceRegistry` 只有 `archiveSession`，其 README 写明「Archiving is one-way」。归档集合是 `workspace` 存储域 global 上的 `archivedSessionIds`。

**没有删除。** `SessionPersistence` 的抽象方法只有 `create` / `open` / `flush` / `stat` / `list`。删除日志只能由插件自己动文件系统。

**没有按 id 拆 agent 的公开手段。** `AgentRegistry` 没有 `stop` / `dispose(id)`；`AgentHandle` 只发给创建者，而 Web 端的 `ApiSessionAgentController` 在 `resume` 后把它解构丢弃了。因此连 DSH 自己都无法再按 id 拆掉一个 Web 会话。也没有任何 idle 回收或 LRU——resume 出来的 agent 活到进程退出。

**内置侧栏几乎没有扩展点。** 会话行菜单与工作区行菜单都是硬编码数组，未分组标题连菜单都没有；整个 workspace browser 里没有任何 `onContextMenu`。工作区侧栏子树里唯一的 slot 孔是目录选择器。

**Windows 上的写锁是命名内核信号量，不是文件锁**，append 时才临时开 fd。目录删除不受句柄阻挡；真正的风险是活 agent 的在途 append，以及它下一批 append 会把目录重新造出来。

**在 UI 里打开一个会话就会把它 resume 成活 agent**（`follow` 拿到冷快照后自动 promote）。

## 架构

单个包 `packages/session-archive`，含宿主半与浏览器半。

```
宿主半                                  浏览器半
─────────────────────────────────      ─────────────────────────────
能力探测      capability probe          归档区面板（侧栏底部按钮打开）
归档集合写入器 archive writer      ⟷    侧栏行内按钮注入（带 kill-switch）
会话元数据读取 metadata reader
agent 拆除器  agent teardown            经 connection.rpc 通信
日志删除器    log remover
```

宿主半按依赖强度分两档（§12.3）。**硬依赖**——缺了插件就不能工作的 `workspaceRegistry`、`sessionPersistence`、`connection`——显式 `inject`，由框架保证服务就绪后再跑 `apply`。**软依赖**——可降级的 `sessionProjectionCache`、`subagents`——不 inject，用 `ctx.get(name)?.` 读，这是宿主自己的可选依赖范式（`dsh-api-session-controller` 即如此写）。

注意方向：需要 inject 的是**直接属性访问** `ctx.foo`（Guard 会对未声明依赖抛 `cannot get property "foo" without inject`）；`ctx.get('foo')` 绕过 Guard，不需要 inject。浏览器半只 inject `slots`，其余防御式读取。

### 通道

**不能用 `ctx.connection.rpc.handle`——该 API 在 `0.1.5-rc.1` 上必抛。** 它内部执行 `owner.effect(() => owner.webServer.register(route))`，而拿到的 `owner` 的 inject 集合里没有 `webServer`（connection 自己声明的是 `inject = ["credentials"]`），于是抛 `cannot get property "webServer" without inject`，并且因为发生在 `apply` 里，会直接打死整个 harness 的 boot。调用方无法绕过：把 `webServer` 加进自己的 `inject`、包一层 `ctx.effect`、改用 `ctx.inject(['webServer'], ...)`、改用 `ctx.get('connection')`，四种写法实测全部失败。对照同一文件里 connection 给 `/api` 注册路由用的是正确写法 `ctx.inject(["webServer"], (webCtx) => webCtx.effect(...))`，`register()` 这条路径漏了这一步。全量扫描第一方包，没有任何一个调用 `rpc.handle`，所以这条路径从没被走过。详见 `dev-env.md` §9.1。

改用 **`ctx.connection.fetch.register`**，`inject` 只需 `['connection']`：

```js
ctx.connection.fetch.register({
  path: '/api/session-archive.<endpoint>',   // 必须落在 /api 之下
  methods: ['POST'],
  requestBody: 'buffered',
  fetch: async (request) => { /* 返回 Response */ },
})
```

**鉴权自动继承**：这些路由挂在共享 `/api` 通道上，Host/Origin 围栏与 token/cookie 照常施加（实测无 cookie 访问返回 401）。这也是为什么**绝不能**改用 `ctx.webServer.register` 自建路由——那是裸载体，实测无 cookie 直接拿到 200，而本插件能删会话日志。

浏览器侧的编程接口不变，仍是 `ctx.connection.rpc.call('/api', endpoint, payload, signal)`：`createSharedFetchHandler('/api')` 会先查 `fetchRoutes` 再落到 Gateway，所以自注册的路由能被命中。代价是 handler 要自己解析并回吐信封——请求 `{"type":"client-request","rpcId","method","payload"}`（`method` 必须等于 endpoint），响应 `{"type":"server-response","rpcId","result":{"ok":true,"value":{}}}`。endpoint 名受 `/^[A-Za-z0-9_$.-]+$/` 约束，允许 `.` 与 `-`，所以用 `session-archive.list` 这样的点分命名做前缀隔离，路由路径即 `/api/session-archive.list`。

信封的封装/解析必须收敛在一个模块里，两半各一份，端点处理器不碰信封。

### 构建

esbuild，两个 target。浏览器半用 banner/footer 复现宿主的 ModuleLoader 闭包握手（上游的 tsdown 预设未发布到 npm）。握手的字节形状照抄 `dsh-client-ui-cordis/lib/client.js`（§10.1），其中 `id` **必须是完整包名**，短名会在运行时抛 `loaded without registering`；`Symbol.toStringTag` 那行不能省：

```js
banner: { js: "window.__ModuleLoader__.load({ id: '<完整包名>', factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });" },
footer: { js: 'return module.exports; } });' },
```

`external` **不能用通配**（§10.2）。浏览器端 `require()` 只无条件认九个静态种子 specifier：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`。此外的任何 specifier 都要求对方在 boot graph 里有自己的行，**且**本包在 `dsh.client.external` 里显式声明它。esbuild 的 `external` 列表与 `dsh.client.external` 必须逐项对齐。

`dsh.client.inject` 列的是**包名**而非服务名（§1.3），它决定加载顺序；`external` 决定允许 require 谁，两者都要填。

### 配置

只有一项：`sessionRoot`，会话日志根目录。它是纯 escape hatch。其余一切都是行为而非部署参数，不进配置。

**根目录默认向后端本人索取，不来自配置也不写死。** 「旧格式日志必须可删」这一条要求推导路径，而推导必须被一个根目录约束住，因此根目录不能再是可有可无的。取值顺序（实现期确定）：

1. `sessionPersistence.config.root` —— `JsonlSessionPersistence` 的 `config` 在其 `.d.ts` 里是 public，`root: string` 是**必填、无默认值**的配置项，后端自己就是 `this.root = resolve(config.root)`。插件读同一个值、做同一次 `resolve()`，与后端必然一致，同步完成、零 I/O，比抽样 `resolveCurrentLog` 再取公共前缀可靠得多。
2. `sessionRoot` —— 仅用于该属性被挪走的 DSH 版本。排在后端**之后**而非之前：一份留在 `cordis.yml` 里过期的路径绝不能把归属校验指到另一棵树上。

失败模式：两处都问不到时，`deleteLegacy` 能力在启动探测里即被禁用并说明原因，插件不推导任何路径；后端仍能定位的日志照常删除。

## 关键机制

### 取消归档

```
workspaceRegistry.enqueueOperation(async () => {
  domain = storageDomain.get('workspace')
  state  = domain.global.get()
  await domain.global.set({ ...state, archivedSessionIds: next })
  registry.state.archivedSessionIds = next        // 回填内存缓存
})
```

两个要点缺一不可。挂到 `enqueueOperation` 上是为了和官方写入共用同一条互斥链，并且它在跑 operation 之前会先 `await recoverPendingMutation()`——绕过它就跳过了这道恢复。回填 `registry.state` 是因为 `WorkspaceRegistry` 缓存状态且不监听域变更，不回填的话刷新页面就会回滚（生态里已有插件把这一点列为已知限制）。回填照官方 `setState` 的形状整体替换 `registry.state`，不要原地改 `archivedSessionIds` 数组。

`enqueueOperation` 与 `state` 都是 TypeScript `private`，但运行期是真实属性，不是 `#private`。前者是原型方法，后者是实例字段。

**只有写路径需要碰私有成员。** 读归档集合走 public getter `workspaceRegistry.archivedSessionIds`（§2.2），不要自己去读存储域——那会读到互斥链外的中间态。`storageDomain.get('workspace')` 的 `.d.ts` 明确写着它是 Diagnostic surface，域未打开时返回 `undefined` 而不抛。

顺带修正一条：`pendingMutation` 的两次写崩溃恢复协议只覆盖创建/删除工作区那种「global + table 双写」，`archiveSession` 本身是单次 global 写，原子（§2.5）。

### agent 拆除

agent-loop 把 cancel、drain、关句柄、脱离两个注册表折成**一个** cordis effect，label 里编码了 SessionId：

```
label = `agentLoop.lifecycle(${sessionId})`
```

遍历 `ctx.registry.values()` 的 `runtime.fibers`，在每个 `fiber._disposables` 里按 `Symbol.for('cordis.effect')` 标签上的 label 找到那个 wrapper，然后 **`await wrapper()`**。这不是模拟 teardown，而是调用官方 teardown 本身，失败原样抛出。

三处必须照做，否则静默失效（§6.3、§6.4）：

- **`await wrapper()`，不是 `await wrapper`。** wrapper 自带 `then`，`await wrapper` 会 resolve 出 `disposeAsync` 这个**函数**，一行 disposer 都不跑。这是最危险的一处：写租约没释放，下一步就去删日志了。
- **label 精确全串匹配。** 同一文件里还有 `agentLoop.resume(${id})`，那个 `id` 是配置里的 agent id 而非 SessionId，前缀匹配 `agentLoop.` 会误伤。
- **wrapper 对外不是 memoized。** 第二次调用返回 `undefined`（不是可 join 的 thenable），并发去重要插件自己维护 in-flight map。

`_disposables` 是 `DisposableList`，**没有 `.values()`**，用 `for...of` 或展开。另外，扫描器不能假设「`_disposables` 的顶层项都是顶层 effect」——嵌套 effect 只在被 yield/return 出去时才会被摘除（§6.5）。

**找不到 label 必须大声失败，绝不继续删除。** 静默 no-op 是这套机制最阴险的失效模式。

拆完之后用一道完全公开的判据复验：`sessionPersistence.open(id, 'write')` 在写句柄仍被持有时一定抛 `SessionAlreadyOwnedError`。探针成功即证明写路径已释放——**成功后必须立刻 close，否则自己把 id 卡死**。探针不过就中止删除。

### 删除

顺序不可调换：

1. 拆 agent（上述）
2. 探针复验写路径已释放
3. `rm -rf` 会话目录，带 EBUSY / EPERM / EACCES / UNKNOWN / ETXTBSY 重试梯子（Windows）
4. 遍历工作区实体 `detachSession(id)` 清账
5. **最后**把 id 移出归档集合——id 一旦离开归档集合就必须已经从磁盘上消失，否则它会以未分组的活会话身份冒出来

目录路径由 JSONL 后端上 public 的 `resolveCurrentLog(id)` 给出，取 `dirname`。删除能力绑定该后端（`sessionPersistence.name === 'session-persistence-jsonl'`），其他后端一律禁用而非猜测。

**`undefined` 有两种含义**（§5.2）：会话没有日志，**或者**盘上的日志是旧格式版本（`sourceVersion < 3`）。后一种情况文件真实存在却拿不到路径，绝不能当成「无文件可删」而静默把 id 移出归档集合。

**旧格式日志必须可删**（这是对早先「一律拒绝、不猜」的一次有意放宽——归档区的职责就是把会话清干净，留下一批删不掉的旧会话等于这条链路没走完）。后端给不出路径时，插件自行扫描 `<root>/<project>/<sessionId>` 定位目录，但因为这是不可逆操作且目标是推导出来的，`rm` 之前必须有完整的归属证明，四项缺一不可：

1. basename 与编码后的 SessionId **完全相等**，子串碰撞拒绝（`abc` 绝不能命中 `abcdef`）
2. 目录内确实存在规范 generation 文件（`session.vN.jsonl[.zstd]`）
3. 解析后的绝对路径确实落在会话日志根目录之下
4. 跨平台根目录守卫（POSIX `/`、Windows 盘符根、UNC 共享根）全部挡住

任何一项不过就中止，报告具体是哪一项不过，不做部分删除。日志里要留下「路径为推导而非后端给出」的记录，便于事后追溯。

### 全部归档的成员判定

宿主侧复刻内置侧栏的谓词。可见性（§11.4，逐字照抄 `dsh-client-ui-workspace/lib/client.js:338`）：

```
session.origin !== 'subagent' && !archived.has(session.id) && (!session.blank || session.id === current)
```

第三项不是简单的 `!blank`——**当前选中的空会话是可见的**（那是「新建会话」的临时行）。写成 `!blank` 会在用户正停在新建会话上时与内置侧栏不一致。

`blank` 有便宜的来源：`sessionListMetadata` 投影上就带 `blank` 字段（§9.3），不必读日志判空。

归属：一个会话属于某工作区当且仅当它在该工作区的 `sessionIds` 里。未分组 = 不在任何工作区账本里的会话。

**注意顺序**：内置实现里 `accounted.add(id)` 发生在可见性检查**之前**，所以一个已归档但仍挂在工作区账本里的会话算「已记账」，不会落进未分组。顺序反了会误算。

blank 会话（还没发过话、连日志都没有）**无条件跳过**——官方 `archiveSession` 对无日志会话会抛 `WorkspaceUnknownSessionError`。

批量归档逐个顺序 await `archiveSession`（它幂等，且与工作区归属无关），不并发，避免推送风暴。

### 元数据

只用零 I/O 的廉价来源，面板必须瞬开：

- 磁盘占用：`sessionPersistence.list()` 快照上的 `sizeBytes`
- 最后活动时间：`cachedSnapshot(header, SessionLogOffset(0))` 的 `.values.sessionListMetadata.lastPromptAt`
- 创建时间与 cwd：`SessionHeader`

调用形状照抄 `dsh-api-session-controller` 的 `projectionsFor`（§9.3）：软依赖走 `ctx.get('sessionProjectionCache')?.`，`header.isSeeded` 为真时直接跳过缓存，整段包 try/catch 只 warn 不抛。第二个参数名是 `inheritedEventCount`（fork 继承前缀长度），非 fork 传 `SessionLogOffset(0)`；投影数据在 `.values` 下，不在顶层（§9.2）。

**标题的来源待定。** 核实发现 `title` 并不是 `SessionProjectionMap` 的键（§9.4，全量 grep 了 7 处声明合并），所以 `snapshot.values.title` 拿不到东西。实现前先在真机上探一次 `cachedPredecessorTitle` 的实际返回，再在它与 `ctx.sessionTitle` 服务之间选一个；两条都不通就直接降级为会话 id。

**不做**贵的回退（`sessionQuery.readTitleSnapshots` 会逐个读完整日志）。仍然 miss 就显示会话 id 与创建时间，排序退回 `createdAt`。

已知盲区：投影缓存由 Web 端的 session-controller 注册；fork 出来的会话（`isSeeded`）第一方自己都放弃缓存路径。

### 降级

启动时探测每一项内部形状，**缺什么就禁用对应能力并在界面上说明原因，绝不用「方法存不存在」冒充行为兼容**。探测项：`workspaceRegistry.enqueueOperation`、`workspaceRegistry.state`、`storageDomain.get('workspace')`、`sessionProjectionCache`、会话日志根目录、cordis fiber 枚举面。

侧栏注入单独有一道 kill-switch：识别失败累计到阈值就整体停用全部注入，绝不把半残行为强加给官方侧栏。

## 用户界面

### 归档区面板

侧栏底部按钮（`sidebar.footer.action`）打开。能力：

- 按原工作区分组展示（工作区已移除的归入一组）
- 标题搜索过滤
- 每条显示磁盘占用、创建时间、最后活动时间；总计磁盘占用
- 按时间排序
- 取消归档：单个与批量
- 删除：单个、多选批量、一键全部；二次确认
- 关闭后台运行中的会话：先列出具体名单，二次确认后执行

### 会话标题栏按钮

`conversation.session.header.utilities` 是官方公开扩展点（`kind: 'list'`，`scope: 'session'`），组件从标准 props 拿到自己的 `sessionId`，**不需要 DOM 改写**——与侧栏行内按钮那条路完全不同。

按钮关闭这一个会话的 agent（子代理随父会话一同释放），二次确认。只在该会话确有 agent 时出现；判据来自宿主的 `running()`，不是会话列表的 `running` 位——后者是「有一轮对话在进行中」，空闲的 agent 照样占资源，那正是需要关的情形。

空白会话没有标题栏（DSH 渲染成 new-session hero），因此也没有这个按钮；空白会话本来也没有值得关的 agent。

### 两个关闭入口的分工

归档区那个按钮**排除浏览器当前打开的会话**：它的用途是释放后台占用，前台正在用的那个不属于后台，也是用户最不会预期被别的面板关掉的那个。当前会话走标题栏按钮。两个入口互补，不重叠。

底层只有一个通用原语 `shutdown(ids)`；「关闭全部」不是端点，而是调用方先 `running()` 列名单再 `shutdown` 的策略。这样二次确认能报出**具体哪几个**，而不是一个没人核对过的数字。

### 侧栏行内按钮

工作区行与未分组行**统一**注入一个「一键归档」行内按钮，位置在 `.rowActions` 里那个「＋」按钮之前。机制单一，不依赖 portal 菜单识别。

未分组行本来就没有菜单可用，而它那个「＋新建会话」按钮对未分组是死的（`onCreate` 里 `group.workspaceId === undefined` 直接 no-op，有测试固化），这个位置放归档按钮不与任何现有行为冲突。

识别用 fiber 上的 `props.group`：`workspaceId === undefined` 即未分组。数量直接读 `group.sessionCount`（现成、准确、随归档立即更新）。

不使用 CSS 类名硬匹配——构建期 lightningcss 以 `[hash]_[local]` 打散，hash 随版本变。

## 已知限制

写入 README：

- **取消归档依赖两个官方内部形状**（`enqueueOperation` 与 `state`），DSH 升级可能失效。届时该能力被探测禁用而非静默出错。
- **agent 拆除依赖 cordis effect label 的精确字符串**。label 变动时插件拒绝删除。
- **目标集依赖 `ctx.agents.roots()`**。它给出根 agent，子代理天然不在其中——子代理的 agent 属于父会话，单独拆只会和宿主的级联抢同一个 scope。`roots()` 不可用时关闭能力被探测禁用，而不是退化成拆全部。
- **未捕获的拒绝仍会带走进程**。DSH 的 `installFailLoud` 把任何未捕获拒绝写成 `dsh: fatal load failure:` 后 `exit(1)`。插件在关闭期间加了一道观测，先打日志点名当时正在拆哪个会话，**但不阻止退出**——吞掉宿主的 fail-loud 语义是更坏的事。
- **删除窗口期内会话可能被 UI 复活**：在 Web UI 里打开一个会话就会把它 resume 并重建目录。删除后会话已从所有列表消失，用户主动去开它的概率极低，此风险接受。
- **投影缓存 miss 时元数据降级**为会话 id 与创建时间。
- 安装后需检查 `~/.dsh/profiles/web/node_modules/@deepseek-ai/` 是否被 pnpm 复制成物理目录——那会导致核心包 Symbol 分裂。

## 版本

针对 `@deepseek-ai/dsh` `0.1.5-rc.1` 开发，内部包以 peerDependencies 声明。
