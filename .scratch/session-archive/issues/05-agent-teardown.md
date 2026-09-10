# 05 · agent 拆除器

Status: done
Blocked by: 02

按 SessionId 彻底拆掉一个活着的 agent：停机、drain、关写句柄、脱离 agent 与 session 两个注册表。删除日志之前必须先做这件事，否则活着的 agent 会在删除期间继续 append，甚至把目录重新造出来。

宿主没有提供任何公开手段——`AgentRegistry` 没有 `stop` / `dispose(id)`，`AgentHandle` 只发给创建者，而 Web 端在 `resume` 后把它解构丢弃了。

## 机制

agent-loop 把整条 teardown 折成一个 cordis effect，label 里编码了 SessionId：

```
label = `agentLoop.lifecycle(${sessionId})`
```

遍历 `ctx.registry.values()` 的 `runtime.fibers`，在每个 `fiber._disposables` 里按 `Symbol.for('cordis.effect')` 标签上的 `label` 匹配，找到那个 wrapper 并 await 它。

这是**调用官方 disposer 本身**，不是模拟：它逐字执行 `cancel({kind:'disposed'})` → `whenIdle()` → `scope.dispose()` → `await handle.close()` → 脱离两个注册表。memoized，与并发的正常卸载安全共存；返回 Promise 可 await；失败以原样 Error 或 AggregateError 抛出。

## 探针复验

拆完之后用一道**完全公开**的判据确认：

```
await sessionPersistence.open(id, 'write')   // 写句柄仍被持有时抛 SessionAlreadyOwnedError
```

成功即证明写路径已释放。**成功后必须立刻 close，否则自己成了 owner 把 id 卡死。**

## 要点

**找不到 label 必须大声失败。** 静默返回「没找到」然后让调用方继续删除，是这套机制最阴险的失效模式。

只有 `cancel` + `scope.dispose()` 是不够的——agent 仍在注册表里、写句柄仍属于它，探针仍会被拒。

会话若有 continuable subagent 子树，可配合完全公开的 `ctx.subagents.drainContinuableChildren(parent, childIds)` 一并收掉。

宿主的 `session/disposed` 与 `agent/disposed` 事件不收集监听器返回的 Promise，**不能靠监听让 DSH 等你**；完成判据以探针为准。

## 对外能力

- `teardown(sessionId)`：拆单个，返回是否确实拆掉了活体
- `teardownAll()`：拆掉所有活着的 agent（供「一键关闭所有运行中会话」使用）

## 验收

- 拆除后 `ctx.agents.get(id)` 与 `ctx.sessions.get(id)` 均为 undefined
- 拆除后探针能成功打开写句柄
- label 匹配不到时抛出明确错误，调用方不会继续删除
- 对没有活体的会话是无副作用的 no-op

## Comments

已完成。issue 正文里最危险的一处说法已订正。

- **必须 `await wrapper()`，不是 `await wrapper`。** 后者 resolve 出来的是 `disposeAsync` 函数本身，一行 disposer 代码都不会跑——会在写租约还被持有的情况下把日志目录删掉。`runEffectDisposer` 就这一行，单测里放了一个 wrapper 既可调用又是 thenable 的 fixture，并额外断言 `await 裸 wrapper` 返回的是函数、什么都没执行。
- **label 必须整串精确匹配。** 同一文件里的 `agentLoop.resume(${id})` 带的是 config agent id，不是 SessionId，按 `agentLoop.` 前缀匹配会命中错误的 effect。活体上专门放了一个 `agentLoop.resume(...)` 诱饵，确认没被误伤。
- **`_disposables` 是 `DisposableList`，没有 `.values()`**，用 `for...of`。
- **wrapper 没有外部记忆化**，第二次调用返回 `undefined` 而不是可 join 的 thenable，所以自己维护 `inFlight: Map<string, Promise<TeardownResult>>`。
- **「找不到 label 必须大声失败」与「对没有活体的会话是无副作用的 no-op」这两条验收看似矛盾，用 `ctx.agents.get(id)` 交叉验证解决**：找不到 effect 且 `agents.get(id)` 也是 `undefined` → 真的没在跑，返回 `{kind:'not-running'}`；找不到 effect 但 agent 确实注册着 → 宿主的 label 变了，大声抛错。`ctx.agents.list()` / `get()` 都是公开 API，是权威的活体来源。
- **删掉了原计划的子代理排空。** 它依赖 `agent.children` 这个没有验证过的字段，而 `scope.dispose()` 本身会级联。宁可不写。
- 活体确认：在真实 cordis registry 上装一个带精确 lifecycle label 的 effect，走删除路径触发拆除，disposer **确实被执行了**，诱饵没有被碰。没有真实 agent 的情况下 `shutdownAll` 返回空结果，符合预期。
