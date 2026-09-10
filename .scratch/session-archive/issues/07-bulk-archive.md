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

### 复审整改（2026-09-10）：`current` 到底能不能拿到

复审指出 `service.ts` 把 `current` 硬编码为 `undefined`，等于让可见性判据的第三个合取项 `(!blank || id === current)` 失效。查证结果分两半——**「宿主拿不到」成立，「因此判据失效」不成立**。

**宿主拿不到，有据可查。** `@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/service.d.ts` 里，`current` 是浏览器 `ClientSessions` 上一个**私有、按连接持久化**的选中格，投影到 `list.current`。没有任何宿主 RPC 携带它，两个同时连着的浏览器还可以各选各的。所以这不是「忘了传」，是宿主侧根本不存在这个事实。

**但它对本插件的输出没有影响。** `current` 只在 `SessionGroup.visible` 里起作用，而 `visible` 除了单测没有任何读者；`planBulkArchive` 消费的是 `accounted`，且 spec 明写空会话「**无条件跳过**」——包括被选中的那一个。也就是说，即便把选中项接进来，批量归档的计划也一字不变。为了一个不改变任何输出的值去拉一条跨半的通路，是补丁式实现。

因此的处理是把这件事**说清楚并锁死**，而不是留一个静默的 `undefined`：

- 判据合并为一条 `hiddenReason` 阶梯，`sessionVisible` 与 `planBulkArchive` 的跳过原因由它同时导出——「是否在屏幕上」与「为什么没被归档」本来就是同三个问题，先前是两条平行阶梯，会漂移。
- 新增具名常量 `NO_SELECTION`，带完整 docstring 说明两个调用方各自为什么传它（宿主半：拿不到；批量归档：刻意不传，这正是「空会话无条件跳过」的实现机制）。
- 新增不变量单测：对每一个会话 id 以及一个不存在的 id 逐个当作 `current`，`planBulkArchive` 的结果必须与 `NO_SELECTION` 完全相等；同时另有一测证明 `groupSessions` 的 `visible` **确实**随选中项变化，两者并不矛盾。
