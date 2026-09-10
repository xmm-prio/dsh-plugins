# dsh-plugins

DeepSeek Harness（DSH）的第三方插件库。本仓库不修改 DSH 本体，只以外置插件的形式为其扩展能力，一个仓库承载多个相互独立的插件。

## 宿主框架

DSH 是基于 [Cordis](https://github.com/cordiverse/cordis) 的插件化 Agent Harness，核心约定是「一切皆插件」：模型适配器、工具注册表、会话日志、agent 主循环本身都是插件。开发时需要遵循宿主的这几条契约：

- **插件形态**：导出 `apply(ctx, config)` 的函数，或继承 `Service` 的类（后者用于向其他插件提供服务）。可选导出 `name`、`inject`、`Config`。
- **依赖注入**：通过 `inject` 声明所需服务（如 `tools`、`llm`、`sessions`），由框架保证服务就绪后再执行 `apply`，不手工控制加载顺序。
- **可逆副作用**：一切注册（事件监听、工具、定时器）都挂在 `ctx` 上，卸载时自动清理；需要手工释放的资源（连接、句柄）用 `ctx.effect()` 托管。
- **配置**：导出 Schemastery schema 作为 `Config`，由框架校验并填充默认值。不硬编码任何随部署变化的参数——判据是「能否只改 `cordis.yml` 而不改代码」。
- **通信**：拦截与策略走事件（`emit` / `waterfall` / `parallel` / `serial`），直接调用能力走服务方法。

参考文档：<https://deepseek-harness.github.io/deepseek-harness/develop/basic/>

## 插件范围

不预设范围，凡 DSH 的扩展点均可覆盖：

- Tool 插件：向 `ctx.tools` 注册模型可见的工具
- 事件钩子：在 agent 循环与工具管线的事件上做拦截与改写
- LLM 适配器：接入不同模型提供方
- Service 插件：会话、持久化、后台任务、子代理等长生命周期能力

## 仓库结构

pnpm monorepo，每个插件是 `packages/` 下的一个独立 npm 包，可单独发布、单独被 `dsh plugin add` 安装。

```text
/
├── packages/
│   └── <plugin-name>/
│       ├── src/
│       ├── package.json
│       └── cordis.yml   # 本地调试用的 overlay
├── docs/
└── AGENTS.md
```

包内需在 `package.json` 声明 `dsh` 字段以便进入 bundle 层。本地调试用 `dsh --patch <overlay.yml>` 挂载，overlay 中的插件路径必须为绝对路径。

## Agent skills

### Issue tracker

Issue 与规格存放在仓库内的 `.scratch/`。详见 `docs/agents/issue-tracker.md`。

### Domain docs

使用单上下文布局。详见 `docs/agents/domain.md`。
