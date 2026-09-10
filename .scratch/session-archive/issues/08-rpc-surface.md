# 08 · RPC 通道

Status: done
Blocked by: 03, 04, 05, 06, 07

把宿主半的能力汇成一个通道暴露给浏览器半。

## 通道

> **已订正（2026-09-10）**：原文要求的 `ctx.connection.rpc.handle('/session-archive', handler)` 在 `0.1.5-rc.1` 上**必抛**，且因为发生在 `apply` 里会打死整个 harness 的 boot。依据见 `dev-env.md` §9.1 与 `spec.md` 的「通道」一节。下文是订正后的方案。

宿主侧改用 `ctx.connection.fetch.register`，每个端点一条精确路由，`inject` 只需 `['connection']`：

```js
ctx.connection.fetch.register({
  path: '/api/session-archive.<endpoint>',   // 必须落在 /api 之下
  methods: ['POST'],
  requestBody: 'buffered',
  fetch: async (request) => { /* 返回 Response */ },
})
```

鉴权不需要自己写：这些路由挂在共享 `/api` 通道上，Host/Origin 围栏（403）与 token/cookie 认证（401）照常施加。**绝不能改用 `ctx.webServer.register` 自建路由**——那是裸载体，实测无 cookie 直接 200，而本插件能删会话日志。

浏览器侧的编程接口不变，仍是 `ctx.connection.rpc.call('/api', endpoint, payload, signal)`：`createSharedFetchHandler('/api')` 先查 `fetchRoutes` 再落到 Gateway，所以自注册路由能被命中。代价是宿主 handler 要自己解析并回吐信封：

- 请求 `{"type":"client-request","rpcId","method","payload"}`，其中 `method` 必须等于 endpoint
- 响应 `{"type":"server-response","rpcId","result":{"ok":true,"value":…}}`，`rpcId` 必须原样回echo（客户端会比对，不一致直接抛）
- 失败分支 `{"ok":false,"error":{"code","message","details"}}`，三个字段缺一不可，`details` 必须是对象

endpoint 名受 `/^[A-Za-z0-9_$.-]+$/` 约束（允许 `.` 与 `-`），故用 `session-archive.<name>` 点分命名做前缀隔离。

信封的封装/解析**必须收敛在一个模块里，两半各一份**，端点处理器不碰信封。传输层失败在浏览器侧是 **throw** 而非错误分支，客户端要同时处理 `throw` 与 `{ok:false}` 两条路径。

## 端点

| 端点 | 路由 | 说明 |
|---|---|---|
| `capabilities` | `/api/session-archive.capabilities` | 能力清单与禁用原因（issue 02） |
| `list` | `/api/session-archive.list` | 归档会话列表，含元数据与原工作区归属（issue 04） |
| `unarchive` | `/api/session-archive.unarchive` | 取消归档，接受 id 数组（issue 03） |
| `delete` | `/api/session-archive.delete` | 删除，接受 id 数组（issue 06） |
| `archiveWorkspace` | `/api/session-archive.archiveWorkspace` | 全部归档一个工作区（issue 07） |
| `archiveUngrouped` | `/api/session-archive.archiveUngrouped` | 全部归档未分组（issue 07） |
| `shutdownAll` | `/api/session-archive.shutdownAll` | 关闭所有运行中会话（issue 05） |

侧栏行内按钮（issue 11）不需要额外端点：数量来自 fiber 上的 `group.sessionCount`，动作复用 `archiveWorkspace` / `archiveUngrouped`。

## 要点

> **已订正**：原文「用 `ctx.get` 在插件的隔离 ctx 下拿不到服务符号」说反了。需要 `inject` 的是**直接属性访问** `ctx.foo`；`ctx.get('foo')` 绕过 Guard，无需 inject，且这正是宿主自己的可选依赖范式。硬依赖用 `inject` + 属性访问，软依赖用 `ctx.get(name)?.`。见 `host-internals.md` §12.3。

宿主半硬 `inject: ['connection', 'workspaceRegistry', 'sessionPersistence']`。

浏览器半只 `inject: ['slots']`，其余服务防御式 `ctx.get()` 读取。inject 声明过多会导致 slot 入口根本不出现；**服务名写错是静默失败**，插件永远等不到依赖，对照 `dev-env.md` §7 的实测服务名清单。

所有写端点返回结构化的成功/失败，失败带可展示给用户的原因码，不要抛裸异常。**`apply` 里任何未捕获异常都会打死整个 harness**，端点注册与能力探测都必须自己兜住。

## 验收

- 全部端点可从浏览器半调通
- 插件卸载后通道与路由被清理干净
- 能力被禁用时对应端点返回明确的拒绝原因而非崩溃

## Comments

已完成。正文的 通道 一节在实现前按活体结论整段重写过，这里只记结论。

- **`ctx.connection.rpc.handle` 在 0.1.5-rc.1 上必然抛异常，且异常发生在 `apply` 里，会打死整个宿主进程。** 它内部 `owner.effect(() => owner.webServer.register(route), ...)`，而 connection 只声明了 `inject = ["credentials"]`，于是 `cannot get property "webServer" without inject`。四种绕法（自己 inject `webServer`、包 `ctx.effect`、`ctx.inject(['webServer'], ...)`、`ctx.get('connection')`）全部失败。这是上游 bug，不是用法问题——没有任何一方包调用它，所以这个 bug 一直没被发现。
- **改用 `ctx.connection.fetch.register`**，八个端点各一条精确路由 `/api/session-archive.<操作>`，`methods: ['POST']`、`requestBody: 'buffered'`。端点名的 `/^[A-Za-z0-9_$.-]+$/` 允许 `.`，所以点号命名空间天然做到前缀隔离。
- **不用 `ctx.webServer.register` 自注册。** 它能工作，但完全绕过鉴权——这样注册的路由无 cookie 也返回 200。本插件能删除会话日志，这条路不可接受。
- **鉴权确实是免费继承的**，活体确认：无 cookie → 401，外域 Origin → 403。
- **信封自己拆装，但集中在每一半各一个模块里**（`src/host/transport/endpoint-router.ts`、`src/client/transport/archive-api.ts`），端点处理函数从不接触信封。路由永远回 HTTP 200 加 `server-response` 信封，包括失败——抛异常会变成 HTTP 500，浏览器侧 `call()` 会 throw 而不是给出 `{ok:false}`。
- **注册本身包在 try/catch 里**，`apply` 逸出异常会打死宿主。
- **原表里的 `sidebarGroups` 行删掉了，改为新增 `groups` 端点**：侧栏行内注入没有实现（见 issue 11），批量归档改在插件自己的面板里做，成员判据仍留在宿主上。
- 活体确认：载荷类型错误返回失败信封而非 HTTP 500，且错误消息点明是哪个字段；`method` 与路由不一致被 `session-archive/bad-request` 拒绝。

### 复审整改（2026-09-10）

- **四个传输层错误码进了 contract。** `session-archive/bad-request`、`/handler-failed`、`/no-connection`、`/transport` 原先各自定义在两个传输模块的私有常量里，两侧对不上编译器也不会说话，而且它们绕过了文案字典——`useArchive.ts` 直接把 `` `${code}: ${message}` `` 渲染给用户。现在它们是 `TransportFailureCode` 加一个 `TRANSPORT_FAILURE` 常量表，两半共用；`CallOutcome.code` 也从 `string` 收紧到这个联合，字典因此能做穷尽检查。中文文案与其余码一视同仁，底层 message 跟在括号里——只有它能说清是哪条路由、哪个 profile。
- **三处裸渲染统一走 `callFailureText`**：`useArchive`（经 `ArchiveCopy.transport` 注入，这个 hook 按设计不含任何字符串）、`ShutdownAll.tsx`、`sidebar/install.ts`。
- **重复实现清掉三处**：`endpoint-router.ts` 里与 `errors.ts` 的 `describeError` 一字不差的本地 `describe` 删除；后端名回退 `typeof name === 'string' ? name : '(unnamed)'` 收进 `jsonl-backend.ts` 的 `backendName()`，`index.ts` 与探测各调一次；`error instanceof Error ? error.message : String(error)` 收进 `errors.ts` 的 `errorMessage()`。
