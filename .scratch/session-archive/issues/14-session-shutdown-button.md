# 14 · 按会话关闭 agent，入口在会话标题栏

Status: done
Blocked by: 13

只能「一把梭全关」是不够的。用户要的是关掉**某一个**会话的 agent，入口放在那个会话自己的顶部。

## 要点

拆除单个会话的能力早就有了——`AgentTeardown.teardown(sessionId)`，issue 05 就写好了，删除流程一直在用。缺的只是端点和入口。

会话标题栏有官方公开扩展点 `conversation.session.header.utilities`（`kind: 'list'`，`scope: 'session'`），第一方 `dsh-client-ui-schedule` 就是这么用的。组件从标准 props 直接拿到自己的 `sessionId`，**不需要任何 DOM 改写**——和侧栏行内按钮那条路完全不同。

归档区那个按钮按语义排除了当前会话（它管的是后台占用），所以当前会话只能从这里关。两个入口正好互补，没有重叠。

## 验收

- 会话有 agent 时标题栏出现按钮，没有时不出现
- 二次确认，可取消
- 确认后只关这一个会话，其余不受影响
- 关掉当前会话之后 DSH 仍存活

## Comments

### contract 改造

`shutdownAll` 退役，拆成两个端点：

```ts
running:  { request: {};                 response: RunningSessionsResult }
shutdown: { request: { ids: string[] };  response: BatchResult }
```

`shutdown(ids)` 是唯一的通用原语。「关闭全部」不再是一个端点，而是调用方的策略：先 `running()` 拿到具体名单，再 `shutdown(那批 id)`。这样二次确认能报出**具体要关哪几个**，而不是一个没人核对过的数字。

### 可见性判据：不能用会话列表的 `running` 位

第一版把按钮 gate 在 `SessionSummary.running` 上，**错的**。那个位是「有一轮对话在进行中」，而不是「有 agent」。空闲的 agent 照样占着模型客户端、工具与日志租约，那正是需要关的情形——按这个位 gate，按钮会恰好在用户需要它的时候消失。

只有宿主知道 agent 的存在，`running()` 就是它说这件事的地方。`useRunningAgent` 因此去问宿主，并在 agent 数量可能变化的边沿重新问：会话切换、turn 的两个边沿（`running` 位在这里退化成一个**触发器**，不再是判据）、以及自己刚关掉东西之后。探测失败不清空按钮——连接抖一下就让按钮消失，读起来像是 agent 停了，这是唯一不能暗示的事。

### 两个确认框都叫「关闭」的问题

Modal 自带的关闭按钮 `aria-label` 就是「关闭」，确认按钮原本也叫「关闭」，同一个对话框里两个同名控件、含义相反。确认按钮改成**「确认关闭」**。

### e2e 里的一个坑

DSH 把空白会话渲染成 new-session hero：只有输入框，**没有标题栏**，也就没有 utilities 槽位可占。e2e 一开始拿刚启动时那个空白会话去找按钮，永远找不到。测试里先给当前会话发一句话（本机没有模型，这一轮会失败，但日志不空了、agent 也 resume 出来了），标题栏才存在。

这不是缺陷：空白会话本来也没有 agent 值得关。
