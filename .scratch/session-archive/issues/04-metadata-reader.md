# 04 · 会话元数据读取

Status: done
Blocked by: 02

为归档区面板提供列表数据。硬约束：**面板必须瞬开**，所以只用零 I/O 的廉价来源，不做任何会读完整日志的回退。

## 每条会话需要的字段

| 字段 | 来源 |
|---|---|
| 会话 id、创建时间、cwd | `SessionHeader` |
| 磁盘占用 | `sessionPersistence.list()` 快照上的 `sizeBytes` |
| 标题 | `sessionProjectionCache.cachedSnapshot(header, SessionLogOffset(0))` 的 `title` 投影 |
| 最后活动时间 | 同上快照的 `sessionListMetadata.lastPromptAt` |
| 原工作区 | 反查各工作区的 `sessionIds` |

标题 miss 时退回 `cachedPredecessorTitle`；仍然 miss 就显示会话 id，排序退回 `createdAt`。

## 要点

**不要用 `sessionQuery.readTitleSnapshots`。** 它对每个非活会话都读完整日志，归档多时会把面板卡死。

`SessionPersistenceSnapshot` 上的 `eventCount` 接口里有但 JSONL 后端从不填，恒为 `undefined`，不要依赖。

`revision` 是不透明的变更令牌，只能比较相等性，**不要解析它取 mtime**。

`SessionHeader` 没有 `updatedAt`，只有 `createdAt`。

已知盲区写进 README：投影缓存由 Web 端 session-controller 注册；fork 出来的会话（`isSeeded`）拿不到缓存快照。

## 验收

- 面板打开耗时与归档会话数量基本无关
- 缓存 miss 的会话正常显示（降级为 id + 创建时间），不阻塞其他条目
- 磁盘占用总计准确

## Comments

已完成。标题来源的问题查清了，结论与 issue 正文相反。

- **`title` 确实是运行期 `SessionProjectionMap` 的一个键。** `dsh-session-title` 注册了 `titleProjectionDefinition`，`key: "title"`。issue 正文说「`title` 不是 `SessionProjectionMap` 的键」是静态读类型声明得出的错误结论——那个键是运行期由插件注册进去的。因此不需要退化到会话 id。
- **官方冷会话阶梯照抄自 `dsh-api-session-controller.projectionsFor`**：`header.isSeeded ? undefined : cache?.cachedSnapshot(header, 0, keys) ?? cache?.cachedPredecessorTitle(header, 0)`，整体包 try/catch。第一个参数是**头部对象**，不是 id；第二个参数是 `inheritedEventCount`，非分叉传 `0`。分叉会话由宿主自己跳过。
- **分叉会话与 `isSeeded` 会话拿不到标题**，此时显示会话 id。内置会话列表在同样情况下也拿不到，行为一致，不算退化。
- **`blank` 的语义订正**：`blank = state.blank && event.type !== 'turn/start'`，初值 `true`。也就是「从未开始过一轮对话」，**不等于「没有日志」**。`src/domain/grouping.ts` 里两处注释按这个改了。
- **活体上发现的一件事**：没有投影检查点的冷会话，`blank` 一律读成 `false`——宿主自己的冷路径也是 `metadata?.blank ?? false`。所以一个从未开始对话、又没有检查点的会话会被算作可见、可归档。这与内置会话列表完全一致，已写进 README 的已知限制。
