# DSH 宿主内部形状核实报告（session-archive 插件）

> 核实对象：`spec.md` 与 `issues/01..12` 中对 DSH 非公开内部形状的断言
> 核实基准：公共 npm registry 上的 `@deepseek-ai/dsh@0.1.5-rc.1` 及其全部子包
> 核实方式：读取 tarball 内的 `lib/types/**/*.d.ts` 与编译产物 `lib/*.js`；对 cordis 另有 `src/*.ts` 原文；对最关键的 effect 语义额外写了两个 Node 探针脚本实测
> 侦察工作区：`$env:TEMP\dsh-recon`（插件完工后已删除，重建方式见文末附录）

本文中所有标识符、签名、代码片段、文件路径均保持原文，不作翻译。
文件路径的写法约定为 `<包名>/<包内相对路径>:<行号>`，对应磁盘位置为 `$env:TEMP\dsh-recon\node_modules\@deepseek-ai\<包名>\<包内相对路径>`。

---

## 0. spec 断言 → 核实结果总表

### 0.1 **有出入**（实现前必须处理）

| # | spec / issue 断言 | 核实结果 | 详见 |
|---|---|---|---|
| A | 找到 `agentLoop.lifecycle(...)` 的 wrapper 后「await 它」即可拆卸 agent | **有出入（危险）**。`await wrapper` 只会拿到 `disposeAsync` 函数本身，**完全不触发拆卸**。必须 `await wrapper()` | §6.4 |
| B | effect wrapper 是 memoized 的，重复调用可 join 同一个 Promise | **有出入**。第二次直接调用返回 `undefined`（不是 thenable）。memoization 只在内部 `effectInertia` 里，外部调用者拿不到 | §6.4 |
| C | 嵌套 effect 会从 `fiber._disposables` 中移除，所以扫描到的都是顶层 effect | **有出入**。只有被外层 effect **return / yield 出去**的 wrapper 才会被 `collect` 摘除。在 effect body 里调用 `ctx.effect()` 却不 yield，它仍留在 `_disposables` 里，与外层平级 | §6.5 |
| D | 必须显式 `inject`，不能用 `ctx.get` | **有出入（正好说反）**。`ctx.slots` 直接属性访问在未 inject 时抛 `cannot get property "slots" without inject`；`ctx.get('slots')` **无需 inject 即可工作**。DSH 自己的 `dsh-api-session-controller` 正是用 `this.ctx.get("sessionProjectionCache")` 做可选依赖 | §12.3 |
| E | `slots.inject` 把 effect 注册在服务自己的 context 上，插件卸载不会清理，`inject` 返回的 disposer 是唯一清理通道 | **有出入**。`SlotRegistry.register` / `inject` 都是**原型方法**，cordis 服务代理在调用时把 `this.ctx` 绑定到**调用方**的 context，effect 落在调用方 fiber 上，插件卸载会级联清理。源码注释明确写了这一点并说明「An arrow property would freeze `this` ... and silently break per-plugin disposal」 | §10.3 |
| F | ModuleLoader 的 `id` 可以用短名（如 `'session-archive'`） | **有出入**。`id` 必须等于 boot graph 行的 id，也就是**完整包名**（或 `<包名>/client`，后缀会被 `stripClientSuffix` 剥掉）。不匹配时运行时抛 `client-modules: bundle ... loaded without registering "<id>" via __ModuleLoader__.load` | §10.1 |
| G | esbuild 可以直接 `external: ['@deepseek-ai/dsh-*']` 通配 | **有出入（危险）**。浏览器端 `require()` 只认 9 个静态种子模块 + graph 里声明过的行。其余 specifier 必须同时在 `dsh.client.external` 里声明且对方有 graph 行，否则运行时抛错 | §10.2 |
| H | `dsh.client.inject` 列的是服务名 | **有出入**。列的是**包名**。`dsh.client` 还支持 `external`（string[]）与 `immediately`（boolean） | §1.3 |
| I | overlay 里的插件路径必须为绝对路径 | **有出入**。`anchorInsertedPluginNames` 支持 `isAbsolute(...)`、`./`、`../` 三种；相对路径以 **overlay 文件所在目录**为基准。裸相对路径（无 `./` 前缀）才会被当成包名 | §12.4 |
| J | 侧栏可见性判据是 `origin !== 'subagent' && !archived.has(id) && !blank` | **有出入（偏保守）**。真实判据第三项是 `(!session.blank \|\| session.id === current)`——当前选中的 blank session 是**可见**的 | §11.4 |
| K | `cachedSnapshot(header, offset)` 的第二个参数是 offset，结果里直接读字段 | **有出入（措辞）**。第二参名为 `inheritedEventCount`（fork 继承前缀长度），且投影数据在 `.values` 下，不在顶层。还有第三个可选参数 `keys` | §9.2 |
| L | `WorkspaceRegistry` 的归档集合需要私有访问 | **有出入（好消息）**。`get archivedSessionIds(): readonly SessionId[]` 是 **public getter**，读路径完全不需要碰私有成员 | §2.2 |
| M | 前缀匹配 `agentLoop.` 即可定位生命周期 effect | **有出入（危险）**。同文件里还有 `agentLoop.resume(${id})`，其中 `id` 是**配置里的 agent id**，不是 sessionId。必须精确匹配 `agentLoop.lifecycle(${sessionId})` 全串 | §6.3 |

### 0.2 **属实**

| # | spec 断言 | 详见 |
|---|---|---|
| 1 | effect label 字面量为 `` `agentLoop.lifecycle(${id})` ``，且此处 `id` 恒为 SessionId | §6.1–6.3 |
| 2 | label 挂在 `wrapper[Symbol.for('cordis.effect')].label` | §6.4 |
| 3 | `ctx.registry.values()` → `runtime.fibers` → `fiber._disposables` 链路可枚举，`_disposables` 里就是裸 wrapper 函数 | §6.4 |
| 4 | `archiveSession` 幂等、对无日志 session 抛 `WorkspaceUnknownSessionError` | §2.1 |
| 5 | `enqueueOperation` 是 TS-`private` 原型方法，`state` 是 TS-`private` 实例字段 | §2.3 |
| 6 | 存在 `pendingMutation` 两次写入的崩溃恢复协议 | §2.5 |
| 7 | workspace domain global 同时含 `workspaceIds` 与 `archivedSessionIds` | §3.2 |
| 8 | `SessionPersistenceSnapshot` 有 `sizeBytes`/`revision`/`eventCount`，JSONL 后端从不填 `eventCount` | §4.3 |
| 9 | `SessionHeader` 有 `createdAt`/`cwd`/`origin`/`isSeeded`，**没有** `updatedAt`；`origin` 唯一取值 `'subagent'` | §4.4 |
| 10 | `SessionAlreadyOwnedError` 存在且由 `open(id, 'write')` 抛出 | §4.2 |
| 11 | JSONL 后端 `override readonly name = "session-persistence-jsonl"` | §5.1 |
| 12 | `resolveCurrentLog(id)` 是 public 且带 JSDoc；`findLog` 是 private，返回 `{ sourcePath, sourceVersion, currentPath }` | §5.2 |
| 13 | `SessionFormatUnsupportedError` 携带 `location.path` | §5.3 |
| 14 | `format.ts` 的 `sessionDir`/`projectDir`/`projectKey`/`encodeSegment` **不可从 tarball 触达** | §5.5 |
| 15 | 落盘代次文件名形如 `session.vN.jsonl[.zstd]` | §5.4 |
| 16 | `AgentRegistry` 没有 `stop` / `dispose(id)` | §7.1 |
| 17 | Web 侧 `agents.resume()` 的 `AgentHandle.dispose` 被丢弃 | §7.2 |
| 18 | `drainContinuableChildren(parent, childIds)` 签名 | §7.4 |
| 19 | `session/disposed` / `agent/disposed` 是 `@mode emit`，**不等待**监听器返回值 | §7.5 |
| 20 | channel 名正则与保留的 `/api` 检查 | §8.2 |
| 21 | 本版本 `handle()` **没有** `authority` 选项 | §8.1 |
| 22 | 传输为 POST + JSON | §8.3 |
| 23 | `SessionLogOffset` 是 branded type，用 `SessionLogOffset(0)` 构造 | §9.2 |
| 24 | `sessionListMetadata.lastPromptAt` 存在，`cachedPredecessorTitle` 是 fork 回退 | §9.3 |
| 25 | 投影缓存由 Web profile 装载，host 半侧可用 | §9.1 |
| 26 | `sidebar.footer.action` 存在 | §10.4 |
| 27 | lightningcss 的 CSS-module mangle 形如 `[hash]_[local]` | §11.1 |
| 28 | `group` 上有 `workspaceId`/`sessionCount`/`label`/`key` | §11.2 |
| 29 | ungrouped 组的 `label` 字面量就是 `''` | §11.2 |
| 30 | "+" 按钮的 `onCreate` 在 `group.workspaceId === undefined` 时空转 | §11.3 |
| 31 | ungrouped 组无成员时不渲染 | §11.3 |
| 32 | `accounted.add(id)` 在可见性判断**之前** | §11.4 |
| 33 | `packages/client/tsdown.client.ts` 未发布 | §10.1 |
| 34 | dsh 包只发布 `lib/`，不发布 `src/` | §1.2 |

### 0.3 **UNVERIFIED**

| # | 事项 | 尝试过什么 |
|---|---|---|
| U1 | `title` 是否是 `SessionProjectionMap` 的一个 key | 全量 grep 了 `interface SessionProjectionMap` 的所有声明合并（7 处），**没有 `title`**。`dsh-session-title` 只声明了 `SessionEventMap['session/title']`。列表标题实际走 `header` + 客户端 store 的 `displayTitle`。详见 §9.4 |
| U2 | React fiber 上 `props.group` 的运行时可达路径（`__reactFiber$*` key、`memoizedProps` 层级） | 只能静态读到 `ProjectRowItem({ group, ... })` 的参数解构与 `deriveGroups` 构造出的对象形状（§11.2 已给全）。fiber key 的具体后缀是 React 运行期随机串，静态产物中不可知，必须运行期探测 |
| U3 | `.rowActions` 内注入点的稳定性（React 会不会 reconcile 掉外部 DOM） | 属于运行期行为，静态产物无法判定 |
| U4 | `npm view` 能列出的 `@deepseek-ai/dsh-*` 完整已发布包名清单 | 本机 npm registry 访问在 `npm view --json` 上返回过截断结果；改用「装完 `@deepseek-ai/dsh@0.1.5-rc.1` 后枚举 `node_modules/@deepseek-ai`」得到 241 个包（§1.1）。这是**依赖闭包**，不等于 registry 上 scope 下的全部包 |
| U5 | 客户端 bundle 的 `rev` 字段如何计算 | `WebBootEntry` 里有 `rev`，但生成逻辑在未发布的 `tsdown.client.ts` 里 |

---

## 1. 包拓扑与 `dsh` 字段

### 1.1 已安装闭包

在 `$env:TEMP\dsh-recon` 下用 `npm install @deepseek-ai/dsh@0.1.5-rc.1 --ignore-scripts` 拉到 **518 个包**，其中 `@deepseek-ai` scope 下 **241 个**：

- `dsh-*` 前缀 **232 个**
- 非 `dsh-` 前缀 9 个：`cordis`、`cordis-plugin-group`、`cordis-plugin-hmr`、`cordis-plugin-include`、`cordis-plugin-loader`、`cordis-plugin-timer`、`cosmokit`、`node-addon-system`、`schemastery`

本报告涉及的服务所在包：

| 能力 | 包 | ctx 服务键 |
|---|---|---|
| WorkspaceRegistry | `@deepseek-ai/dsh-workspace` | `workspaceRegistry` |
| 存储域 | `@deepseek-ai/dsh-storage-domain` | `storageDomain` |
| 会话持久化抽象 | `@deepseek-ai/dsh-session-persistence` | `sessionPersistence` |
| JSONL 后端 | `@deepseek-ai/dsh-session-persistence-jsonl` | （同上，作为实现挂载） |
| Session store | `@deepseek-ai/dsh-session` | `sessions` |
| Agent 注册表 | `@deepseek-ai/dsh-agent` | `agents` |
| Agent 主循环 | `@deepseek-ai/dsh-agent-loop` | （无独立服务，注册 factory） |
| 子代理 | `@deepseek-ai/dsh-subagent` | `subagents` |
| 投影缓存 | `@deepseek-ai/dsh-session-projection-cache` | `sessionProjectionCache` |
| 投影注册表 | `@deepseek-ai/dsh-session-projection` | `sessionProjections` |
| 连接 / RPC | `@deepseek-ai/dsh-client-connection` | `connection` |
| Slot 注册表 | `@deepseek-ai/dsh-client-ui-renderer` | `slots`（client 半侧） |
| Slot 纯内核 | `@deepseek-ai/dsh-client-ui-slots` | （无服务，纯库） |
| 侧栏 | `@deepseek-ai/dsh-client-ui-sidebar` | （声明 slot 契约） |
| 侧栏 workspace 浏览器 | `@deepseek-ai/dsh-client-ui-workspace` | （渲染实现） |
| Web 会话控制器 | `@deepseek-ai/dsh-api-session-controller` | `apiSessionController` |
| 客户端模块系统 | `@deepseek-ai/dsh-client-modules` | `clientModules` |

### 1.2 `files` 与 `exports`：`src/` 是否随包发布

**只有 `@deepseek-ai/cordis` 发布 `src/`**：

```
@deepseek-ai/cordis                     files=lib/index.js,lib/types/**/*.d.ts,lib/types/**/*.d.ts.map,bin.js,src   srcDirPresent=True
@deepseek-ai/dsh-workspace              files=lib/index.js,lib/invariant.js,lib/types/**/*.js,lib/types/**/*.d.ts    srcDirPresent=False
@deepseek-ai/dsh-client-ui-sidebar      files=lib/index.js,lib/client.js,lib/types/**/*.d.ts                         srcDirPresent=False
@deepseek-ai/dsh-agent-loop             files=lib/index.js,lib/invariant.js,lib/types/**/*.d.ts                      srcDirPresent=False
@deepseek-ai/dsh-session-persistence-jsonl  files=lib/index.js,lib/worker.cjs,lib/types/**/*.d.ts                    srcDirPresent=False
```

> **陷阱**：所有 `dsh-*` 包的 `exports` 里都留着一条 `"./src/*": "./src/*"`，但 `files` 里没有 `src`，所以这条导出在安装后**必然 404**。不要依赖它。

`@deepseek-ai/dsh-workspace/package.json` 的 `exports`（典型形状）：

```json
{
 ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
 "./invariant": { "types": "./lib/types/invariant.d.ts", "default": "./lib/invariant.js" },
 "./types": { "types": "./lib/types/types.d.ts", "default": "./lib/types/types.js" },
 "./src/*": "./src/*",
 "./package.json": "./package.json"
}
```

注意 `dsh-workspace` 的 `files` 含 `lib/types/**/*.js`，磁盘上确实有 `lib/types/spec.js`（zod schema）、`lib/types/paths.js`，但 **`exports` 没有为它们开子路径**，所以 `import '@deepseek-ai/dsh-workspace/lib/types/spec.js'` 会被 exports map 拒绝。可用的只有 `.`、`./invariant`、`./types`。

带客户端半侧的包多一条 `./client`，例如 `@deepseek-ai/dsh-client-ui-cordis/package.json`：

```json
"exports": {
  ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
  "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
  "./src/*": "./src/*",
  "./package.json": "./package.json"
},
"files": ["lib/index.js", "lib/client.js", "lib/types/**/*.d.ts"]
```

### 1.3 `dsh` 字段的真实 schema

**`dsh.bundle.patch`** —— 见 `@deepseek-ai/dsh-base/package.json`、`dsh-acp-app`、`dsh-headless`、`dsh-sdk-app`：

```json
"files": [ "...", "cordis.patch.yml", "lib/types/**/*.d.ts" ],
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

**`dsh.client`** —— 见 `@deepseek-ai/dsh-client-ui-cordis/package.json`：

```json
"dsh": {
  "client": {
    "inject": [
      "@deepseek-ai/dsh-client-connection",
      "@deepseek-ai/dsh-cordis-client-runner",
      "@deepseek-ai/dsh-api-remotes",
      "@deepseek-ai/dsh-client-locale",
      "@deepseek-ai/dsh-client-ui-input-trigger",
      "@deepseek-ai/dsh-client-ui-renderer",
      "@deepseek-ai/dsh-client-ui-session",
      "@deepseek-ai/dsh-client-ui-sidebar"
    ],
    "platform": "web"
  }
}
```

> **⚠️ 与 spec 有出入（H）**：`inject` 数组里是**包名**，不是服务名。

校验逻辑在 `@deepseek-ai/dsh-client-modules/lib/index.js`，四个字段：

| 字段 | 类型 | 必填 |
|---|---|---|
| `platform` | `string` | ✅ |
| `inject` | `string[]` | ❌ |
| `external` | `string[]` | ❌ |
| `immediately` | `boolean` | ❌ |

同文件里的 `clientExportOf` 负责解析 `exports["./client"]`，所以 `./client` 子路径导出是客户端半侧被识别的前提。

`WebBootEntry`（`@deepseek-ai/dsh-client-modules/lib/types/client/manifest.d.ts`）：

```ts
export interface WebBootEntry {
    /** Entry name == package name. */
    readonly id: string;
    readonly url: string;
    readonly rev: string;
    readonly inject?: readonly string[];
    readonly immediately?: boolean;
    readonly external?: readonly string[];
}
```

---

## 2. WorkspaceRegistry

包：`@deepseek-ai/dsh-workspace`　服务键：`workspaceRegistry`　`inject` 字符串：`'workspaceRegistry'`

`@deepseek-ai/dsh-workspace/lib/types/index.d.ts`：

```ts
declare module '@deepseek-ai/cordis' {
    interface Context {
        workspaceRegistry: WorkspaceRegistry;
    }
}
```

`@deepseek-ai/dsh-workspace/lib/index.js`：

```js
var WorkspaceRegistry = class extends Service {
	static inject = ["storageDomain", "sessionPersistence"];
	table;
	global;
	state;
	...
	operationTail = Promise.resolve();
	constructor(ctx) { super(ctx, "workspaceRegistry"); }
```

### 2.1 `archiveSession(...)` —— **属实**

`@deepseek-ai/dsh-workspace/lib/index.js`：

```js
	archiveSession(sessionId) {
		return this.enqueueOperation(async () => {
			if (this.requireState().archivedSessionIds.includes(sessionId)) return;
			if (!await this.sessionKnown(sessionId)) throw new WorkspaceUnknownSessionError(sessionId);
			const state = this.requireState();
			await this.setState({ ...state, archivedSessionIds: [...state.archivedSessionIds, sessionId] });
		});
	}
```

- **幂等**：已在集合中直接 `return`（不报错、不重复写）。
- **未知 session**：`sessionKnown` 走 `sessionPersistence`，无日志则抛 `WorkspaceUnknownSessionError`。
- **写序**：先 `this.global.set(state)`（落盘），成功后才更新内存 `this.state`：

```js
	async setState(state) { await this.global.set(state); this.state = state; }
```

`WorkspaceUnknownSessionError` 与 `WorkspaceOrderInvalidError` 均从包根导出。

### 2.2 `archivedSessionIds` 是 **public getter** —— **与 spec 有出入（L，好消息）**

`@deepseek-ai/dsh-workspace/lib/types/index.d.ts`：

```ts
    get archivedSessionIds(): readonly SessionId[];
```

读归档集合完全不需要任何私有访问。

### 2.3 `enqueueOperation` / `state` —— **属实**

`.d.ts` 中标注：

```ts
    private state?;
    private enqueueOperation;
    private sessionKnown;
    private recoverPendingMutation;
    private setState;
```

均为 TypeScript `private`（**不是** `#private`），运行期完全可达：

- `state` 是 **class field** → 实例自有属性，`registry.state` 可读。
- `enqueueOperation` 是**原型方法** → `Object.getPrototypeOf(registry).enqueueOperation` 或直接 `registry.enqueueOperation(fn)` 可调。

实现（`lib/index.js`）：

```js
	enqueueOperation(operation) {
		const result = this.operationTail.then(async () => {
			await this.recoverPendingMutation();
			return await operation();
		});
		this.operationTail = result.then(() => {}, () => {});
		return result;
	}
```

签名为 `enqueueOperation<T>(operation: () => Promise<T>): Promise<T>`，串行互斥链尾在 `operationTail`（**公开的实例字段**，`.d.ts` 未标 private，可直接 `await registry.operationTail` 等待队列排空）。

### 2.4 Workspace 实体形状

`@deepseek-ai/dsh-workspace/lib/types/entity.d.ts`：

```ts
declare class WorkspaceEntity implements Workspace {
    readonly id: WorkspaceId;
    get path(): string;
    get title(): string;
    get createdAt(): string;
    get updatedAt(): string;
    get sessionIds(): readonly SessionId[];
    setTitle(title: string): Promise<void>;
    attachSession(sessionId: SessionId): Promise<void>;
    insertSessionBefore(sessionId: SessionId, before: SessionId | undefined): Promise<void>;
    detachSession(sessionId: SessionId): Promise<void>;
    status(): ...;
}
```

`get sessionIds()` 不是裸读记录，而是按 `this.host.sessionPath(id) === this.record.path` 过滤，所以它返回的是「记录里登记过 **且** 当前 cwd 仍匹配」的交集。

### 2.5 `pendingMutation` 崩溃恢复 —— **属实**

`@deepseek-ai/dsh-workspace/lib/types/spec.d.ts` 中 `workspaceDomainState`（zod）：

```
initialized, workspaceIds, archivedSessionIds (ZodDefault), pendingMutation?
```

`pendingMutation` 是以 `operation` 为判别式的联合：`"create"` / `"delete"`，各带 `workspaceId`。

domain 定义（`lib/index.js`）：

```js
const workspaceDomainSpec = defineDomain({
	name: "workspace",
	version: 2,
	global: { schema: workspaceDomainState, initial: { initialized: false, workspaceIds: [], archivedSessionIds: [] } },
	tables: { workspaces: domainTable(workspaceRecord) }
});
```

`[Service.init]` 中：

```js
this.ctx.effect(() => () => domain.close(), "workspace.domainClose");
```

> **重要**：`archiveSession` 走的是**单次** global 写，**不**使用 `pendingMutation`。两次写的崩溃恢复协议只覆盖 `create` / `delete` workspace 这两种「global + table 双写」操作。归档路径本身是原子的。

---

## 3. 存储域（storageDomain）

包：`@deepseek-ai/dsh-storage-domain`　服务键：`storageDomain`　`inject` 字符串：`'storageDomain'`

`@deepseek-ai/dsh-storage-domain/lib/types/index.d.ts`：

```ts
declare module '@deepseek-ai/cordis' {
    interface Context {
        storageDomain: DomainFacility;
    }
}
```

### 3.1 `get('workspace')` 的返回与语义

`@deepseek-ai/dsh-storage-domain/lib/types/domain.d.ts`：

```ts
    /** Diagnostic surface: the open domain, or undefined when it is not open. */
    get(name: string): DomainImpl | undefined;
```

> **注意措辞**：`.d.ts` 明确把它称为 **Diagnostic surface**。域未打开时返回 `undefined`（不抛异常）。

```ts
export interface DomainGlobal<G> {
    get(): G;
    set(value: G): Promise<void>;
}

declare class DomainImpl {
    get global(): DomainGlobal<unknown>;
    ...
}
```

- `global.get()` 是**同步**的（返回内存态快照）。
- `global.set(value)` 返回 `Promise<void>`（先落盘）。
- 泛型被擦成 `unknown`，读到的对象需要自行 narrow。

`KvTable` 提供 `get` / `entries` / `keys` / `size` / `put` / `delete` / `update`。

### 3.2 global 状态形状 —— **属实**

`workspace` 域的 global 确实同时包含 `workspaceIds` 与 `archivedSessionIds`（见 §2.5 的 `initial`）。

> **建议**：既然 `WorkspaceRegistry.archivedSessionIds` 是 public getter（§2.2），host 半侧的读路径应当走 `ctx.workspaceRegistry.archivedSessionIds`，把 `storageDomain.get('workspace')` 留作诊断／越权兜底，避免绕过 registry 的互斥链读到中间态。

---

## 4. SessionPersistence

包：`@deepseek-ai/dsh-session-persistence`　服务键：`sessionPersistence`　`inject` 字符串：`'sessionPersistence'`

### 4.1 抽象基类方法

`@deepseek-ai/dsh-session-persistence/lib/types/index.d.ts`：

```ts
    abstract create(...): ...;
    abstract open(id: SessionId, access: ..., options?: ...): ...;
    abstract flush(): ...;
    abstract stat(id: SessionId, options?: ...): ...;
    abstract list(options?: ...): ...;
```

```ts
declare module '@deepseek-ai/cordis' {
    interface Context {
        sessionPersistence: SessionPersistence;
    }
}
```

### 4.2 写锁与 `SessionAlreadyOwnedError` —— **属实**

`@deepseek-ai/dsh-session-persistence/lib/types/errors.d.ts`：

```ts
declare class SessionAlreadyOwnedError extends Error {
    readonly sessionId: SessionId;
}
declare class SessionFormatUnsupportedError extends Error {
    readonly location?: SessionLocation;
}
export interface SessionLocation {
    readonly kind: string;
    readonly path: string;
}
```

导出路径：`@deepseek-ai/dsh-session-persistence`（包根）。
`open(id, 'write')` 在会话已被别处持有写租约时抛 `SessionAlreadyOwnedError`——这正是删除前「确认无人持有」的探针。

### 4.3 `SessionPersistenceSnapshot` —— **属实**

```ts
export interface SessionPersistenceSnapshot {
    readonly header: SessionHeader;
    readonly revision: ...;
    readonly eventCount?: ...;
    readonly sizeBytes?: ...;
}
```

`eventCount` 与 `sizeBytes` 都是 optional。JSONL 后端**从不填 `eventCount`**（spec 断言属实），但**会**填 `sizeBytes` —— 这就是「归档区磁盘占用」唯一可用的量。

### 4.4 `SessionHeader` —— **属实**

`@deepseek-ai/dsh-session/lib/types/types.d.ts`：

```ts
export interface SessionHeader {
    version: ...;
    id: SessionId;
    createdAt: number;
    cwd?: string;
    parentSession?: SessionId;
    isSeeded: boolean;
    origin?: 'subagent';
    delegationDepth?: number;
    agentPreset?: string;
}
```

- **没有 `updatedAt`**（spec 断言属实）。Web 侧的 `updatedAt` 是**算出来**的，见 `@deepseek-ai/dsh-api-session-controller/lib/index.js:1969`：

```js
function updatedAt(header, metadata) {
	return Math.max(header.createdAt, metadata?.lastPromptAt ?? 0);
}
```

- `origin` 的类型就是字面量联合 `'subagent'`，即**唯一非 undefined 取值是 `'subagent'`**（spec 断言属实）。
- 同文件另有 `SESSION_FORMAT_VERSION = 3`。

---

## 5. JSONL 后端

包：`@deepseek-ai/dsh-session-persistence-jsonl`

### 5.1 类名与 `name` 字面量 —— **属实**

`lib/types/index.d.ts`：

```ts
declare class JsonlSessionPersistence extends SessionPersistence {
    /** Backend label for diagnostics and effects; shadows `Service.name` without changing the service key. */
    readonly name = "session-persistence-jsonl";
    ...
    resolveCurrentLog(id: SessionId, signal?: AbortSignal): Promise<string | undefined>;
    private findLog;
}
export default JsonlSessionPersistence;
```

默认导出。`name` 字面量与 spec 一致。JSDoc 明确说它 **shadows `Service.name` without changing the service key** —— 服务键仍是 `sessionPersistence`。

### 5.2 `resolveCurrentLog` —— **属实**

`lib/index.js:2705`：

```js
	async resolveCurrentLog(id, signal) {
		await this.ensureRootEncoding();
		signal?.throwIfAborted();
		const selected = await this.findLog(id, signal);
		if (selected === void 0) return void 0;
		if (selected.sourceVersion === SESSION_FORMAT_VERSION) return selected.sourcePath;
		if (selected.sourceVersion < SESSION_FORMAT_VERSION) return void 0;
		throw new SessionFormatUnsupportedError(`${sessionFormatVersionRefusal(id, selected.sourceVersion)} (raw log: ${selected.sourcePath})`, { kind: "jsonl", path: selected.sourcePath });
	}
```

- **public**、带 JSDoc、返回**绝对路径**（`findLog` 内部用 `join(root, ...)` 拼，`root` 来自 config `!!js dshHomePath('sessions')`）。
- 三态语义要点：
  - `undefined` 有**两种**含义：找不到日志 **或** 找到的是**旧版本**日志（`sourceVersion < 3`）。删除逻辑不能把 `undefined` 一律当成「无文件可删」——旧版本文件仍然在盘上。
  - 更高版本直接抛 `SessionFormatUnsupportedError`。

`findLog` 是 `private`（TS 修饰符，运行期仍可达），`lib/index.js:3194`，扫描各 project 目录，遇到同 id 重复时抛错。`resolveGenerationInDirectory`（`lib/index.js:3188-3190`）返回：

```js
{ sourcePath, sourceVersion, currentPath }
```

—— 与 spec 一致。`currentPath` 是当前代次文件，`sourcePath` 是选中的源文件，两者在同版本时相同。

### 5.3 `SessionFormatUnsupportedError.location` —— **属实**

上面的抛出点第二参就是 `{ kind: "jsonl", path: selected.sourcePath }`，落到 `readonly location?: SessionLocation`。

### 5.4 落盘布局与代次文件名 —— **属实**

`lib/index.js` 路径 helper（行号为编译产物行号）：

| 行 | 函数 | 关键行为 |
|---|---|---|
| 852 | `encodeSegment` | 目录名安全编码 |
| 874 | `projectKey` | `` `--${readable.slice(0, 251)}--` `` |
| 901 | `projectDir` | cwd 为 undefined 时 `join(root, "_no-cwd")` |
| 913 | `sessionDir` | `join(projectDir(root, cwd), encodeSegment(id))` |
| 760 | `generationLogFilename(version, compression)` | 生成 `session.vN.jsonl` / `session.vN.jsonl.zstd` |

即布局为：

```
<root>/<projectKey(cwd) 或 _no-cwd>/<encodeSegment(sessionId)>/session.v<N>.jsonl[.zstd]
```

`<root>` 默认 `dshHomePath('sessions')`（见 `dsh-base/cordis.patch.yml` 的 `session-persistence-jsonl` 行）。

### 5.5 `format.ts` helper 不可触达 —— **属实**

`files` 为 `["lib/index.js", "lib/worker.cjs", "lib/types/**/*.d.ts"]`，`src` 未发布，`exports` 也没有暴露这些函数。**插件必须自己重新实现路径推导，或者只用 `resolveCurrentLog` 返回的绝对路径反推目录**（推荐后者：`dirname(resolveCurrentLog(id))` 就是 sessionDir）。

---

## 6. Agent 拆卸（最关键）

包：`@deepseek-ai/dsh-agent-loop`

### 6.1 label 字面量与所在位置 —— **属实**

`@deepseek-ai/dsh-agent-loop/lib/index.js:1690`，位于 `prepare(ownerCtx, id, options, session, callerSignal, handle, parentAgent)` 内：

```js
			unfollowOwner = ownerCtx.effect(function* () {
				machine = new ReactLoopAgent(loopCtx, id, options, session);
				machineReady.resolve();
				yield machine.scope.rawDispose;
				yield () => {
					if (disposing !== void 0) return;
					abort.abort(/* @__PURE__ */ new Error(`agent "${id}" setup aborted: owner disposed during setup`));
					return dispose(true);
				};
			}, `agentLoop.lifecycle(${id})`);
```

### 6.2 disposer 的完整顺序

`@deepseek-ai/dsh-agent-loop/lib/index.js:1646` 起：

```js
		const dispose = (ownerTriggered = false) => disposing ??= (async () => {
			abort.abort(new Error(`agent "${id}" lifecycle disposed`));
			callerSignal?.removeEventListener("abort", onCallerAbort);
			this.ownership.signal.removeEventListener("abort", onFactoryTeardown);
			const failures = [];
			try {
				if (machine === void 0) await machineReady.promise;
				if (machine !== void 0) {
					machine.cancel({ kind: "disposed" });
					await machine.whenIdle();
					await machine.scope.dispose();
				}
			} catch (error) { failures.push(error); }
			try { await handle?.close(); } catch (error) { failures.push(error); }
			try { detachAgent?.(); detachSession?.(); }
			finally { untrack(); if (!ownerTriggered) await unfollowOwner(); }
			if (failures.length === 1) throw failures[0];
			if (failures.length > 1) throw new AggregateError(failures, `agent "${id}" disposal failed`);
		})();
```

按序：
1. `abort.abort(...)` —— 取消所有在途工作
2. 摘除 caller / factory 的 abort 监听
3. `machine.cancel({ kind: "disposed" })` → `await machine.whenIdle()` → `await machine.scope.dispose()`（**这一步是等待循环真正停下来**）
4. `await handle?.close()` —— **关闭会话持久化句柄，释放写租约**
5. `detachAgent?.()` / `detachSession?.()` —— 从 `agents` / `sessions` 注册表摘除，触发 `agent/disposed` / `session/disposed`
6. `untrack()`，并在非 owner 触发时 `await unfollowOwner()`

> **对插件的意义**：步骤 4 是删除日志文件之前必须完成的。只有 `await wrapper()` 完整 resolve，才能保证写租约已释放。

### 6.3 同文件其他 label —— **⚠️ 与 spec 有出入（M）**

| 行 | label | `id` 的含义 |
|---|---|---|
| 1532 | `"agentLoop.transactions()"` | — |
| 1533 | `"agentLoop.setFactory()"` | — |
| 1564 | `` `agentLoop.resume(${id})` `` | **配置里的 agent id**（`Config.agents[].id`），**不是** SessionId |
| 1690 | `` `agentLoop.lifecycle(${id})` `` | **SessionId** |
| 1888 | `` `agentLoop.resume-load(${id})` `` | 同 1564 |

1690 处 `id` 恒为 SessionId 的证据链：
- `createAgent` → `setupAndPublish(ownerCtx, options.sessionId, ...)`
- `resumeWith` → `const id = options.resumeSessionId;`
- 两者都把该 `id` 透传进 `prepare(ownerCtx, id, ...)`

**必须精确全串匹配 `` `agentLoop.lifecycle(${sessionId})` ``，绝不能做 `startsWith('agentLoop.')` 前缀匹配。**

### 6.4 cordis 侧：枚举链路与 wrapper 语义

cordis 版本：`@deepseek-ai/cordis@4.0.2`（DeepSeek fork，随包发布 `src/`，可读 TypeScript 原文）。

`@deepseek-ai/cordis/src/utils.ts`：

```ts
export const symbols = { ..., effect: Symbol.for('cordis.effect'), ... }
```

`@deepseek-ai/cordis/src/fiber.ts:203`：

```ts
  public readonly _disposables = new DisposableList<Disposable>()
```

`DisposableList`（`src/utils.ts`）有 `push` / `delete` / `clear` / `length` / `[Symbol.iterator]`，**没有 `.values()`** —— 用 `for...of` 或 `[...list]`。
`RegistryService`（`src/registry.ts`）**有** `.values()`，迭代 `Plugin.Runtime`，其形状为 `{ name?, fibers: DisposableList<Fiber>, callback, Config? }`。

wrapper 的构造（`src/fiber.ts:505` 附近）：

```ts
    const wrapper = defineProperty(() => {
      if (!runner.epoch) return setupFailed ? inFlight : undefined
      runner.epoch = false
      return finalizeDisposal(() => {
        if (executing) return disposeAfter(waitForSetup())
        return task ? disposeAfter(task) : dispose()
      })
    }, symbols.effect, meta) as AsyncDisposable
    effectInertia.set(wrapper, () => inFlight)
    removeWrapper = this._disposables.push(wrapper)
```

```ts
    wrapper.then = async (onFulfilled, onRejected) => {
      return Promise.resolve(task)
        .then(() => disposeAsync)
        .then(onFulfilled, onRejected)
    }
```

```ts
interface AsyncDisposable<T extends Awaitable<void> = Awaitable<void>> extends PromiseLike<() => T> { (): T }
```

`EffectMeta` 为 `{ label: string; children: EffectMeta[] }`，挂在 `wrapper[Symbol.for('cordis.effect')]`。
另有只读枚举 API（`src/fiber.ts:569`）：

```ts
  getEffects() { return [...this._disposables].map<EffectMeta>(dispose => dispose[symbols.effect]).filter(Boolean) }
```

**实测**（脚本 `$env:TEMP\dsh-recon\probe-effect.mjs`）：

```
found wrapper: function
getEffects(): [{"label":"agentLoop.lifecycle(sess-123)","children":[]}]
await wrapper -> function disposeAsync
log after `await wrapper`: []
wrapper() returned thenable? true
log after `await wrapper()`: ["inner-second-yield:start","inner-second-yield:end","inner-first-yield"]
second wrapper() returned: undefined
```

结论：

- ✅ `ctx.registry.values()` → `runtime.fibers` → `fiber._disposables` 能拿到**裸 wrapper 函数**，`d[Symbol.for('cordis.effect')].label` 就是 label。
- ❌ **`await wrapper` 不拆卸**（断言 A）。它 resolve 出 `disposeAsync` **函数**，日志为空 —— 这是 spec 里最危险的一条。正确写法是 `await wrapper()`。
- ✅ `wrapper()` 返回 thenable，`await` 它会**逆序**执行 disposer 并等待异步 disposer 完成（`inner-second-yield` 先于 `inner-first-yield`，且 `:end` 在 `:start` 之后被等到）。
- ❌ **不是对外 memoized**（断言 B）。第二次调用返回 `undefined`。所以并发场景下不能靠「再调一次拿到同一个 Promise」来 join，必须自己在插件里维护 in-flight map。

### 6.5 嵌套 effect 的可见性 —— **⚠️ 与 spec 有出入（C）**

`src/fiber.ts:448`：

```ts
      collect: (dispose) => {
        disposables.push(dispose)
        this._disposables.delete(dispose)
        if (dispose[symbols.effect]) {
          meta.children.push(dispose[symbols.effect])
        }
      },
```

关键在于 `collect` 的**调用时机**（`src/fiber.ts:355` 的 `_execute`）：它只作用于 effect setup **返回值 / yield 出来的值**。

实测（脚本 `probe-inject.mjs`）：

```
top-level _disposables labels: ["outer.parent","inner.child"]
getEffects(): [{"label":"outer.parent","children":[]},{"label":"inner.child","children":[]}]
```

即：在 effect body 内调用 `ctx.effect()` 但**不 yield 它**，内层 wrapper 仍留在 `fiber._disposables` 里，与外层平级。只有 `yield ctx.effect(...)` / `return ctx.effect(...)` 才会被摘除并进入 `meta.children`。

对本插件的影响：`agentLoop.lifecycle(...)` 是在普通 async 方法 `prepare()` 里直接调 `ownerCtx.effect(...)`，不在任何 effect body 内，所以它**确定**是 `_disposables` 的顶层项。但扫描器不能假设「顶层项都是顶层 effect」。

### 6.6 wrapper 落在哪个 fiber

`@deepseek-ai/dsh-agent/lib/index.js:430`：

```js
	async resume(options) {
		const ownerCtx = this.ctx;
		const { target } = this.requireFactory();
		const receiver = getTraceable(ownerCtx, target);
		return Reflect.apply(target.resume, receiver, [ownerCtx, options]);
	}
```

`Service` 方法里的 `this.ctx` 被 cordis 服务代理绑定成**调用方**的 context。因此 `ownerCtx` 是**调用 `ctx.agents.resume(...)` 的那个插件的 fiber** —— Web 场景下是 `@deepseek-ai/dsh-api-session-controller`，**不是** `dsh-agent-loop`。

> **实现建议**：不要猜 fiber。遍历 `ctx.registry.values()` 的**所有** runtime 的**所有** fiber 的 `_disposables`，按精确 label 匹配。

---

## 7. AgentRegistry / SessionStore / subagents

### 7.1 `AgentRegistry` 无 `stop` / `dispose(id)` —— **属实**

`@deepseek-ai/dsh-agent/lib/types/index.d.ts` 的完整公开面：

```
currentInitiator, requireInitiator, withInitiator, withoutInitiator,
setFactory, create, resume, register, enter, announce,
get(id), isOwnedBy, list(), roots()
```

没有任何按 id 停止 agent 的方法。

```ts
declare module '@deepseek-ai/cordis' {
    interface Context {
        agents: AgentRegistry;
    }
}
```

`AgentHandle` 的 JSDoc 把 `dispose` 描述为 "a CAPABILITY"：

```ts
export interface AgentHandle {
    readonly agent: Agent;
    dispose(): Promise<void>;
}
```

—— 只有拿到 handle 的调用者才有权拆卸。

### 7.2 Web 侧丢弃了 handle —— **属实**

`@deepseek-ai/dsh-api-session-controller/lib/index.js:402`：

```js
		return (await this.ctx.agents.resume({
			resumeSessionId: sessionId,
			agentOptions: this.agentOptions(),
			setup: composition.setup
		})).agent;
```

`.agent` 被取走，`dispose` 被丢弃。**这就是必须走 effect label 扫描这条「后门」的根本原因。**

### 7.3 `ctx.agents.get` / `list` / `ctx.sessions.get`

`@deepseek-ai/dsh-session/lib/types/index.d.ts`：

```ts
declare module '@deepseek-ai/cordis' {
    interface Context {
        sessions: SessionStore;
    }
}
```

服务键是 **`sessions`**，类型名是 `SessionStore`（不是 `SessionRegistry`）。`inject` 字符串：`'sessions'`。

```ts
    get(id: SessionId): Session | undefined;   // index.d.ts:419
    list(): Session[];                          // index.d.ts:424
```

### 7.4 `drainContinuableChildren` —— **属实**

`@deepseek-ai/dsh-subagent/lib/types/index.d.ts:183`：

```ts
    drainContinuableChildren(parent: Agent, childIds: readonly SessionId[]): Promise<void>;
```

服务键 `subagents`。第一参是 **Agent 实例**（不是 id），需要先 `ctx.agents.get(parentSessionId)`。

### 7.5 `session/disposed` / `agent/disposed` 的 dispatch 语义 —— **属实（不等待）**

`@deepseek-ai/dsh-session/lib/types/index.d.ts:41-50`：

```ts
        /**
         * Emitted once when an announced session leaves the store, including
         * publication rollback, but never for an entry whose creation announcement
         * did not begin. Listener failures are logged and contained.
         * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`) reuses the owner scope.
         * @param session - the session that is no longer live in the store.
         * @dshScopeScan unsupported
         * @mode emit
         */
        'session/disposed'(this: Scoped<Session>, session: Session): void;
```

`agent/disposed` 声明在 `@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:235`，语义一致。

关键点：
- `@mode emit` —— **不 await 监听器返回值**，返回 `Promise` 也不会被等。
- 返回类型是 `void`，不是 `Awaitable<void>`。
- "Listener failures are logged and contained" —— 监听器抛错不会打断宿主。

> **对插件的意义**：绝不能在 `session/disposed` 监听器里 `await` 删除日志然后指望宿主等你。归档／删除的编排必须由插件自己的 RPC handler 串起来，事件只能当**通知**用。
> 对照：同文件里有 `@mode parallel` 的「Awaited parallel durability checkpoint」事件（`session/checkpoint` 一类），那种才会被等待。

---

## 8. RPC 通道

包：`@deepseek-ai/dsh-client-connection`　服务键：`connection`　`inject` 字符串：`'connection'`

### 8.1 handler 签名 —— **属实，且确认无 `authority`**

`lib/types/rpc.d.ts`：

```ts
export type ConnectionRpcHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<ConnectionRpcResult<unknown>>;

export interface HostConnectionRpc {
    handle(channel: string, handler: ConnectionRpcHandler): () => Promise<void>;
    intercept(channel: '/api', matches: ConnectionRpcEndpointMatcher, handler: ConnectionRpcHandler): () => Promise<void>;
}

export interface ClientConnectionRpc {
    call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<ConnectionRpcResult<unknown>>;
    readonly open?: (channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) => AsyncIterable<unknown>;
}

export type ConnectionRpcResult<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: ConnectionRpcFailure };

export interface ConnectionRpcFailure {
    readonly code: string;
    readonly message: string;
    readonly details: object;
}
```

- `handle(channel, handler)` **只有两个参数**，本版本**没有** `authority` 选项（spec 断言属实）。
- `AbortSignal` 是**第三个位置参数**，不是 options 对象里的字段。
- handler 必须返回 `ConnectionRpcResult`（判别式 `ok`），**不是**裸值。抛异常会变成 HTTP 500。
- `handle` 返回的 disposer 是 `() => Promise<void>`（异步）。
- `open` 是 optional 的流式通道，`AsyncIterable<unknown>`。

### 8.2 通道名校验正则与 `/api` 保留 —— **属实**

`lib/index.js`：

```js
const CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/;
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
function assertChannel(channel) {
	if (!CHANNEL_PATTERN.test(channel) || channel === "/api") throw new Error(`connection: invalid or reserved RPC channel ${JSON.stringify(channel)}`);
}
```

注意 `CHANNEL_PATTERN` **不允许**第二层 `/`，所以 `/session-archive/v1` 非法，`/session-archive` 合法。

### 8.3 传输与失败语义 —— **属实**

`lib/index.js` 注册路由：

```js
	return owner.effect(() => owner.webServer.register(route), `client-connection: ${channel} rpc channel`);
```

—— 注册本身就走 `owner.effect`，插件卸载自动摘路由。

`rpcFetchHandler` 的硬性要求：
- 方法必须是 `POST`
- `content-type` 必须是 `application/json`
- body 必须是合法的 `client-request` 信封
- `message.method` 必须**等于** URL 里的 endpoint
- 进入 handler 前有 Host/Origin 信任围栏（403）与浏览器鉴权（401）
- handler 抛错 → HTTP 500，body 为 `handler failure: ...`

浏览器侧 `call()` 在传输层失败（网络错误、非 2xx）时**抛异常**，只有到达 handler 并正常返回时才会拿到 `ConnectionRpcResult`。所以客户端必须同时处理 `throw` 与 `{ ok: false }` 两条失败路径。

---

## 9. 会话投影缓存

包：`@deepseek-ai/dsh-session-projection-cache`　服务键：`sessionProjectionCache`　`inject` 字符串：`'sessionProjectionCache'`

### 9.1 谁装载它 —— **属实**

`@deepseek-ai/dsh-base/cordis.patch.yml`（**base 层，不是 web 层**）：

```yaml
    - id: session-projection-cache
      name: '@deepseek-ai/dsh-session-projection-cache'
      config:
        writeEveryEvents: 200
        writeIntervalMs: 5000
```

因此**所有** base-backed profile（含 web、headless、acp）都有它，host 半侧插件可用。它依赖 `storage-domain`（域名 `session_projcache`）。

```ts
declare module '@deepseek-ai/cordis' {
    interface Context {
        sessionProjectionCache: SessionProjectionCache;
    }
}
```

### 9.2 `cachedSnapshot` 签名 —— **⚠️ 与 spec 措辞有出入（K）**

`lib/types/index.d.ts`：

```ts
cachedSnapshot(meta: SessionHeader, inheritedEventCount: SessionLogOffset, keys?: readonly Extract<keyof SessionProjectionMap, string>[]): ProjectionSnapshot | undefined;
cachedPredecessorTitle(meta: SessionHeader, inheritedEventCount: SessionLogOffset): ProjectionSnapshot | undefined;
```

- 第二参名为 **`inheritedEventCount`**（fork 继承的前缀长度），不是通用 offset。非 fork 场景传 `SessionLogOffset(0)`。
- 第三参 `keys` 可以只取需要的投影键，避免整块反序列化。
- 返回 `ProjectionSnapshot | undefined`。

`SessionLogOffset` 定义在 `@deepseek-ai/dsh-session/lib/types/types.d.ts`，是 branded type + 同名 brand 函数，构造方式就是 `SessionLogOffset(0)`。

`ProjectionSnapshot`（`@deepseek-ai/dsh-session-projection/lib/types/index.d.ts`）：

```ts
export interface ProjectionSnapshot {
    asOfSeq: SessionSeqCursor;
    values: Partial<SessionProjectionMap>;
}
```

> **投影数据在 `.values` 下，不在顶层。**

### 9.3 官方参考用法（直接照抄这段）

`@deepseek-ai/dsh-api-session-controller/lib/index.js:1948`：

```js
	projectionsFor(header, session) {
		try {
			const cache = this.ctx.get("sessionProjectionCache");
			const block = session === void 0 ? header.isSeeded ? void 0 : cache?.cachedSnapshot(header, SessionLogOffset(0)) ?? cache?.cachedPredecessorTitle(header, SessionLogOffset(0)) : this.ctx.sessionProjections.cachedSnapshot(session);
			return block !== void 0 && Object.keys(block.values).length > 0 ? {
				asOfSeq: block.asOfSeq,
				values: block.values
			} : void 0;
		} catch (error) {
			this.ctx.logger.warn(`api-session.list: projection column for "${header.id}" failed; serving the row without it: ${String(error)}`);
			return;
		}
	}
```

要点：
- **用 `this.ctx.get("sessionProjectionCache")` + `?.`**，把投影缓存当可选依赖（不 inject），这样缓存插件没装载时功能优雅降级。**这是官方的可选依赖范式。**
- `header.isSeeded` 为真时直接跳过缓存。
- 活跃 session（`session !== undefined`）走 `this.ctx.sessionProjections.cachedSnapshot(session)`（另一个服务，服务键 `sessionProjections`），冷 session 才走 `sessionProjectionCache`。
- 整段包在 try/catch 里，失败只 warn 不抛。

`sessionListMetadata`（`@deepseek-ai/dsh-api-session-controller/lib/types/types.d.ts`）：

```ts
declare module '@deepseek-ai/dsh-session-projection' {
    interface SessionProjectionMap {
        /** Persisted facts used to summarize a Session without activating it. */
        sessionListMetadata: SessionListMetadata;
        /** Image-intake limits enforced by the Session prompt endpoint. */
        imageLimits: ImageAttachmentLimits;
        /** Durable model selection already used and selected for the next request. */
        modelSelection: ModelSelectionProjection;
    }
}
export interface SessionListMetadata {
    readonly blank: boolean;
    readonly lastPromptAt: number | null;
}
```

> **额外收获**：`SessionListMetadata` 还带 **`blank`**，这给了 host 侧一个便宜的「空会话」判据 —— 不必去读日志。归档 UI 应当直接用它过滤空会话（空会话没有日志，`archiveSession` 会抛 `WorkspaceUnknownSessionError`）。

### 9.4 `title` 投影 —— **UNVERIFIED（U1）**

全量 grep `interface SessionProjectionMap` 的所有声明合并，共 7 处：

| 包 | 键 |
|---|---|
| `dsh-agent` | `inbox` |
| `dsh-agent-loop` | （turn/step 边界，见 `dsh-agent/lib/types/types.d.ts:54` 注释） |
| `dsh-api-session-controller` | `sessionListMetadata`, `imageLimits`, `modelSelection` |
| `dsh-agent-presets` | `agentPreset` |
| `dsh-goal` | `goal` |
| `dsh-plan-mode` | `plan` |
| `dsh-permission-presets` | （permission select） |

**没有 `title` 键。** `@deepseek-ai/dsh-session-title` 只声明了：

```ts
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        'session/title': SessionTitleEventData;
    }
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        sessionTitle: SessionTitleService;
    }
}
```

`cachedPredecessorTitle` 这个方法名暗示缓存内部确实存了标题，但它不是 `SessionProjectionMap` 的公开键。**结论：不要指望从 `snapshot.values.title` 读标题**。归档列表的标题应当走 `ctx.sessionTitle`（服务键 `sessionTitle`）或客户端 store 已有的 `displayTitle`。

---

## 10. 客户端半侧 / Slot / ModuleLoader

### 10.1 ModuleLoader 握手（逐字节）—— **⚠️ id 规则与 spec 有出入（F）**

真实产物 `@deepseek-ai/dsh-client-ui-cordis/lib/client.js`：

```js
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-cordis",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react = require("react");
		...
		exports.inject = inject;
		return module.exports;
	}
});
//# sourceMappingURL=client.js.map
```

要点：
- 顶层就是一次 `window.__ModuleLoader__.load({ id, factory })` 调用，没有 IIFE 包装。
- `factory` 接收一个同步 `require(spec)`，返回 `module.exports` 对象。
- 必须 `Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })`。
- **所有 `require` 都是同步的、在 factory 顶部一次性取。**

`id` 的匹配规则（`@deepseek-ai/dsh-client-modules/lib/client.js`）：

```js
function stripClientSuffix(spec) { return spec.endsWith("/client") ? spec.slice(0, -7) : spec; }
register(registration) {
  const id = stripClientSuffix(registration.id);
  if (this.bootstrapIds.has(id) || this.factories.has(id)) throw new Error(`client-modules: duplicate factory registration for "${registration.id}" ...`);
  this.factories.set(id, registration.factory);
}
```

```js
if (!this.factories.has(id)) throw new Error(`client-modules: bundle ${url} loaded without registering "${id}" via __ModuleLoader__.load`)
```

`ClientBundleRegistration`（`lib/types/client/manifest.d.ts`）：

```ts
export interface ClientBundleRegistration {
    /** Plugin id (package name) — the registration key; must match the graph row being executed. */
    readonly id: string;
    readonly factory: (require: (spec: string) => unknown) => Record<string, unknown>;
}
```

> **⚠️ 结论**：`id` 必须是**完整包名**（例如 `@dsh-plugins/session-archive`）或 `<完整包名>/client`。issue 01 里给的 banner 若用短名会在运行时直接抛错。

`packages/client/tsdown.client.ts` 确实**未发布**（spec 断言属实）—— 只能靠上面的字节形状手工在 esbuild banner/footer 里复刻。

### 10.2 `external`：哪些 specifier 免费 —— **⚠️ 与 spec 有出入（G）**

浏览器端静态种子模块表，`@deepseek-ai/dsh-web-frontend/dist/assets/index-DuF6ti6g.js`：

```js
function My(){return{react:t9,"react/jsx-runtime":o9,"react-dom":u9,"react-dom/client":h9,"@deepseek-ai/cordis":H8,"@deepseek-ai/dsh-client-store":H9,"@deepseek-ai/dsh-client-ui-slots":$9,"@deepseek-ai/dsh-client-ui-primitives":Wg,"@deepseek-ai/dsh-client-ui-dockkit":Ey}}
```

**只有这 9 个 specifier 是无条件可 `require` 的**：

```
react
react/jsx-runtime
react-dom
react-dom/client
@deepseek-ai/cordis
@deepseek-ai/dsh-client-store
@deepseek-ai/dsh-client-ui-slots
@deepseek-ai/dsh-client-ui-primitives
@deepseek-ai/dsh-client-ui-dockkit
```

其余任何 `@deepseek-ai/dsh-*` 想 `require`，都必须**同时**满足：
1. 目标包在 boot graph 里有自己的行（即它自己也是一个已装载的 client 插件）
2. 本包在 `dsh.client.external` 里声明它

否则 `require()` 在浏览器里找不到工厂而抛错。

> **⚠️ 结论**：esbuild 配置里的 `external` 必须是**显式白名单**，不能写 `'@deepseek-ai/dsh-*'` 通配。同时 `dsh.client.external` 必须与 esbuild 的 `external` 列表保持一致。

`dsh.client.inject` 与 `external` 的区别：`inject` 决定**加载顺序**（等这些包先执行完），`external` 决定**允许 require 谁**。两者都要填。

### 10.3 `ctx.slots`：`register` / `inject` —— **⚠️ 与 spec/issue 09 有出入（E）**

服务键 `slots`，定义在 `@deepseek-ai/dsh-client-ui-renderer/lib/types/client/registry.d.ts`：

```ts
    /**
     * ... disposal through the caller's ctx.effect (fiber unload = cascade),
     * exclusive-factory minting (`store: createXxxStore` becomes a per-entry
     * handle), the registrant diagnostics stamp, and store-instance lifecycle
     * on the entry axis.
     *
     * Declared here, implemented by prototype assignment below the class: it
     * MUST stay a prototype method (never an instance arrow) — the cordis
     * service proxy binds `this.ctx` to the CALLER's context at call time,
     * which is what routes the effect (and the unload cascade) into the
     * caller's fiber. An arrow property would freeze `this` to the service's
     * own root ctx and silently break per-plugin disposal.
     */
    readonly register: SlotCore['register'];
```

```ts
    inject(key: keyof SlotMap & string, callback: () => SlotInjectionEffect): () => void;
```

`inject` 的 JSDoc：「The controller belongs to the caller's fiber, so plugin unload cancels a pending wait and removes any active contribution.」

实现（`@deepseek-ai/dsh-client-ui-renderer/lib/client.js:1015`）：

```js
			inject(key, callback) {
				const ctx = this.ctx;
				const disposeController = ctx.effect(() => {
					...
						const disposeEffect = ctx.effect(callback, `slots.inject(${JSON.stringify(key)}): declaration`);
					...
				});
```

> **⚠️ 结论**：`this.ctx` 是**调用方**的 context，effect 落在调用方 fiber 上。issue 09 里「slots.inject 把 effect 注册在服务自己的 context 上，插件卸载不会清理」的假设**不成立**，据此设计的手工 disposer 兜底是多余的（无害，但增加复杂度）。

`SlotCore.register` 的真实签名（`@deepseek-ai/dsh-client-ui-slots/lib/types/index.d.ts:589` 与 `:602`，两个重载）：

```ts
register<K extends keyof SlotMap & string, const EntryKey extends EntryKeyOf<K> = EntryKeyOf<K>, const D extends ChildrenDecl = Record<never, never>, H extends StoreDecl | undefined = undefined, M = never, N extends (keyof LocaleNamespaceMap & string) | undefined = undefined, C extends SlotComponent<never> = SlotComponent<never>>(options: BaseOptions<K, EntryKey, D, H, M, N> & {
    inject?: undefined;
}, component: C & SlotComponent<...> & RendersCheck<C, D>): () => void;
```

第二个重载多一个 `inject: (...args: InjectParams<K, H>) => I` 业务面工厂。两者都返回 `() => void`（同步 disposer）。

另有事件 `'slots/changed'(key: string): void`，以及 `isLive(entry)`、快照读取 API。

### 10.4 Slot 名全表

从各 `*/lib/types/client/contract/slots.d.ts` 的声明合并中枚举：

| 包 | slot 名 |
|---|---|
| `dsh-client-ui-sidebar` | `sidebar.brand.mark`、`sidebar.brand.name`、`sidebar.panellist`、`sidebar.workspaces`、`sidebar.settings`、**`sidebar.footer.action`** |
| `dsh-client-ui-sidebar-right` | `rightbar.session`、`sidebar.right.pane.tab`、`sidebar.right.pane.tab.title`、`sidebar.right.tab.guide`、`sidebar.right.tab.menu.item` |
| `dsh-client-ui-workspace` | `conversation.hero.workspace.directoryFlow`、`sidebar.workspaces.directoryFlow` |
| `dsh-client-ui-conversation` | `main.conversation`、`conversation.session`、`conversation.session.header`、`conversation.session.header.lineage`、`conversation.session.header.actions`、`conversation.session.header.utilities`、`conversation.session.header.corner`、`conversation.view`、`conversation.composer`、`conversation.hero.workspace`、`conversation.hero.brand.mark`、`conversation.hero.agentPreset`、`conversation.input.dock`、`conversation.input.overlay`、`conversation.composer.dock`、`conversation.input.left`、`conversation.input.right`、`conversation.composer.bar`、`conversation.input.attachments`、`conversation.input.plan`、`conversation.input.model` |
| `dsh-client-ui-chat` | `conversation.chat.node`、`conversation.message.images`、`conversation.chat.commandview`、`conversation.chat.turnTail` |
| `dsh-client-ui-approval` | `conversation.approval.detail` |
| `dsh-client-ui-settings` | `settings.trigger`、`settings.header`、`settings.action`、`settings.close`、`settings.section`、`settings.plugins.tab`、`settings.onboarding`、`settings.general.item` |
| `dsh-client-ui-tool` | `tool.call.toolview`、`tool.call.images` |

`sidebar.footer.action` 的精确契约（`@deepseek-ai/dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts:69`）—— **属实**：

```ts
        'sidebar.footer.action': {
            kind: 'list';
            scope: 'root';
            owner: SidebarFooterActionOwnerProps;
        };
```

```ts
export interface SidebarFooterActionOwnerProps {
    /** Whether the sidebar renders wide content (false = 56px rail). */
    wide: boolean;
}
```

owner 只传 `wide: boolean`（宽栏 / 56px 窄轨）。`kind: 'list'` 表示可以有多个 entry，`scope: 'root'` 表示不需要 session 上下文。

宿主自带的官方建议（`@deepseek-ai/dsh-agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md`）：

> "For small sidebar actions, prefer additive inner Slots such as `sidebar.footer.action`; do not replace the entire sidebar."

---

## 11. 侧栏 DOM（注入用）

包：`@deepseek-ai/dsh-client-ui-workspace`，文件 `lib/client.js`

### 11.1 CSS module 类名与 mangle —— **属实**

`lib/client.js:555`（内联 CSS）：

```css
.YDXeBa_rowActions{flex:none;align-items:center;gap:12px;display:none}
.YDXeBa_projectRow:hover .YDXeBa_rowActions{display:inline-flex}
```

`lib/client.js:582-586`（CSS-module 映射表）：

```js
"projectRow": "YDXeBa_projectRow",
"rowActions": "YDXeBa_rowActions",
```

lightningcss 的 mangle 形态是 **`<hash>_<local>`**，其中 `<hash>` 是**每文件一个**（同一 `Rows.module.css` 里所有 local 共用 `YDXeBa`），不是每个类各自的 hash。

> **注入选择器建议**：不要写死 `YDXeBa_`（换版会变），用后缀匹配：`[class*="_rowActions"]` / `[class$="_rowActions"]`。
> **注意 `display:none`**：`.rowActions` 默认隐藏，只在 `.projectRow:hover` 或 `.menuOpen` 时 `inline-flex`。注入的按钮天然继承这个「悬停才显形」的行为，与 spec 意图一致。

> ⚠️ **`rowActions` 这个 local 名被工作区行与会话行共用**（同一份 `Rows.module.css`，因此 mangle 后的类名完全相同）。实测一个五行侧栏里 `[class*="_rowActions"]` 命中 5 个节点，其中 2 个属于会话行。单靠这个选择器做注入会直接违反「不注入会话行」的约束。
>
> 判据是**层级而非类名**：工作区行的动作条是 `.projectRow` 的**直接子节点**，会话行的不是。所以选择器要写成 `[class*="_projectRow"]` + `:scope > [class*="_rowActions"]`。会话行的动作条 `closest('[class*="_projectRow"]')` 返回 `null`，可作为交叉验证。

### 11.2 `group` 对象的完整形状 —— **属实**

`lib/client.js:445` 起，`deriveGroups(...)` 构造：

```js
			for (const g of groupByWorkspace(list, workspaces, archived, view.ungroupedOrder)) {
				const expanded = expandedGroups.has(g.key);
				groups.push({
					key: g.key,
					workspaceId: g.workspaceId,
					cwd: g.cwd,
					createdAt: g.createdAt,
					label: g.label,
					sessionCount: g.sessions.length,
					expanded,
					containsCurrent: g.key === currentGroup,
					sessions: expanded ? g.sessions.map((session) => sessionNode(session, descendants, pendingInteractions)) : []
				});
			}
```

字段全表：`key`、`workspaceId`、`cwd`、`createdAt`、`label`、`sessionCount`、`expanded`、`containsCurrent`、`sessions`。

**ungrouped 组的构造**（`lib/client.js:403`）：

```js
			const stray = list.ids.map((id) => list.byId[id]).filter((s) => s !== void 0 && !accounted.has(s.id) && sessionVisible(s, list.current, archived));
			if (stray.length > 0) groups.push(buildGroup("", void 0, void 0, void 0, "", ungroupedOrder === void 0 ? stray : orderedUngrouped(stray, ungroupedOrder), ungroupedOrder === void 0 ? "recency" : "account"));
```

对照 `buildGroup(key, workspaceId, cwd, createdAt, label, members, order)`：

| 参数 | ungrouped 取值 |
|---|---|
| `key` | `""` |
| `workspaceId` | `undefined` |
| `cwd` | `undefined` |
| `createdAt` | `undefined` |
| `label` | **`""`** ✅ |

> ✅ **`label` 对 ungrouped 确实是字面量 `''`**（spec 断言属实）。
> 展示文案在渲染期才解析（`lib/client.js:679`）：
> ```js
> const label = row.workspaceId === void 0 ? t("group.ungrouped") : row.label;
> ```
> 所以**判别 ungrouped 用 `workspaceId === undefined`，不要用 `label === ''`**（真实 workspace 也可能有空标题）。

### 11.3 `onCreate` 与 ungrouped 渲染 —— **均属实**

`lib/client.js:1697`（`ProjectRowItem` 的调用点）：

```js
										onCreate: () => {
											if (group.workspaceId !== void 0) {
												setGroupExpanded(group.key, true);
												startSession(group.workspaceId);
											}
										},
										drag: workspaceDragProps,
										actions: group.workspaceId === void 0 ? void 0 : {
```

✅ `onCreate` 在 `group.workspaceId === undefined` 时**完全空转**（spec 断言属实）。
✅ `actions`（重命名／删除菜单）对 ungrouped 是 `undefined`。
✅ `if (stray.length > 0)` —— ungrouped 组**无成员时不 push、不渲染**（spec 断言属实）。

`.rowActions` 的子节点顺序（`lib/client.js:720-757`）：

```js
					(0, react_jsx_runtime.jsxs)("span", {
						className: Rows_module_css_default.rowActions,
						children: [actions !== void 0 && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, { ... }),
						(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: Rows_module_css_default.iconButton,
							"aria-label": t("actions.newSession.aria", { name: label }),
							onClick: (e) => {
								e.stopPropagation();
								onCreate();
							},
							children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {})
						})]
					})
```

即：真实 workspace 行是 `[Menu(...), PlusButton]`，ungrouped 行只有 `[PlusButton]`（`false` 被 React 跳过）。注入点若追加在末尾，会排在「+」之后。

### 11.4 可见性判据与 `accounted.add` 顺序

`lib/client.js:338`：

```js
		function sessionVisible(session, current, archived) {
			return session.origin !== "subagent" && !archived.has(session.id) && (!session.blank || session.id === current);
		}
```

> **⚠️ 与 spec 有出入（J）**：spec 写的是 `!blank`，真实第三项是 `(!session.blank || session.id === current)` —— **当前选中的空会话是可见的**（那是「新建会话」的临时行）。归档插件的过滤器如果照抄 spec 的 `!blank`，会在「当前是新建会话」时与内置侧栏不一致。

`accounted.add(id)` 的位置（`lib/client.js:392-400`）：

```js
		function groupByWorkspace(list, workspaces, archived, ungroupedOrder) {
			const groups = [];
			const accounted = /* @__PURE__ */ new Set();
			for (const workspace of workspaces) {
				const members = [];
				for (const id of workspace.sessionIds) {
					const summary = list.byId[id];
					if (summary === void 0) continue;
					accounted.add(id);
					if (!sessionVisible(summary, list.current, archived)) continue;
					members.push(summary);
				}
				groups.push(buildGroup(workspace.workspaceId, workspace.workspaceId, workspace.path, Date.parse(workspace.createdAt), workspace.title, members, "account"));
			}
```

✅ **`accounted.add(id)` 在 `sessionVisible` 判断之前**（spec 断言属实）。

> **语义后果（重要）**：一个已归档的 session，如果仍然登记在某个 workspace 的 `sessionIds` 里，它会被 `accounted` 收走，因此**既不出现在该 workspace 组里（被 `sessionVisible` 过滤），也不会掉进 ungrouped 组**。这正是「归档即从主列表消失」能成立的机制。
> 反过来：归档一个**不属于任何 workspace** 的 session，靠的是 `stray` 那一行的 `sessionVisible` 过滤。两条路径都覆盖到了。

### 11.5 U2 / U3 —— **已实测**

在 Chromium 153 上跑真实 DSH 0.1.5-rc.1（`packages/session-archive/e2e/`，两个真实工作区 + 未分组行，全部经 `workspaceRegistry.create` / `sessionPersistence.create` 建立）。

#### U2：fiber 上到 `props.group` 的路径

**key**：`Object.keys(el).find(k => k.startsWith('__reactFiber$'))`。随机后缀**每次页面加载一个**，整棵树共用同一个（本次为 `__reactFiber$bunclwesaa`，侧栏里每个节点都是它）。

**落点**：`group` 挂在 `ProjectRowItem` 的 `memoizedProps` 上，字段与 §11.2 完全一致，沿 `fiber.return` 向上走即可到达。

**深度不是常数**：

| 起点 | 工作区行 | 未分组行 |
|---|---|---|
| `.rowActions` | **4** | **2** |
| `.projectRow` | 3 | 1 |
| 「＋」按钮 | 5 | 3 |

差的这 2 层是工作区行独有的 tooltip / HoverCard 包裹层 —— 工作区行的动作条是 `span, button, button`（多一个菜单 `span`），未分组行是 `button, button`。**写死层数会在未分组行上直接失效**，必须用「向上有界搜索 + 对 `group` 做形状校验」：认 `key:string` / `sessionCount:number` / `expanded:boolean` / `label:string` / `workspaceId:string|undefined` 五个字段齐全才算命中。本插件的上限取 8。

#### U3：注入节点会不会被 React 清掉

**不会 —— 只要承载它的行没有 unmount。** 往三行的动作条里各插一个 `[data-probe-marker]`，随后逐项施压：

| 动作 | 行数 | 存活标记 | 位置 |
|---|---|---|---|
| 注入后 | 3 | 3 | `span,button,MARK,button` |
| 展开分组 | 3 | 3 | 不变 |
| 收起分组 | 3 | 3 | 不变 |
| 悬停 | 3 | 3 | 不变 |
| 整组批量归档 | 3 | 3 | 不变 |
| 点「＋」 | 3 | 3 | 不变 |
| 未分组组整体消失 | 2 | 2 | 不变 |
| 新工作区行插入 | 3 | 2 | 老行不变，**新行是裸的** |
| 收成 56px 轨 | 0 | 0 | 全部 unmount |
| 从轨展开 | 3 | **0** | 三行全裸 |
| 视口收到 640 | 0 | 0 | 全部 unmount |

全程 page console 无任何报错，React 也没有发出协调警告。

**结论对实现的约束**：注入节点的存活不需要防御，**重新注入**才需要。React 只会通过「整行 unmount」间接带走它，且带走时不留残骸；一次 re-scan 只要满足幂等（认已注入的节点、认 `isConnected === false` 的陈旧记录）就够了。侧栏收成轨和视口变窄是这个路径唯一的两个高频触发点。

---

## 12. 插件约定

### 12.1 两种插件形态

**函数式**：导出 `apply(ctx, config)`，可选 `name`、`inject`、`Config`。
**Service 式**：`class Xxx extends Service`，`constructor(ctx) { super(ctx, '<服务键>') }`，用 `static inject = [...]` 声明依赖。参考 `@deepseek-ai/dsh-workspace/lib/index.js`：

```js
var WorkspaceRegistry = class extends Service {
	static inject = ["storageDomain", "sessionPersistence"];
	constructor(ctx) { super(ctx, "workspaceRegistry"); }
```

服务类型必须通过声明合并挂到 `Context` 上：

```ts
declare module '@deepseek-ai/cordis' {
    interface Context {
        workspaceRegistry: WorkspaceRegistry;
    }
}
```

### 12.2 `Config`：Schemastery

包：`@deepseek-ai/schemastery`，版本 **`^3.18.2`**（安装到的实际版本 `3.18.2`）。
它在所有 dsh 包里都是**普通 `dependencies`**，不是 peer。导入写法（`@deepseek-ai/dsh-session-title/lib/types/index.d.ts:6`）：

```ts
import z from '@deepseek-ai/schemastery';
```

同一批包里另有 `zod`（`^4.4.3`，也是普通 dependency）用于**持久化记录的 schema**（domain spec），两者分工：Schemastery 管插件 `Config`，zod 管落盘数据。

### 12.3 `inject` vs `ctx.get` —— **⚠️ 与 spec 有出入（D）**

**实测**（`$env:TEMP\dsh-recon\probe-inject.mjs`）：

```
ctx.slots WITHOUT inject THROWS: cannot get property "slots" without inject
ctx.get("slots") WITHOUT inject: pong
ctx.registry reachable: function
ctx.slots WITH inject: pong
```

源码依据（`@deepseek-ai/cordis/src/reflect.ts`）：`get` trap 在直接属性访问时沿 fiber 链走 `fiber.store` 并对未声明依赖抛 `cannot get property "..." without inject`；而 `ctx.get(name, strict = true)` 按 isolation key 直接读 root reflect store，**不经过 Guard**。

宿主自带 SKILL 的原话（`@deepseek-ai/dsh-agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md`）：

> "`ctx.get('slots')` does not require an injection. Do not rewrite it as `ctx.slots` unless `inject: ['slots']` is declared"
> "Do not access `ctx.requiredService` without declaring the injection; the Guard rejects undeclared dependencies."

**范式**：
- **硬依赖**（没它插件不能工作）→ `inject: ['workspaceRegistry', 'sessionPersistence']` + `ctx.workspaceRegistry`。框架保证服务就绪后才跑 `apply`。
- **软依赖**（可降级）→ 不 inject，用 `ctx.get('sessionProjectionCache')?.` —— 见 §9.3 官方参考实现。
- `ctx.registry`、`ctx.effect`、`ctx.logger` 等内建能力无需 inject。

### 12.4 overlay 格式 —— **⚠️ 与 spec 有出入（I）**

CLI 选项（`@deepseek-ai/dsh/lib/bin.js:85`）：

```
.option("--patch <path>", "extra patch-list overlay applied after the profile layer (repeatable)", collect)
.option("--dump-config", "print the composed profile tree and exit")
.option("--dump-default-config", "print the profile tree without its user layer or --patch overlays and exit")
```

示例（`bin.js:38`）：

```
dsh --profile tui --patch ./extra.yml      boot a custom profile with one extra overlay
```

`dsh web` 子命令同样支持 `--patch`（`bin.js:101`）。

**格式**（真实样例 `@deepseek-ai/dsh-acp-app/cordis.patch.yml`，逐字）：

```yaml
# The automation-only ACP application over dsh-base. Stdout belongs to ACP.

- id: system-prompt
  config:
    personaSuffix: Your working directory is {{cwd}}.
    personaPrefix: >-
      You are a coding agent powered by the {{model}} model.

- id: session-title-llm
  disabled: true

- insert:
    - id: acp-app-startup
      name: '@deepseek-ai/dsh-acp-app'

    - id: acp
      name: '@deepseek-ai/dsh-acp'
      inject: [acpAppStartup]
      config:
        provider: deepseek-official
        model: deepseek-v4-flash
```

要点：
- 顶层是一个**列表**，每项要么是 `{ id, config? , disabled? }`（改已有行），要么是 `{ insert: [...] }`（插新行）。
- **`config` 是整体替换，不是深合并**（`dsh-base/cordis.patch.yml` 头部注释明确说明："A patch replaces the targeted row's whole `config` rather than merging into it"）。
- 行 `inject` 里写的是**服务名**（如 `acpAppStartup`），与 `dsh.client.inject` 的包名语义不同，别混。
- 支持自定义 YAML tag `!!js`，值是可执行表达式，作用域里能拿到 `ctx`、`process`、`dshHomePath(...)`，例如：
  ```yaml
      config:
        root: !!js dshHomePath('sessions')
        host: !!js ctx.webStartup.host ?? '127.0.0.1'
        disabled: !!js process.platform === 'win32'
  ```
- 行顺序**不承载加载语义**（激活由服务可用性驱动），只为可读性分组。

**路径解析**（`@deepseek-ai/dsh-app-boot/lib/index.js:1169`）：

```js
/** Convert inserted filesystem paths to file URLs, anchoring relative paths beside the patch; keep assertion names literal. */
function anchorInsertedPluginNames(patches, file) {
	const base = dirname(resolve(file));
	const visit = (entry) => {
		if (typeof entry.name === "string" && (isAbsolute(entry.name) || entry.name.startsWith("./") || entry.name.startsWith("../"))) entry.name = pathToFileURL(resolve(base, entry.name)).href;
```

> **⚠️ 结论**：spec 说「overlay 中的插件路径必须为绝对路径」**不准确**。三种写法都行：
> - 绝对路径 → 直接 `pathToFileURL`
> - `./xxx` 或 `../xxx` → 以 **overlay 文件所在目录**为基准解析
> - 其余（包括裸相对路径 `packages/foo/lib/index.js`）→ 当作 **npm 包名**，走 node resolution
>
> 本 monorepo 的推荐写法是相对路径（overlay 与 `packages/` 同在仓库内，可迁移）：
> ```yaml
> - insert:
>     - id: session-archive
>       name: './packages/session-archive/lib/index.js'
> ```

`dsh --dump-config` 可以在不启动的前提下打印合成后的 profile 树，是调试 overlay 的首选手段。

---

## 13. peerDependencies vs dependencies

实测的第一方模式（`package.json` 原文）：

```
@deepseek-ai/dsh-workspace
  peer: {"@deepseek-ai/cordis":"^4.0.2","@deepseek-ai/dsh-invariants":"^0.1.5-rc.1","@deepseek-ai/dsh-session-persistence":"^0.1.5-rc.1","@deepseek-ai/dsh-session":"^0.1.5-rc.1","@deepseek-ai/dsh-storage":"^0.1.5-rc.1","@deepseek-ai/dsh-storage-domain":"^0.1.5-rc.1","@deepseek-ai/dsh-typert-protocol":"^0.1.5-rc.1"}
  deps: {"zod":"^4.4.3","@deepseek-ai/dsh-brand":"^0.1.5-rc.1"}

@deepseek-ai/dsh-agent-loop
  peer: {"@deepseek-ai/dsh-agent":"^0.1.5-rc.1","@deepseek-ai/dsh-llm":"^0.1.5-rc.1","@deepseek-ai/dsh-invariants":"^0.1.5-rc.1","@deepseek-ai/dsh-session":"^0.1.5-rc.1","@deepseek-ai/cordis":"^4.0.2","@deepseek-ai/dsh-scope":"^0.1.5-rc.1","@deepseek-ai/dsh-session-projection":"^0.1.5-rc.1","@deepseek-ai/dsh-session-persistence":"^0.1.5-rc.1","@deepseek-ai/dsh-system-prompt":"^0.1.5-rc.1","@deepseek-ai/dsh-tools":"^0.1.5-rc.1","@deepseek-ai/dsh-settings":"^0.1.5-rc.1"}
  deps: {"zod":"^4.4.3","@deepseek-ai/dsh-brand":"^0.1.5-rc.1","@deepseek-ai/dsh-util-values":"^0.1.5-rc.1","@deepseek-ai/schemastery":"^3.18.2"}

@deepseek-ai/dsh-session-persistence-jsonl
  peer: {"@deepseek-ai/dsh-session":"^0.1.5-rc.1","@deepseek-ai/dsh-session-persistence":"^0.1.5-rc.1","@deepseek-ai/cordis":"^4.0.2"}
  deps: {"koffi":"^3.1.0","@deepseek-ai/dsh-llm":"^0.1.5-rc.1","@deepseek-ai/dsh-session-format":"^0.1.5-rc.1","@deepseek-ai/dsh-session-format-catalog":"^0.1.5-rc.1","@deepseek-ai/node-addon-system":"^0.1.2","@deepseek-ai/schemastery":"^3.18.2","@deepseek-ai/dsh-session-format-v2-to-v3":"^0.1.5-rc.1"}

@deepseek-ai/dsh-client-ui-sidebar
  peer: {"@deepseek-ai/cordis":"^4.0.2"}
  deps: null
```

归纳出的判据：**凡是「运行期必须与宿主共享同一份实例 / 同一组 Symbol / 同一个 `Context` 接口」的，一律 peer；凡是纯粹的值计算库，一律普通 dependency。**

推荐给 `session-archive` 的划分：

| 类别 | 包 | 理由 |
|---|---|---|
| **peerDependencies** | `@deepseek-ai/cordis` (`^4.0.2`) | `Symbol.for('cordis.effect')` 用的是全局 registry symbol（跨副本安全），但 `Service` 基类、`Context` 的 prototype 身份、`instanceof` 判定都要求单副本。**这是 Symbol 分裂风险最大的一个。** |
| | `@deepseek-ai/dsh-workspace` (`^0.1.5-rc.1`) | 需要 `WorkspaceUnknownSessionError` 的 `instanceof` 判定 |
| | `@deepseek-ai/dsh-session-persistence` (`^0.1.5-rc.1`) | 需要 `SessionAlreadyOwnedError` / `SessionFormatUnsupportedError` 的 `instanceof` 判定 |
| | `@deepseek-ai/dsh-session` (`^0.1.5-rc.1`) | `SessionLogOffset` brand 函数、`SessionHeader` 类型 |
| | `@deepseek-ai/dsh-agent` (`^0.1.5-rc.1`) | `Agent` 类型、`ctx.agents` 声明合并 |
| | `@deepseek-ai/dsh-subagent` (`^0.1.5-rc.1`) | `ctx.subagents` 声明合并 |
| | `@deepseek-ai/dsh-client-connection` (`^0.1.5-rc.1`) | `ctx.connection` 声明合并（两半都要） |
| | `@deepseek-ai/dsh-storage-domain` (`^0.1.5-rc.1`) | 仅在需要 `ctx.storageDomain` 诊断兜底时 |
| | `@deepseek-ai/dsh-session-projection` / `-cache` (`^0.1.5-rc.1`) | `ProjectionSnapshot` / `SessionProjectionMap` 类型；**只做类型用途时可退为 devDependency**（软依赖走 `ctx.get`） |
| | `@deepseek-ai/dsh-client-ui-renderer`、`-sidebar`、`-slots`、`-primitives`、`react`、`react-dom` | 客户端半侧全部 external，由宿主 bundle 提供 |
| **dependencies** | `@deepseek-ai/schemastery` (`^3.18.2`) | 纯值库，多副本无害（第一方全部这么写） |
| | `zod` (`^4.4.3`) | 同上（若需要自建 domain schema） |
| **devDependencies** | `typescript`、`esbuild`、`@types/react` 等 | 构建期 |

> **关于 Symbol 分裂**：cordis 的 effect label 用的是 `Symbol.for('cordis.effect')`（**全局 symbol registry**），所以跨副本读 label 本身是安全的。真正会炸的是 `Service`/`Context` 的类身份与 `instanceof`。因此 `@deepseek-ai/cordis` 必须 peer，且在 pnpm 下要确保它 hoist 到同一实例（monorepo 里用 workspace-level 的单一版本 + `pnpm.overrides` 锁死）。
> 另注意：`@deepseek-ai/dsh-brand`（branded 类型）在第一方里是**普通 dependency** —— 说明 brand 是纯结构性的（`Branded<'X'>` 只是类型层的 tag），运行期无身份依赖，多副本无害。

---

## 附：可复现的实测脚本

侦察工作区与其中的两个探针脚本已在插件完工后删除。它们当初验证的两组语义现在由仓库内的单元测试常驻锁定，不必再靠一次性脚本：

- effect wrapper 的 `await wrapper` 与 `await wrapper()` 之别、外部不可 memoize、`registry → fibers → _disposables` 枚举链路、disposer 逆序执行 —— 见 `packages/session-archive/tests/agent-effects.test.ts`，其中的 fixture 特意做成「既可调用又是 thenable」，写错哪一种都会红。
- `ctx.<service>` 与 `ctx.get(name)` 的 inject 要求之别 —— 结论已落进 `spec.md` 的架构一节与实现的依赖声明。

需要重建侦察工作区时，一条命令即可（约 518 个包、214 MB）：

```powershell
mkdir "$env:TEMP\dsh-recon"; cd "$env:TEMP\dsh-recon"
npm install @deepseek-ai/dsh@0.1.5-rc.1 --ignore-scripts
```

本文正文里 `<包名>/<包内相对路径>:<行号>` 形式的引用与该目录是否存在无关，重建后即可逐条复查。
