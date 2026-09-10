# dsh-plugins

[DSH（DeepSeek Harness）](https://deepseek-harness.github.io/deepseek-harness/)的第三方插件库。本仓库不修改 DSH 本体，只以外置插件的形式为其扩展能力。

pnpm monorepo，`packages/` 下每个目录是一个可独立发布、独立安装的插件包。

## 插件

| 包 | 说明 |
| --- | --- |
| [`@dsh-plugins/session-archive`](packages/session-archive) | 归档区：批量归档、取消归档、删除会话日志 |

## 开发

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

约定与开发流程见 [`AGENTS.md`](AGENTS.md)，领域术语见 [`CONTEXT.md`](CONTEXT.md)。
