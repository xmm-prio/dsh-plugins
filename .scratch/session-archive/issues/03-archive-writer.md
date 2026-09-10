# 03 · 归档集合写入器

Status: done
Blocked by: 02

归档集合（`workspace` 存储域 global 上的 `archivedSessionIds`）的读写封装。这是整个插件唯一一处触碰宿主私有状态的地方，必须收敛在一个模块里——将来宿主补上官方 unarchive，或者内部形状变动需要改走 fork 路线，都只换这一块。

## 接口

- `archived(): readonly SessionId[]`
- `archive(ids)`：逐个顺序 await 官方 `workspaceRegistry.archiveSession`
- `unarchive(ids)`：走下述写入路径

## 取消归档的写入路径

```
workspaceRegistry.enqueueOperation(async () => {
  const domain = storageDomain.get('workspace')
  const state  = domain.global.get()
  const next   = <从 state.archivedSessionIds 中移除>
  await domain.global.set({ ...state, archivedSessionIds: next })
  registry.state.archivedSessionIds = next
})
```

## 要点

**必须挂在 `enqueueOperation` 上。** 它是官方所有注册表写入共用的互斥链；自建串行队列会与官方写入交错并静默回滚，还会绕过 `pendingMutation` 的崩溃恢复协议。

**必须回填 `registry.state`。** `WorkspaceRegistry` 缓存状态且不监听 `domain/changed`，不回填的话当前页面看着生效、刷新就回滚。

**读失败与「域没开」必须与「空集合」区分开。** 把读失败当成空对象去 `{ ...{} }` 覆写会抹掉 `workspaceIds`，那是灾难性的。用一个明确的哨兵表示读不到，读不到就拒绝写。

归档路径直接用官方 `archiveSession`，不要自己写域——它自带幂等检查与 `sessionKnown` 校验。它对无日志会话会抛 `WorkspaceUnknownSessionError`，调用方需处理。

## 验收

- 取消归档后会话回到原工作区的原位置，不落入未分组
- **刷新页面后不回滚**
- 与官方归档操作并发时不互相覆盖
- 域读不到时拒绝写入并报错，不产生任何写

## Comments

已完成。私有形状全部封在 `src/host/internals/workspace-state.ts` 一个文件里。

- **读路径不需要任何私有访问**：`archivedSessionIds` 是公开 getter。只有取消归档的写路径碰私有。
- **「读失败」与「集合为空」必须分开。** `readWorkspaceDomainState` 返回带 `reason` 的判别联合（`domain-facility-unavailable` / `domain-not-open` / `global-unreadable` / `state-malformed`）。读不到就拒绝写，否则会把整个归档集合清空。这是本 issue 最危险的一处，单测专门覆盖。
- **写完 backfill `registry.state`，整对象替换**，与官方 `setState` 一致。
- **意外收获：不需要手工通知浏览器。** `dsh-storage-domain` 每次持久化写入后 emit `domain/changed`，`dsh-api-workspace-controller` 订阅它并向浏览器 follower 推 `{type:'archived', archivedSessionIds}`。所以带外写入归档集合会自动让官方侧栏刷新。但 `WorkspaceRegistry` 自己**不**订阅这个事件，所以 `registry.state` 的 backfill 仍然必要（宿主内一致性，以及重启后不回滚）。
- 活体确认：归档 3 个会话后，工作区账本仍然记着这 3 个 id（归档是纯可见性，不动归属）；取消归档后 registry 缓存与持久化状态一致；**完整重启宿主进程后归档集合不变，被取消归档的会话没有回来**。
