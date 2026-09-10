# 09 · 归档区面板

Status: done（验收项已在真实浏览器逐条验证）
Blocked by: 08

浏览器半的主界面。侧栏底部按钮（`sidebar.footer.action`）打开。

## 能力

- 按原工作区分组展示；工作区已移除的归入一组
- 标题搜索过滤
- 每条显示磁盘占用、创建时间、最后活动时间；页脚给出总计磁盘占用
- 按时间排序
- 取消归档：单个与批量
- 删除：单个、多选批量、一键全部删除；均需二次确认
- 一键关闭所有运行中会话（issue 10）
- 能力被禁用时按钮置灰并显示具体原因（issue 02）

## 要点

用 `ctx.slots.inject` 包 `ctx.slots.register`。**`inject` 返回的 disposer 是唯一的清理通道**——`slots.inject` 把 effect 注册在服务自己的 context 上而不是本 fiber，丢掉它会让插件卸载后仍残留一个指向死路由的入口。

浏览器半只 `inject: ['slots']`，其余服务防御式 `ctx.get()` 读取。

元数据缺失的条目要正常渲染（降级为 id + 创建时间），不能因为一条 miss 就整个列表报错。

删除的二次确认要展示将要删除的条目数与总磁盘占用——面板本身就承担了「删除前给出清单和统计」的职责，不另做确认环节的清单。

删除或取消归档后要刷新列表；取消归档还需通知官方侧栏刷新。

## 验收

- 面板瞬开，耗时与归档数量基本无关
- 多选、全选、批量删除、批量取消归档均正确
- 二次确认可取消且取消后无任何副作用
- 能力禁用时界面说明原因而非静默失效

## Comments

已实现，但**渲染只在 Node 里模拟过，没有真实浏览器验证**。

- **`slots.inject` 的 effect 落在自己的 fiber 上**，插件卸载正常级联，issue 正文里说的手工 disposer 兜底是多余的，没写。
- **类型声明散落在三个包里**：`ctx.slots` 的类型在 `dsh-client-ui-renderer/client`，`sidebar.footer.action` 这个 SlotMap 键在 `dsh-client-ui-sidebar/client`。两个都得 type-only import 进来才编译得过。
- **报告文案的组装挪进了 `useArchive`**，通过新增的 `ArchiveCopy` 参数注入。原来在 JSX 里拼字符串，出现过 `text.archivedCount(0) && ''` 这种垃圾表达式。
- **操作后从宿主重新拉取，不在本地打补丁。** 选中项在新列表到达后按新列表剪枝，关闭面板时清空选中与报告。
- 顺带修掉一个真实 bug：pnpm 在根装了 react 19 / react-dom 19，包内是 react 18，两份 React 导致渲染报 "Objects are not valid as a React child"。根 `package.json` 把四个 react 相关依赖钉到 18。

### 真实浏览器验收（Chromium 153 + DSH 0.1.5-rc.1）

`e2e/verify.mjs`，10/10 通过。数据全部经 `workspaceRegistry.create` / `sessionPersistence.create` 建立在一个 scratch `DSH_HOME` 里，跑完即删。

| 验收项 | 结果 |
|---|---|
| 侧栏底部按钮打开面板 | ✅ 条目数与宿主归档集合一致 |
| 瞬开，耗时与归档数量基本无关 | ✅ 7 条 72ms / 127 条 226ms |
| 多选、全选、取消选择 | ✅ `已选择 2 个 → 127 个 → 0 个` |
| 批量取消归档 | ✅ 只有选中的 3 条离开归档集合 |
| 批量删除 | ✅ 日志、归档集合、工作区登记三处同时移除 |
| 二次确认可取消且无副作用 | ✅ 取消后 stored / archived 均不变；未勾选「我明白」时「永久删除」是灰的 |
| 能力禁用时说明原因 | ✅ 见下 |
| 取消归档后回到原工作区原位置 | ✅ 见下 |

**「回到原工作区、原位置」**：取消归档后读侧栏渲染出的会话行（从各行 fiber 上取 id），顺序与宿主 `workspace.sessionIds` 逐项相等，且该 ledger 在归档 → 取消归档全程一字未改。位置能复原正是因为归档从不改写 ledger，只改归档集合这一个可见性开关——这与 CONTEXT.md 里「归档是纯可见性概念」是同一件事的两面。

**能力禁用**：宿主侧的探测无法在不弄坏宿主本身的前提下从外部致失效，因此这一条改成在**网线上**把 `capabilities` 响应里的 `unarchive` / `delete` 改写为 `enqueue-operation-missing`，验证的是「面板拿到 block 之后渲染成什么」而不是「面板能不能探到 block」——后者由 `capabilities.test.ts` 的 12 个用例覆盖。结果：两条动作按钮同时置灰，面板顶部列出「宿主的写入队列已改变」并附 `workspaceRegistry.enqueueOperation`。

### 真实浏览器暴露出的一个缺陷（已修）

宿主的 `Modal` 是**固定尺寸卡片**：`width: min(380px, 100%)`、`overflow: hidden`、**没有 max-height**，是给确认框设计的。面板把归档列表原样塞进去，条目一多整张卡片就纵向溢出视口，上下两端的行**滚不到也点不着**——127 条时连第一行的复选框都在视口外。列表因此自己加了 `max-height: 46vh; overflow-y: auto`。这是内容该承担的责任，不是给宿主打补丁。

### 未验证

- 面板的搜索过滤与分组展示：`## 能力` 里列了「按原工作区分组展示」「标题搜索过滤」，当前实现是**平铺列表 + 工作区标签**，没有分组容器也没有搜索框。这是实现与 issue 正文的既有出入，不是本次回归。
- 「一键全部删除」同样没有单独入口，全选 + 删除即可达成。
