# DSH 本地开发/验证环境

本文记录在本机（Windows 10.0.20348 / PowerShell / node v24.18.0 / pnpm 11.15.1）上把 `@deepseek-ai/dsh@0.1.5-rc.1` 装起来、跑起来、并用 `--patch` 挂载一个「宿主半 + 浏览器半」双半第三方插件的完整过程。所有命令、路径、文件内容与报错均为实机原文。

所有结论都在 `0.1.5-rc.1` 上实跑验证过。与 `spec.md` / `host-internals.md` 冲突之处已在 §7 单独列出——**那一节是本文最重要的部分**，其中一条会直接影响 `session-archive` 的传输层选型。

---

## 0. 结论速览

| 项 | 结果 |
| --- | --- |
| DSH 是否能启动 | **能**。不需要任何 API key，无凭据也能完整 boot |
| Web UI 是否可用 | **能**。`http://127.0.0.1:3080/?token=<token>`，返回 200 与完整 index.html |
| 双半插件能否用 `--patch` 从绝对路径加载 | **能**。宿主半 `apply` 执行、HTTP 路由生效；浏览器半进入 boot graph 并由 `/plugins` 正常投递 |
| `ctx.connection.rpc.handle()` | **不可用**，本版本有 bug，调用方无法绕过。见 §7.1 |
| Symbol 分裂 | 默认安装**未发生**；但 `dsh plugin add` 一个依赖 `@deepseek-ai/*` 的包**会**触发。见 §9 |

关键路径：

```text
全局安装      C:\Users\Administrator\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh
CLI 入口      C:\Users\Administrator\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js
DSH_HOME      C:\Users\Administrator\.dsh
web profile   C:\Users\Administrator\.dsh\profiles\web
一次性插件    C:\Users\Administrator\dsh-dev\hello-plugin
overlay       C:\Users\Administrator\dsh-dev\hello.overlay.yml
```

---

## 1. 安装

全局安装即可，Windows 上没有遇到任何问题：

```powershell
npm i -g @deepseek-ai/dsh@0.1.5-rc.1
```

输出：

```text
npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead

added 517 packages in 30s

62 packages are looking for funding
  run `npm fund` for details

npm warn allow-scripts 5 packages have install scripts not yet covered by allowScripts:
npm warn allow-scripts   @deepseek-ai/dsh-subprocess-local@0.1.5-rc.1 (postinstall: node scripts/ensure-spawn-helper.mjs)
npm warn allow-scripts   koffi@3.2.1 (install: node ./cnoke.cjs -P . -D src/koffi --prebuild --release)
npm warn allow-scripts   node-pty@1.2.0-beta.15 (install: node scripts/prebuild.js || node-gyp rebuild; postinstall: node scripts/post-install.js)
npm warn allow-scripts   @google/genai@1.52.0 (preinstall: echo 'preinstall: no-op')
npm warn allow-scripts   protobufjs@7.6.6 (postinstall: node scripts/postinstall)
npm warn allow-scripts
npm warn allow-scripts Run `npm approve-scripts --allow-scripts-pending` to review, or `npm approve-scripts <pkg>` to allow.
```

**这 5 个被拦下的安装脚本没有阻碍任何事情**：Web profile 完整启动，`node-pty`（PTY 终端）与 `koffi` 的原生部分在本次验证的路径上没有被触及。如果后续要验证终端类工具，再执行 `npm approve-scripts <pkg>` 补跑即可。

`dsh` 命令随即可用（npm 生成的是 shim，实际执行 `node .../dsh/lib/bin.js`）：

```powershell
Get-Command dsh
# C:\Users\Administrator\AppData\Roaming\npm\dsh.ps1
```

> **背景运行的坑**：用 `Start-Process` 把 `dsh` 放后台时不要指向 `dsh.ps1`，直接调用
> `node C:\Users\Administrator\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js ...`，
> 这样 `-RedirectStandardOutput` 才拿得到 URL 那一行。

---

## 2. CLI 形状

`dsh --help` 原文：

```text
Usage: dsh [options] [command] [args...]

dsh: boot a DeepSeek Harness profile — an ordered stack of plugin-bundle patch
layers under your own overrides.

Arguments:
  args                           arguments for the booted profile's app (see:
                                 dsh --profile <name> --help)

Options:
  -V, --version                  output the version number
  --profile <name>               the profile under $DSH_HOME/profiles to boot
  --from-default-profile <name>  initialize a new custom profile from a shipped
                                 profile template
  --patch <path>                 extra patch-list overlay applied after the
                                 profile layer (repeatable)
  --dump-config                  print the composed profile tree and exit
  --dump-default-config          print the profile tree without its user layer
                                 or --patch overlays and exit

Commands:
  web [options] [args...]        boot the web profile (alias of --profile web);
                                 the web app's own flags follow
  plugin [options] [args...]     manage a profile's plugins by forwarding the
                                 remaining arguments to pnpm in the profile
                                 directory
```

`dsh web --help`（Web 应用自己的 flag）：

```text
Usage: dsh --profile web [options]

Serve the DeepSeek Harness browser UI.

Options:
  --host <host>                  bind host
  --no-open                      do not open the Web UI in the default browser
  --port <port>                  listen port; pass 0 to let the OS pick a free
                                 one
  --trusted-host <authority...>  extra authority the /api browser-trust fence
                                 accepts (host or host:port; repeatable)
  -h, --help                     show this help
```

### 启动器 flag 与应用 flag 是两层，位置不能混

`--profile` / `--patch` / `--dump-config` 属于**启动器**；`--no-open` / `--port` / `--host` / `--trusted-host` 属于 **web 应用**。`dsh web ...` 这个子命令形式会把 `web` 之后的参数整体交给应用解析，因此 `--patch` 放在 `web` 后面会被应用拒绝（详见 §7.2）。

可用形式：

```powershell
dsh web --no-open --port 3080                                  # 无 overlay 时可以
dsh --profile web --patch <overlay> --no-open --port 3080      # 有 overlay 时必须用这个
```

---

## 3. 初始化、DSH_HOME 与 profile 机制

**不需要显式 init**。任何一次会读取 profile 的命令都会把 profile 物化出来。本次是用只读的 dump 命令触发的：

```powershell
dsh --profile web --dump-default-config
```

执行后目录出现：

```text
C:\Users\Administrator\.dsh\
├── .anonymous-user-id
├── .credentials.yaml          # 首次 boot 后出现
├── storages\                  # 首次 boot 后出现
└── profiles\
    ├── node_modules\          # 共享 junction 农场，指向全局安装（见 §9）
    └── web\
        ├── package.json           # profile manifest：dsh.profile.bundles
        ├── cordis.yml             # 永远是空数组，不要改
        ├── cordis.patch.yml       # 你自己的 patch 层
        ├── pnpm-workspace.yaml
        ├── node_modules\          # dsh plugin add 装的树外插件
        └── .dsh-module-fallback\
```

`profiles/web/package.json`（原文）：

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {},
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app"
      ],
      "patchReload": "live"
    }
  }
}
```

`profiles/web/cordis.yml`（原文，**profile 根永远是空的**）：

```yaml
# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
```

`profiles/web/cordis.patch.yml`（原文）：

```yaml
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).
[]
```

`profiles/web/pnpm-workspace.yaml`（原文，注意 `nodeLinker: hoisted`，§9 的成因）：

```yaml
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
```

### 层序

生效配置在空根之上按顺序叠加，**后面的层按行覆盖前面的层，且 `config` 是整体替换而不是深合并**：

1. `dsh.profile.bundles` 里每个 bundle 的 `cordis.patch.yml`（先 `dsh-base`，再 `dsh-web-app`，再你 add 的）
2. profile 自己的 `cordis.patch.yml`
3. `$DSH_HOME/cordis.patch.yml`（跨 profile 的机器本地偏好，本机默认不存在，需要时自己建）
4. 每个 `--patch <overlay>`，按 argv 顺序

查看合成结果：

```powershell
dsh --profile web --dump-config           # 含 user 层与 --patch
dsh --profile web --dump-default-config   # 只有 bundle 层
```

输出里每层前面有 `# == <来源>` 注释，非常适合确认你的 overlay 到底进没进去。web profile 合成后共 539 行。与 Web UI 相关的关键行（原文）：

```yaml
- id: webserver
  name: '@deepseek-ai/dsh-host-webserver'
  inject:
    - webStartup
  config:
    host: !!js ctx.webStartup.host ?? '127.0.0.1'
    port: !!js ctx.webStartup.port ?? 3080
    compression: gzip
    compressionLevel: 1
    compressionThresholdBytes: 1024
- id: web-runtime
  name: '@deepseek-ai/dsh-web-app'
  inject:
    - webStartup
  config:
    openBrowser: !!js ctx.webStartup.openBrowser
    printUrl: true
    surfaceContext: true
    trustedHosts: !!js ctx.webStartup.trustedHosts
- id: client-hmr
  name: '@deepseek-ai/dsh-client-hmr'
- id: modules
  name: '@deepseek-ai/dsh-client-modules'
- id: connection
  name: '@deepseek-ai/dsh-client-connection'
  inject:
    - webRuntime
  config:
    trustedHosts: !!js ctx.webRuntime.trustedHosts
```

### 新建自定义 profile

不想污染 `web` 就从模板派生一个（`session-archive` 开发建议这么做）：

```powershell
dsh --profile dev --from-default-profile web
```

---

## 4. 启动与 Web UI

### 不需要 API key

DSH 是 DeepSeek 的模型 harness，但**没有凭据一样能完整 boot**：LLM 适配器插件照常加载，只是真正发消息时才会失败。整个验证过程没有配置过任何 key，也没有出现任何 credential 相关的启动阻断。`~/.dsh/.credentials.yaml` 由 `credentials-local` 自动创建，内容为空也不影响。

### 启动

```powershell
dsh web --no-open --port 3080
```

stdout 只有一行：

```text
dsh web: http://127.0.0.1:3080/?token=t-9baNALief0QKp42_rih55JPaCQTRm7Yn1N2YKQomE
```

冷启动约 25–30 秒（首次要解析全部 bundle 层）。

- 服务端：`@deepseek-ai/dsh-host-webserver`（`ctx.webServer`，`node:http`），默认 `127.0.0.1:3080`
- SPA 静态资源：`@deepseek-ai/dsh-host-frontend-static` 认领 fallback 席位
- 插件 bundle 路由：`@deepseek-ai/dsh-client-modules` 提供 `/plugins/...`
- 鉴权与 Host/Origin 围栏：`@deepseek-ai/dsh-client-connection`

### 鉴权模型：进程 token 换 Cookie

**token 每次启动重新生成，只能从 stdout 那一行拿到**，没有其它获取渠道。开发者要手动开 UI，就把整行 URL 复制进浏览器。

实测三种情况：

```powershell
# 1) 无 token 无 cookie
Invoke-WebRequest -Uri "http://127.0.0.1:3080/" -UseBasicParsing
# → 401，body: dsh web authentication required; reopen the URL printed by dsh web.

# 2) 带 token：200，并下发 HttpOnly cookie
$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest -Uri "http://127.0.0.1:3080/?token=$tok" -UseBasicParsing -WebSession $sess
# → 200，len=27660

# 3) 之后凭 cookie 直接访问
Invoke-WebRequest -Uri "http://127.0.0.1:3080/" -UseBasicParsing -WebSession $sess
# → 200
```

下发的 Cookie：

```text
Name     : dsh-auth-VPhEEcLKeqRDBoBalzN2Nm7CnfxKhLE00pKIDWxt1sw
Value    : v1.eyJ2ZXJzaW9uIjoxLCJhdXRob3JpdHkiOiIxMjcuMC4wLjE6MzA4MCIsImlzc3VlZEF0IjoxNzg5MDMxMTI2NTk2LCJleHBpcmVzQXQiOjE3OTE2MjMxMjY1OTZ9.-veiOFU1_513MUykSs2JQZHVpFCOiYIyuAQXJ7EWoK0
Path     : /
HttpOnly : True
```

中段 base64 解出来是：

```json
{"version":1,"authority":"127.0.0.1:3080","issuedAt":1789031126596,"expiresAt":1791623126596}
```

有效期 30 天，**authority 被写死在 cookie 里**——这就是为什么换 Host 头访问会 401。

### Host/Origin 围栏（`/api`）

```powershell
# 坏 Origin
POST /api/... + Origin: http://evil.example        → 403，body: forbidden
# 好 Origin 或不带 Origin（非浏览器）
POST /api/... + Origin: http://127.0.0.1:3080      → 通过围栏
# 伪造 Host 头
GET / + Host: evil.example                          → 401
```

要让别的 authority 通过围栏，用 `--trusted-host <host:port>`（可重复）。

curl / Invoke-WebRequest 验证 `/api` 路由时**必须同时给 cookie 和 `Origin: http://127.0.0.1:3080`**，否则拿到的是 401/403 而不是你的 handler。

---

## 5. `--patch` overlay：语义与格式

### 是什么

overlay 是一个**顶层为 YAML 数组**的 patch 层，在所有 bundle 层与 profile 的 `cordis.patch.yml` 之后应用。它只贡献配置，不改变 loader 解析模块路径时使用的 profile 目录。可重复传 `--patch`，按 argv 顺序叠加。

### 最小可用 overlay（本次实际使用的文件）

`C:\Users\Administrator\dsh-dev\hello.overlay.yml`：

```yaml
- insert:
    - id: hello
      name: 'C:/Users/Administrator/dsh-dev/hello-plugin/lib/index.js'
```

`dsh --profile web --patch <该文件> --dump-config` 的对应片段：

```yaml
# == C:\Users\Administrator\dsh-dev\hello.overlay.yml
- id: hello
  name: file:///C:/Users/Administrator/dsh-dev/hello-plugin/lib/index.js
```

Windows 下**用正斜杠**写路径。反斜杠在 YAML 单引号里虽然不转义，但正斜杠是被明确验证过的形式。

### 路径不必是绝对路径（订正官方文档）

官方教程写「插件路径必须是绝对路径」。实测**三种形式都可以**，判据是开头：

| 写法 | 结果 |
| --- | --- |
| `'C:/.../lib/index.js'` | 绝对路径，规范化为 `file:///C:/.../lib/index.js` |
| `'./hello-plugin/lib/index.js'` | 相对**overlay 文件所在目录**解析，与当前工作目录无关 |
| `'../x/lib/index.js'` | 同上 |
| `'hello-plugin/lib/index.js'` | **不当路径处理**，原样保留，按包名从 profile 目录解析 |

相对路径的验证方式是把 cwd 切到 `C:\` 再 dump，结果仍解析到 overlay 所在目录：

```powershell
cd C:\
dsh --profile web --patch "$env:USERPROFILE\dsh-dev\rel.overlay.yml" --dump-config
# > - id: hello-rel
#     name: file:///C:/Users/Administrator/dsh-dev/hello-plugin/lib/index.js
```

**给 `session-archive` 的建议：仍然用绝对路径。** 相对路径可用，但 overlay 可能被从不同位置引用，绝对路径没有歧义。

### 其它 patch 条目形态

除了 `insert`，patch 数组的条目还可以按 `id` 覆盖既有行的 `config`、把行 `disabled: true`，并支持 `!!js` 表达式（求值上下文是该行 `inject` 进来的服务）。注意**覆盖 `config` 是整体替换**，必须重述该行需要的每一个键。

---

## 6. `dsh plugin add` 与 bundle 层

`dsh plugin --profile <name> <pnpm 子命令...>` 就是在 profile 目录里转发给 pnpm，然后由 `dsh` 维护 `dsh.profile.bundles`。

```powershell
dsh plugin --profile web add C:\Users\Administrator\dsh-dev\hello-plugin
```

输出：

```text
dependencies:
+ dsh-hello-plugin link:C:/Users/Administrator/dsh-dev/hello-plugin

Already up to date
Done in 581ms using pnpm v11.15.1
```

profile 的 `package.json` 被改成：

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-hello-plugin": "link:C:/Users/Administrator/dsh-dev/hello-plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-hello-plugin"
      ],
      "patchReload": "live"
    }
  }
}
```

`dump-config` 里多出一层：

```yaml
# == dsh-hello-plugin
- id: hello
  name: dsh-hello-plugin
```

包被追加进 `bundles` 的条件是它的 `package.json` 声明了 `dsh.bundle.patch`。没声明的话只作为普通依赖装上，并打印：

```text
dsh: warning: @deepseek-ai/dsh-client-ui-primitives declares no dsh.bundle — installed as a plain dependency, not a profile layer (a later update that gains one activates it automatically)
```

移除：

```powershell
dsh plugin --profile web remove dsh-hello-plugin
```

**两条加载路径都实测通过**：`--patch` 绝对路径，和 `dsh plugin add` + `dsh.bundle.patch`。开发期用前者（改完重启即可，不动 profile），交付后用后者。

---

## 7. 双半插件：`package.json` 契约与浏览器半的投递

### `dsh` 字段的三个部分

```json
{
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-locale"] }
  }
}
```

- `dsh.bundle.patch` —— 被 `dsh plugin add` 追加为 profile 层时应用的 patch 文件。走 `--patch` 时用不到。
- `dsh.client.platform: "web"` —— **这是浏览器半被发现的唯一开关**。
- `dsh.client.inject` —— 填**包名**（不是服务名），决定 factory 到达顺序。
- `dsh.client.external` —— 允许 `require()` 的额外 specifier。
- 浏览器半的产物必须由 `exports["./client"]` 导出。

对照第一方 `@deepseek-ai/dsh-client-ui-jobs/package.json`（原文节选）：

```json
"exports": {
  ".":        { "types": "./lib/types/index.d.ts",        "default": "./lib/index.js" },
  "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
},
"dsh": {
  "client": {
    "inject": [
      "@deepseek-ai/dsh-client-locale",
      "@deepseek-ai/dsh-client-ui-conversation",
      "@deepseek-ai/dsh-client-ui-primitives"
    ],
    "platform": "web"
  }
}
```

### 浏览器半怎么到浏览器（实测链路）

1. `dsh-client-modules` 扫描 Loader 的每个 entry，从**最近的 package.json** 找 `dsh.client`。走 `--patch` 指向 `.../hello-plugin/lib/index.js` 时，它找到的就是 `.../hello-plugin/package.json`——**所以宿主半的 loader 行和浏览器半是靠同一个包目录关联起来的，浏览器半不需要在 overlay 里单独写一行**。
2. 组合出 `window.__DSH_BOOT__` 图，注入 index.html。本插件的行：

   ```json
   {"id":"dsh-hello-plugin","url":"/plugins/??dsh-hello-plugin/client.js&rev=7f1847f48914743f-44","rev":"7f1847f48914743f-44"}
   ```
3. 该 entry 同时被拼进 application 预加载的 combo 脚本（一条 `<link rel="preload" as="script" href="/plugins/??...,dsh-hello-plugin/client.js,...&rev=...">`）。
4. 浏览器执行 bundle，bundle 调 `window.__ModuleLoader__.load({ id, factory })` 注册工厂；Cordis 再按 `inject` 就绪后调 `apply(ctx)`。

单资源 URL 可直接 GET 验证（带 cookie）：

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:3080/plugins/??dsh-hello-plugin/client.js&rev=7f1847f48914743f-44" -WebSession $sess
# → 200，返回的就是磁盘上 lib/client.js 的原字节
```

### 浏览器半的字节形状：不是 ESM

这是手写浏览器半时最容易翻车的地方。产物必须是 `__ModuleLoader__` 闭包握手，**`id` 必须等于完整包名**：

```js
window.__ModuleLoader__.load({
	id: "dsh-hello-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		const inject = ["slots"];
		function apply(ctx) { /* ... */ }

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
```

`require()` 无条件认的静态种子只有九个：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`。其余都要在 `dsh.client.external` 里声明且对方在 boot graph 里有行。

注意 `inject`（模块导出的）填的是**服务名**，`dsh.client.inject`（package.json 的）填的是**包名**，两者不是一回事。

### 客户端服务名清单（实测）

从各包 `lib/client.js` 里 `super(ctx, "...")` 扫出来的浏览器侧服务键：

```text
commandUi  conversation  fileUpload  inputTriggers  modelDirectories  remote
settingsSchema  settingsScope  slots  timer  typert  uiConversation
uiSession  uiWorkspace  workspaces        （另有 connection）
```

**`inject` 里写错服务名不会报错，插件只是永远等不到依赖、静默不激活。** 手写时务必对照此表。

### 侧栏底部按钮的 slot

`sidebar.footer.action` 由 `@deepseek-ai/dsh-client-ui-sidebar` 声明，实测形状：

```js
"sidebar.footer.action": { kind: "list", scope: "root" }
```

owner 传入的 props 是 `{ wide }`。`@deepseek-ai/dsh-client-ui-cordis` 是现成的参照实现，它的注册写法：

```js
ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "cordis-panel",
    locale: NS,
    inject: () => ({ hooks: { /* ... */ } }),
}, CordisPanel));
```

---

## 8. 完整配方：从绝对路径加载一个双半插件

以下是本次实际跑通的全套文件，可直接照搬。

### 8.1 `C:\Users\Administrator\dsh-dev\hello-plugin\package.json`

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "files": ["lib/index.js", "lib/client.js", "cordis.patch.yml"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" }
  }
}
```

**不要给它加 `@deepseek-ai/*` 的 `dependencies`**，理由见 §9。内部包一律 `peerDependencies` + `devDependencies`。

### 8.2 `hello-plugin\lib\index.js`（宿主半）

```js
export const name = 'hello-plugin'

export const inject = ['connection']

export function apply(ctx) {
  console.log('[hello-plugin] host half loaded')

  // 纯 JSON：浏览器侧用同源 fetch() 调
  ctx.connection.fetch.register({
    path: '/api/hello',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async () => Response.json({ greeting: 'hello from the host half' }),
  })

  // 信封兼容：可被 ctx.connection.rpc.call('/api', 'hello-rpc', payload) 调到
  ctx.connection.fetch.register({
    path: '/api/hello-rpc',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const message = await request.json()
      return Response.json({
        type: 'server-response',
        rpcId: message.rpcId,
        result: { ok: true, value: { greeting: 'hello over the rpc envelope', echo: message.payload } },
      })
    },
  })

  console.log('[hello-plugin] registered /api/hello and /api/hello-rpc')
}
```

### 8.3 `hello-plugin\lib\client.js`（浏览器半，手写握手）

```js
window.__ModuleLoader__.load({
	id: "dsh-hello-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		const inject = ["slots"];

		function apply(ctx) {
			console.log("[hello-plugin] browser half loaded");

			function HelloAction() {
				const [open, setOpen] = react.useState(false);
				const [answer, setAnswer] = react.useState("(not called yet)");

				const onClick = react.useCallback(() => {
					setOpen((value) => !value);
					void (async () => {
						try {
							const response = await fetch("/api/hello", { method: "GET" });
							setAnswer(response.status + " " + (await response.text()));
						} catch (error) {
							setAnswer("ERROR " + String(error));
						}
					})();
				}, []);

				return react.createElement(
					"div",
					{ "data-testid": "hello-plugin-root" },
					react.createElement("button", { type: "button", onClick }, "Hello plugin"),
					open ? react.createElement("pre", { "data-testid": "hello-plugin-panel" }, answer) : null,
				);
			}

			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "hello-plugin",
				order: 500,
			}, HelloAction));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
```

### 8.4 `C:\Users\Administrator\dsh-dev\hello.overlay.yml`

```yaml
- insert:
    - id: hello
      name: 'C:/Users/Administrator/dsh-dev/hello-plugin/lib/index.js'
```

### 8.5 启动与验证

```powershell
dsh --profile web --patch C:\Users\Administrator\dsh-dev\hello.overlay.yml --no-open --port 3080
```

stdout：

```text
[hello-plugin] host half loaded
[hello-plugin] registered /api/hello and /api/hello-rpc
dsh web: http://127.0.0.1:3080/?token=rfr2odahAD6sdXWjR7wCqdtV1Zgv75ONldO7o258qCw
```

验证脚本：

```powershell
$t = "<从上面那行复制>"
$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$r = Invoke-WebRequest -Uri "http://127.0.0.1:3080/?token=$t" -UseBasicParsing -WebSession $sess

# 浏览器半是否进了 boot graph
[regex]::Match($r.Content, '\{"id":"dsh-hello-plugin".*?\}').Value

# 宿主半的两个端点
Invoke-WebRequest -Uri "http://127.0.0.1:3080/api/hello" `
  -Headers @{Origin='http://127.0.0.1:3080'} -UseBasicParsing -WebSession $sess

$body = '{"type":"client-request","rpcId":"probe-1","method":"hello-rpc","payload":{"from":"powershell"}}'
Invoke-WebRequest -Uri "http://127.0.0.1:3080/api/hello-rpc" -Method POST -Body $body `
  -ContentType 'application/json' -Headers @{Origin='http://127.0.0.1:3080'} `
  -UseBasicParsing -WebSession $sess
```

实测结果：

```text
{"id":"dsh-hello-plugin","url":"/plugins/??dsh-hello-plugin/client.js&rev=7f1847f48914743f-44","rev":"7f1847f48914743f-44"}
200 {"greeting":"hello from the host half"}
200 {"type":"server-response","rpcId":"probe-1","result":{"ok":true,"value":{"greeting":"hello over the rpc envelope","echo":{"from":"powershell"}}}}
```

### 8.6 不开浏览器验证浏览器半

真浏览器不可得时，可以在 Node 里桩掉 `__ModuleLoader__` 把 bundle 跑一遍，验证 factory 体、`require` 用法和 `slots.register` 的调用形状。脚本留在 `C:\Users\Administrator\dsh-dev\simulate-client.mjs`：

```powershell
node C:\Users\Administrator\dsh-dev\simulate-client.mjs C:\Users\Administrator\dsh-dev\hello-plugin\lib\client.js
```

输出：

```text
entry id      : dsh-hello-plugin
exported inject: ["slots"]
[hello-plugin] browser half loaded
slots.inject -> sidebar.footer.action
slots.register -> {"name":"sidebar.footer.action","id":"hello-plugin","order":500}
component rendered -> div {"data-testid":"hello-plugin-root"}
registrations : 1
```

**这只覆盖工厂体与注册调用，不覆盖真实 React 渲染、slot 契约校验与 DOM 挂载。** 本次没有真浏览器，所以「按钮在侧栏底部实际画出来」这一步未验证；已验证到「bundle 被投递 + 工厂可执行 + 注册调用形状正确」为止。

---

## 9. 踩过的坑（按遇到顺序）

### 9.1 `ctx.connection.rpc.handle()` 在 0.1.5-rc.1 不可用 —— 最重要的一条

`spec.md` 的「通道」一节和 `host-internals.md` §8 都规定 `session-archive` 用
`ctx.connection.rpc.handle('/session-archive', handler)`。`host-internals.md` §8 是**静态读源码**得出的「属实」，本次**实跑发现它一定抛异常**。

报错（宿主半 `apply` 已经执行，随后整个 boot 被打死）：

```text
Error: dsh: plugin tree failed to load: failed to apply loader entry hello (file:///C:/Users/Administrator/dsh-dev/hello-plugin/lib/index.js): cannot get property "webServer" without inject
Error: cannot get property "webServer" without inject
    at Fiber.<anonymous> (.../dsh-client-connection/lib/index.js:618:35)
    at Proxy.register (.../dsh-client-connection/lib/index.js:618:16)
    at Object.apply (.../cordis/lib/index.js:120:36)
    at Object.handle (.../dsh-client-connection/lib/index.js:543:39)
    at new apply (file:///C:/Users/Administrator/dsh-dev/hello-plugin/lib/index.js:14:22)
```

成因在 `dsh-client-connection/lib/index.js`：

```js
get rpc() {
    const owner = this.ctx;                       // 注释说是「读取该服务的 Context」
    return {
        handle: (channel, handler) => this.register(owner, channel, handler),
        ...
    };
}
register(owner, channel, handler) {
    ...
    return owner.effect(() => owner.webServer.register(route), `client-connection: ${channel} rpc channel`);
}
```

同一文件里 connection 给自己注册 `/api` 时用的是**另一种写法**，即先用 `ctx.inject` 拿到带 `webServer` 的作用域：

```js
ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register(route), "client-connection: /api route");
});
```

`register()` 这条路径少了这一步，而它拿到的 `owner` 的 inject 集合里没有 `webServer`（connection 自己声明的是 `inject = ["credentials"]`）。

**四次实测证明调用方无法绕过：**

| 探针 | 写法 | 结果 |
| --- | --- | --- |
| A | `apply` 里直接 `typeof ctx.webServer`（已 `inject: ['connection','webServer']`） | `object`，**可访问** |
| B | `ctx.effect(() => typeof ctx.webServer)` | `object`，effect 不会丢 inject 集合 |
| F | `ctx.effect(() => ctx.webServer.register({kind:'prefix', path:'/hello2', ...}))` | **OK**，手搓等价物成功 |
| G | `ctx.connection.rpc.handle('/hello3', h)` | **抛** `cannot get property "webServer" without inject` |
| H | `ctx.get('connection').rpc.handle('/hello4', h)`（绕 Guard 读服务） | **同样抛** |

也就是说：把 `webServer` 加进 `inject`、包一层 `ctx.effect`、改用 `ctx.inject(['webServer'], ...)`、改用 `ctx.get('connection')`——**四种都救不回来**。这是上游 bug，不是用法问题。

另一个佐证：**全量扫描已安装的全部第一方包，没有任何一个调用 `rpc.handle`**，大家用的都是 `ctx.connection.fetch.register`。这条路径没被第一方走过，所以没人踩到。

#### 修法

改用 `ctx.connection.fetch.register`，`inject` 只需 `['connection']`：

```js
ctx.connection.fetch.register({
  path: '/api/session-archive-<endpoint>',   // 必须在 /api 之下
  methods: ['POST'],
  requestBody: 'buffered',                    // 或 'streaming'
  fetch: async (request) => { /* 返回 Response */ },
})
```

约束（来自 `assertFetchRoute` / `endpointFromPath`）：

- `path` 必须形如 `/api/<段>`，段不能为空、不能是 `.` / `..`，需匹配 `/^[A-Za-z0-9_$.-]+$/`
- `methods` 只能是 `GET` / `HEAD` / `POST`，不能为空、不能重复
- 一条路由对应一个精确 pathname，多端点就注册多条
- 路径冲突抛 `connection: exact Fetch route "..." is already registered`

路径写错的报错原文：

```text
[probe C] connection.fetch.register THREW: Error: connection: invalid exact Fetch route "/hello"
```

**鉴权是自动的**——这些路由挂在共享 `/api` 通道上，Host/Origin 围栏与 token/cookie 照常施加。实测无 cookie 访问 `/api/hello` 返回 `401 unauthorized`。

#### 浏览器侧两种调法

1. **同源 `fetch('/api/<name>')`**（本次采用）。Cookie 与 Origin 由浏览器自动带上，最简单。
2. **保留 `ctx.connection.rpc.call('/api', '<name>', payload)`**：`createSharedFetchHandler('/api')` 会**先**查 `fetchRoutes` 再落到 Gateway，所以你的路由能被命中；只要 handler 自己解析并回吐信封即可（§8.2 的 `/api/hello-rpc` 就是，已实测 200）。

   请求信封（`clientRequestSchema`，`method` 必须等于 endpoint）：
   ```json
   {"type":"client-request","rpcId":"<id>","method":"<endpoint>","payload":{}}
   ```
   响应信封：
   ```json
   {"type":"server-response","rpcId":"<同上>","result":{"ok":true,"value":{}}}
   ```

   走这条路就不必改 `spec.md` 里客户端的编程接口，只需把宿主侧从 `rpc.handle` 换成 `fetch.register` 并自己套信封。

#### 不要手搓 `ctx.webServer.register`

探针 F 虽然成功，但**它绕过了鉴权**：

```text
=== GET /hello2 with NO cookie ===
status=200 body=hello2
```

未认证请求直接拿到了内容。`ctx.webServer` 是裸载体，不带任何 Origin 围栏或 token 校验。**`session-archive` 有删除会话日志的能力，绝不能走这条路。**

### 9.2 `dsh web --patch <file>` 被拒绝

```text
error: unknown option '--patch'
```

`--patch` 是启动器 flag，`web` 子命令之后的参数全部交给 Web 应用解析。用：

```powershell
dsh --profile web --patch <overlay> --no-open --port 3080
```

**迷惑之处**：`dsh web --patch <file> --dump-config` 是**能跑通的**，因为 `--dump-config` 在启动器层就短路退出了，应用的解析器根本没运行。所以「dump 能过」不代表「boot 能过」，别拿 dump 验证命令行形式。

### 9.3 插件加载失败会打死整个进程

宿主半 `apply` 抛异常时，boot 直接以非零码退出：

```text
Error: dsh: plugin tree failed to load: failed to apply loader entry hello (...)
```

不是「跳过坏插件继续启动」。开发期这一点其实友好（大声失败），但意味着 `session-archive` 的探测逻辑必须自己 try/catch 并降级，绝不能让异常逃到 `apply` 外面——否则用户的整个 harness 都起不来。

### 9.4 PowerShell `$pid` 是只读内置变量

```text
WriteError: Cannot overwrite variable PID because it is read-only or constant.
```

后台进程管理脚本里用 `$procId` 之类的名字。

---

## 10. Symbol 分裂检查

### 默认状态：干净

刚安装完，`~/.dsh/profiles/node_modules/@deepseek-ai/` 下**全部是 Junction**，指向全局安装的唯一副本：

```text
Name                     Mode  LinkType Target
----                     ----  -------- ------
cordis                   l---- Junction C:\Users\Administrator\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\cordis
dsh-base                 l---- Junction C:\Users\Administrator\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-base
...（约 180 个，全部 Junction）
```

而 `~/.dsh/profiles/web/node_modules/` 里**根本没有 `@deepseek-ai` 目录**。`dsh plugin add` 一个 `link:` 本地插件之后也仍然没有：

```text
Name                          Mode  LinkType
----                          ----  --------
.pnpm                         d----
dsh-hello-plugin              l---- SymbolicLink
.modules.yaml                 -a---
```

### 触发条件：插件声明了 `@deepseek-ai/*` 的真实 dependency

profile 的 `pnpm-workspace.yaml` 写着 `nodeLinker: hoisted`，所以 pnpm 会把树外依赖**摊成物理目录**放进 `profiles/<name>/node_modules/`。实测：

```powershell
dsh plugin --profile web add "@deepseek-ai/dsh-client-ui-primitives@0.1.5-rc.1"
```

之后：

```text
=== profiles/web/node_modules/@deepseek-ai ===
Name                     Mode  LinkType Target
----                     ----  -------- ------
dsh-client-ui-primitives d----                     <-- LinkType 为空 = 物理目录
```

解析结果分裂：

```text
@deepseek-ai/cordis                     C:\Users\...\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\cordis\lib\index.js
@deepseek-ai/dsh-base                   C:\Users\...\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-base\lib\index.js
@deepseek-ai/dsh-client-ui-primitives   C:\Users\Administrator\.dsh\profiles\web\node_modules\@deepseek-ai\dsh-client-ui-primitives\lib\index.js
```

`profiles/web/node_modules/` 在 Node 的向上查找里**先于** `profiles/node_modules/`，所以物理副本会遮蔽 junction 农场里的那一份。如果被遮蔽的是定义了 Service 的核心包，两份模块就有两套 `Symbol`，`inject` 永远等不到，表现为运行期 `cannot get property "xxx" without inject` 或服务静默不就绪。

### 检测

```powershell
Get-ChildItem "$env:USERPROFILE\.dsh\profiles\web\node_modules\@deepseek-ai" -Force -ErrorAction SilentlyContinue |
  Where-Object { -not $_.LinkType } | Select-Object -ExpandProperty Name
```

**输出为空 = 健康。** 任何输出都是一份物理副本，即一处潜在分裂。对照检查解析目标：

```powershell
Push-Location "$env:USERPROFILE\.dsh\profiles\web"
node -e "for (const m of ['@deepseek-ai/cordis','@deepseek-ai/dsh-base']) console.log(m, require.resolve(m,{paths:[process.cwd()]}))"
Pop-Location
```

两者都应指向 `AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\`。

### 修复与预防

- 修复：`dsh plugin --profile web remove <包名>`，必要时删掉 `profiles/web/node_modules` 后重新 `dsh plugin --profile web install`。
- 预防（**这才是重点**）：插件的 `package.json` 里，一切 `@deepseek-ai/*` 内部包一律放 `peerDependencies` + `devDependencies`，**绝不放 `dependencies`**。这与 `host-internals.md` 末尾的依赖表一致。纯值库（如 `@deepseek-ai/schemastery`）多副本无害，可以放 `dependencies`。
- `pnpm remove` 会留下空的 `@deepseek-ai` 目录和残留 symlink，属正常现象，不影响解析。

---

## 11. 现场状态与清理

本次验证结束时：

- **没有任何 dsh / node 进程在跑，3080 端口已释放。**
- `~/.dsh/profiles/web/package.json` 已还原为初始状态（`bundles` 只有 `dsh-base` 与 `dsh-web-app`，无 `dependencies`）。
- `~/.dsh/profiles/web/node_modules/@deepseek-ai/` 无物理副本。
- 一次性插件目录 `C:\Users\Administrator\dsh-dev\`（含 `hello-plugin`、`hello.overlay.yml`、`simulate-client.mjs`）已在 `session-archive` 完工后删除。本文各节仍逐字引用这些路径，那是当时的实测记录；需要重走这条最小闭环时，照 §8.1–8.4 的文件内容重建即可。
- **DSH 全局安装保留**，它不是中间产物：`packages/session-archive/e2e/verify.mjs` 依赖它启动真实宿主。真要卸载用 `npm uninstall -g @deepseek-ai/dsh`，`~/.dsh` 需手工删除。

---

## 12. 给 `session-archive` 实现者的清单

1. **传输层要改**。`spec.md` 的 `ctx.connection.rpc.handle('/session-archive', ...)` 在本版本必然抛异常，改用 `ctx.connection.fetch.register({ path: '/api/session-archive-<endpoint>', ... })`。想保留客户端 `ctx.connection.rpc.call` 的写法，就让 handler 自己套 `client-request` / `server-response` 信封（§9.1 有实测样例）。
2. **绝不用 `ctx.webServer.register` 自建路由**，那样没有鉴权。
3. **`inject` 写错服务名是静默失败**，浏览器侧对照 §7 的服务名清单。
4. **`apply` 里任何未捕获异常都会打死整个 harness**，探测与降级逻辑必须自己兜住。
5. **`@deepseek-ai/*` 一律 peer + dev**，避免 §10 的 Symbol 分裂。
6. 开发循环：改代码 → 重启 `dsh --profile web --patch <绝对路径overlay> --no-open --port 3080` → 复制 stdout 的 token URL 开页面。冷启动约 30 秒。
7. 浏览器半的验证现在有了更好的办法：`packages/session-archive/e2e/verify.mjs` 会拉起真实 DSH 与真实 Chromium 跑完整回归。§8.6 那套 Node 桩 `__ModuleLoader__` 的做法是无浏览器时的权宜之计，已被它取代——真机后来暴露出的宿主 `Modal` 无 max-height 导致列表溢出视口，正是 Node 桩看不见的那类问题。
