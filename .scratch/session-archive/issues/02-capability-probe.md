# 02 · 宿主能力探测

Status: done
Blocked by: 01

本插件的几项核心能力建立在宿主的**非公开形状**之上。约定是：启动时探测，缺什么就禁用对应能力并向界面报告原因，**绝不用「方法存不存在」冒充行为兼容**，也绝不在运行到一半时才发现拿不到东西。

## 探测项

| 能力 | 依赖 | 缺失后果 |
|---|---|---|
| 取消归档 | `workspaceRegistry.enqueueOperation`（原型上的函数）、`workspaceRegistry.state`（实例属性，含 `archivedSessionIds`）、`storageDomain.get('workspace')` 返回带 `global.get/set` 的句柄 | 禁用取消归档 |
| 归档 | `workspaceRegistry.archiveSession` | 禁用全部归档 |
| 拆 agent | `ctx.registry.values()` 可枚举、`runtime.fibers`、`fiber._disposables` 可迭代、`Symbol.for('cordis.effect')` 标签可读 | 禁用关闭会话与删除 |
| 删除 | 上一项，加上 `sessionPersistence.name === 'session-persistence-jsonl'` 且其上存在 public 的 `resolveCurrentLog` | 禁用删除 |
| 元数据 | `sessionProjectionCache`、`sessionPersistence.list()` 快照带 `sizeBytes` | 降级显示 |

## 要点

探测只做**形状检查**，不做副作用调用。`enqueueOperation` 不能试跑，`open(id,'write')` 探针属于删除流程的一部分而非启动探测。

能力清单作为一个端点暴露给浏览器半，面板据此禁用按钮并显示原因文案。原因文案要具体到「宿主 X 不可用」，不要笼统的「不支持」。

TypeScript 的 `private` 是编译期擦除，运行期属性真实存在；但要确认不是 `#private` 字段（那种从外部完全不可达）。

## 验收

- 启动日志给出一份能力清单
- 人为破坏任一依赖形状后，对应能力被禁用且界面给出具体原因，插件其余部分照常工作
- 全部形状齐备时，所有能力可用

## Comments

已完成，`src/host/capabilities.ts` 是一个纯函数，全部形状从参数进来，单测直接喂坏形状。

- **整个探测包在一层 try/catch 里**，任何一个 surface 抛异常时整体退化为 `allBlocked('probe-failed', message)`。这不是防御性编程的口味问题：`apply` 里逸出的异常会打死整个宿主进程，而探测的工作恰恰就是去戳可能不存在的形状。
- **依赖方向按 issue 02 的更正实现**：硬依赖 `connection`、`workspaceRegistry`、`sessionPersistence` 走 `inject` + 属性访问；软依赖 `storageDomain`、`sessionProjectionCache`、`agents` 走 `ctx.get(name)?.`。spec 里「不能用 `ctx.get`」的说法方向是反的。
- **能力之间有级联**：取消归档依赖归档；删除依赖停机**和**取消归档（删除的最后一步要把 id 移出归档集合）。级联在探测里表达一次，服务层不再重复判断。
- 活体确认：真实 0.1.5-rc.1 上五项能力全部 `available`，`persistenceBackend: "session-persistence-jsonl"`。也就是说私有写入路径、storage domain、fiber 扫描、JSONL 定位、投影缓存在真机上都在。
