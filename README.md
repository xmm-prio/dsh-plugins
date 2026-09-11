# dsh-plugins

[DSH（DeepSeek Harness）](https://deepseek-harness.github.io/deepseek-harness/)的第三方插件库。本仓库不修改 DSH 本体，只以外置插件的形式为其扩展能力。

pnpm monorepo，`packages/` 下每个目录是一个可独立发布、独立安装的插件包。

## 插件

| 包 | 说明 |
| --- | --- |
| [`@dsh-plugins/session-archive`](packages/session-archive) | 归档区：批量归档、取消归档、删除会话日志 |

## 安装

**需要 DSH ≥ 0.1.5-rc.1**。更老的宿主上插件装得上但功能不正常——宿主的内部接口在那之前是另一套形状。查版本 `dsh --version`，升级 `npm i -g @deepseek-ai/dsh@latest`。

不需要 clone，也不需要改 `cordis.yml`，一条命令直接从 git 装进 profile：

```bash
dsh plugin --profile web add "github:xmm-prio/dsh-plugins#path:/packages/session-archive"
```

`--profile` 是必填项，`web` 换成你自己的 profile 名即可。引号照抄：钉分支或 commit 的写法（`#<ref>&path:/...`）里会出现 `&`，多数 shell 会把它当成命令分隔符。

升级到最新：

```bash
dsh plugin --profile web update "@dsh-plugins/session-archive"
```

这里用**包名**，不是安装时那个 git 地址。装的时候没钉 ref，`update` 就重新拉分支最新的 commit；钉了的话得改用 `add` 换新 ref。**更新后要重启 DSH**——插件的宿主侧和浏览器侧都是启动时加载的，不重启看到的还是旧版本。

卸载：

```bash
dsh plugin --profile web remove @dsh-plugins/session-archive
```

各插件的安装细节见自己的 README。

## 开发

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

约定与开发流程见 [`AGENTS.md`](AGENTS.md)，领域术语见 [`CONTEXT.md`](CONTEXT.md)。
