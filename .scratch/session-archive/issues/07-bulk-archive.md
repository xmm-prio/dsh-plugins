# 07 · 全部归档

Status: done
Blocked by: 03

计算某个工作区、或未分组中所有应归档的会话，逐个归档。

## 成员判定

复刻内置侧栏的谓词。可见性三个合取项：

```
session.origin !== 'subagent' && !archived.has(id) && !blank
```

归属：会话属于某工作区当且仅当它在该工作区的 `sessionIds` 里。未分组 = 不在任何工作区账本里的会话。

## 要点

**顺序有讲究。** 内置实现里「已记账」的标记发生在可见性检查**之前**，所以一个已归档但仍挂在工作区账本里的会话算已记账、不落进未分组。先算归属再过滤可见性，反了会把归档会话误算进未分组。

**blank 会话无条件跳过。** 它们连日志都没有，官方 `archiveSession` 对无日志会话会抛 `WorkspaceUnknownSessionError`。

**逐个顺序 await，不要并发。** 每次 `archiveSession` 都产生一次状态写和一帧推送，并发会造成推送风暴。

`archiveSession` 幂等且与工作区归属无关，重复调用安全。

## 对外能力

- `archiveWorkspace(workspaceId)`
- `archiveUngrouped()`

两者都返回实际归档的数量与跳过的原因分类。

## 验收

- 归档某工作区后该工作区在侧栏中变空，会话出现在归档区
- 归档未分组后未分组那一栏消失（它无成员时本来就不渲染）
- blank 会话不被归档也不报错
- subagent 子会话不被归档

## Comments

已完成，判据在 `src/domain/grouping.ts`，纯函数。

- **可见性判据的第三个合取项是 `(!session.blank || session.id === current)`，不是 `!blank`** ——当前选中的空会话是可见的。issue 正文这里写错了。
- **`accounted` 必须在可见性之前判断**：一个会话先要在某个账本里被记账，才谈得上「在这一行里可见」。顺序颠倒会让未分组行把已归属会话也算进去。单测专门锁这个顺序。
- **整体拒绝与逐项跳过是两个不同的通道。** 原设计里 `BulkArchiveResult.unknownScope: boolean` 与 `failed` 混在一起表达，类型都对不上。改成 `refusal?: { code, detail }`：整个动作被拒绝时只填这一个字段，其余字段为空。跳过（当前会话、子代理）走 `skipped`，单项失败走 `failed`。
- 活体确认：按工作区整行归档命中该行显示的全部会话；未分组整行归档正确跳过子代理会话并给出 `reason: 'subagent'`；不存在的工作区被 `refusal.code === 'unknown-scope'` 拒绝，而不是静默返回空结果。
