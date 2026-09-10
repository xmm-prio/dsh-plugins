# 01 · 包骨架与双半构建

Status: done

建立 `packages/session-archive`，跑通「宿主半 + 浏览器半」的最小闭环：装进 DSH 后侧栏底部出现一个按钮，点击弹出一个空面板，面板能调通一个宿主端点并显示返回值。

这一项的价值在于**先把构建与装载这条路走通**，后面所有功能都长在它上面。上游的客户端打包预设 `packages/client/tsdown.client.ts` 没有发布到 npm，必须自己复现那套 ModuleLoader 闭包握手。

## 范围

- pnpm workspace 下的包骨架，`packages/session-archive/{src,src/client}`
- `package.json`：`exports` 映射 `.` → 宿主半、`./client` → 浏览器半、`./package.json`；`dsh` 字段声明 `bundle.patch` 与 `client.{platform,inject}`
- `cordis.patch.yml`：单行 insert
- `build.mjs`：esbuild 两个 target
- 一个 `ping` 端点，验证通道可用
- 本地调试用的 overlay

## 要点

> **已订正（2026-09-10）**，三处：
>
> 1. **ModuleLoader 的 `id` 必须是完整包名**（`@dsh-plugins/session-archive`），短名会在运行时抛 `loaded without registering`。banner 还必须带 `Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })` 那一行。（`host-internals.md` §10.1）
> 2. **`external` 不能用通配。** 浏览器端 `require()` 只无条件认九个静态种子 specifier；此外的任何 specifier 都要求对方在 boot graph 里有行**且**本包在 `dsh.client.external` 里声明它。esbuild 的 `external` 必须与 `dsh.client.external` 逐项对齐。（§10.2）
> 3. **overlay 里的路径不必是绝对路径**，`./` 与 `../` 以 overlay 文件所在目录为基准解析（§12.4）。不过 overlay 可能被从不同位置引用，本仓库仍采用绝对路径。
>
> 另外 **`ping` 端点不能建在 `ctx.connection.rpc.handle` 上**（该 API 本版本必抛，见 issue 08 的订正），改用 `ctx.connection.fetch.register`。

浏览器半的 banner/footer 必须精确复现闭包外壳：

```js
banner: { js: "window.__ModuleLoader__.load({ id: '<完整包名>', factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });" },
footer: { js: 'return module.exports; } });' },
```

跨插件的 value import 会导致 Symbol 分裂，必须外置；**一切 `@deepseek-ai/*` 只能进 `peerDependencies` + `devDependencies`**，进 `dependencies` 会让 pnpm 在 profile 目录里摊出物理副本、遮蔽 junction 农场（`dev-env.md` §10）。

Windows 上不要通过 shell 解析 `node_modules/.bin` 的 shim——那是 POSIX shell 脚本，cmd 跑不了。直接 `execFileSync(process.execPath, entry)`。

## 验收

- `pnpm build` 在 Windows 与 POSIX 上都能产出 `lib/index.js` 与 `lib/client.js`
- `dsh --patch <overlay.yml>` 启动后侧栏底部出现按钮
- 面板能调通 `ping` 端点

## Comments

已完成。与预期不同的几点：

- **`dsh.client.inject` 整段删掉了。** 参考插件 `hello-plugin` 不带这个字段也能正常加载，浏览器侧只要不 require 九个种子说明符之外的东西就不需要它。留着是噪音。
- **`@deepseek-ai/schemastery` 从 `dependencies` 挪到 `devDependencies`**，由 esbuild 内联。这样发布出去的包 `dependencies` 为空，彻底避开 `nodeLinker: hoisted` 下的 Symbol 分裂。可行的前提是 cordis 通过 Standard Schema（`Config['~standard'].validate`）校验配置，而不是 `instanceof Schema`——任何符合该协议的对象都可以。
- **boot graph 行已在活体上确认**：`{"id":"@dsh-plugins/session-archive","url":"/plugins/??@dsh-plugins/session-archive/client.js&rev=...","external":["react","react/jsx-runtime","@deepseek-ai/dsh-client-ui-primitives"]}`。banner 的 id 必须是完整包名这一点得到印证。
- **overlay 用了相对路径** `./lib/index.js`，在 0.1.5-rc.1 上正常工作。
- **`ping` 端点没有单独实现**，它的作用（证明通道打通）由 `capabilities` 覆盖，多一个端点只是重复。
