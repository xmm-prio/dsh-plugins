# 13 · 关闭所有运行中会话会打死 DSH 进程

Status: done
Blocked by: 10

用户报告：点归档区的「关闭所有运行中会话」之后，web 崩溃。

## 机制

DSH 在 `dsh-app-boot` 的启动路径里装了 `installFailLoud`：**任何一个未捕获的 Promise 拒绝**都会被写成 `dsh: fatal load failure: <stack>` 然后 `proc.exit(1)`。宿主进程一死，浏览器那一侧连接断开，表现就是「web 崩溃」。

所以问题不是界面的，是宿主半在关闭过程中漏出了一个没人接住的拒绝。

## 要点

`teardownAll()` 的目标集是 `ctx.agents.list()` 的全部活体，其中有两类本不该被直接拆：

- **浏览器当前正在看的那个会话**。打开即 resume，所以它必然在列表里。
- **子代理会话**。它的 agent 属于父会话，父会话的 `scope.dispose()` 本来就会级联收掉它。插件再单独拆一次，就是在和宿主的级联抢同一个 scope。

第二类是结构性的：不依赖堆栈也该修。`ctx.agents.roots()` 是公开 API，直接给出根 agent，子代理天然不在其中。

## 验收

- 关闭全部之后 DSH 进程仍存活，stderr 没有 `fatal load failure`
- 目标集只含根 agent
- 某个会话拆除失败不中断其余，且逐条报出失败原因
- 失败的拆除同样不会带走进程

## Comments

### 复现的边界（2026-09-14）

**没能在本机复现进程退出。** 复现脚本按档位试过：空闲 agent、打开中的当前会话、mid-turn 的会话、disposer 立即拒绝、detach 之后才拒绝、慢 disposer、以及并发两次关闭全部。每一档 DSH 都活着。

这台机器没有模型凭证，起不了会真正跑起来的 agent——真实 agent 的 `whenIdle()` / `scope.dispose()` / `handle.close()` 三条会抛的路径，在没有模型的情况下一条都到不了。为了不把「没复现」当成「不存在」，fixture 里用真实的 `agentLoop.lifecycle` effect 标签和真实的 cordis 机制注册了假 agent，由 `mode` 决定 disposer 怎么失败，把形状补齐了；但真实 agent 在途请求那一类仍然覆盖不到。

结论：**按结构修，并把诊断补上**，而不是等一个复现不出来的堆栈。

### 实际改动

1. **目标集改用 `ctx.agents.roots()`**（`AgentTeardown.runningSessionIds()`）。子代理不再进目标集。`roots()` 不可用时能力探针直接封锁这条能力，报 `agent-roots-unavailable`，而不是退化成拆全部。
2. **未捕获拒绝观测**（`host/rejection-watch.ts`）。关闭期间 `prependListener('unhandledRejection')`，在 DSH 自己的致命处理器接手之前先打一行日志，点名当时正在拆哪个会话。**它不阻止退出**——吞掉宿主的 fail-loud 语义是更坏的事——只是让下次真的发生时，堆栈自带主语。
3. **修掉一处误报**。effect 已经被消费、但 agent 仍在注册表里的情况，原先会报成 `TeardownShapeError`（宿主形状变了）。实际是上一次拆除跑过 disposer 但失败了。加 `spent` 集合区分两者，现在归咎于那次失败的拆除，而不是诬告宿主。

### 顺带修掉的退化

`ShutdownAll.tsx` 点了直接执行，**二次确认没了**——issue 10 的验收里写着「二次确认可取消」，在 `cb19979` 重做界面时丢掉的。见 issue 10 的 Comments。
