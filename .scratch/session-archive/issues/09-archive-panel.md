# 09 · 归档区面板

Status: done（渲染未经真实浏览器验证）
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
- **验证边界**：Node 里 stub `__ModuleLoader__` 与 primitives，用 `react-dom/server` 渲染，确认 factory body 执行、三个种子 require 解析、`slots.register` 收到正确的 options、产出 `<button>归档区</button>`。活体上确认 bundle 有 boot graph 行、能被下载、banner id 是完整包名。**但真实浏览器里的交互（点击、Modal 开合、刷新后状态）没有验证过**——这台机器没有浏览器。
- 顺带修掉一个真实 bug：pnpm 在根装了 react 19 / react-dom 19，包内是 react 18，两份 React 导致渲染报 "Objects are not valid as a React child"。根 `package.json` 把四个 react 相关依赖钉到 18。
