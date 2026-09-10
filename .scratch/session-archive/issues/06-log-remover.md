# 06 · 会话日志删除器

Status: done
Blocked by: 03, 05

不可逆地删除一个会话的日志目录，并清理它在宿主各处留下的账。

## 顺序（不可调换）

1. 拆 agent（issue 05）
2. 探针复验写路径已释放（issue 05）；不过就中止
3. `rm -rf` 会话目录
4. 遍历工作区实体 `detachSession(id)` 清账（幂等，无条件调用）
5. **最后**把 id 移出归档集合（issue 03）

第 5 步必须在最后：id 一旦离开归档集合就必须已经从磁盘上消失，否则它会以未分组的活会话身份冒出来。

## 路径解析

用 JSONL 后端上的 `resolveCurrentLog(id)` 拿到当前 generation 的绝对路径，再取 `dirname`。

```ts
if (ctx.sessionPersistence.name !== 'session-persistence-jsonl') { /* 禁用删除 */ }
const logPath = await persistence.resolveCurrentLog(id)
if (logPath === undefined) { /* 尚未物化，或只存在待迁移的历史 generation */ }
const dir = dirname(logPath)
```

它是 **public**、带 JSDoc、受该包内部 `StorageBackend` 接口约束的方法，返回绝对路径字符串。不依赖任何私有运行期形状，也不需要自己知道根目录。类型从包的 default export 收窄：`import type JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'`。

后端身份判据是 `ctx.sessionPersistence.name === 'session-persistence-jsonl'`（后端类上的 `override readonly name`）。非 JSONL 后端一律禁用删除，不猜。

边界：返回 `undefined` 表示会话尚未落盘或只有历史 generation，此时不删；未来格式版本会抛 `SessionFormatUnsupportedError`，该错误的 `location.path` 反而带着路径，可作兜底。

**不要用 `findLog`。** 它是 private，而且返回值已从字符串变成对象 `{ sourcePath, sourceVersion, currentPath }`——生态里有插件写了 `typeof persistence.findLog === 'function'` 的守卫，守卫照样通过，下一行 `dirname(对象)` 直接抛 TypeError。这是最坏的那类破坏。

`sessionDir` / `projectDir` / `projectKey` / `encodeSegment` 在 `format.ts` 里虽是 `export`，但包入口不 re-export，且发布的 tarball 里**没有 `src/`**（`files` 只含 `lib/`），所以 `/src/*` 子路径导出只在 monorepo 内部有效，装出来的包上是 ENOENT。复刻编码器这条路已排除。

配置项 `sessionRoot` 退化为纯 escape hatch：仅当上述路径全不可用时使用，且拼出的目录必须做归属校验——basename 等于编码后的 id，目录内存在规范 generation 文件（`session.vN.jsonl[.zstd]`），子串碰撞拒绝（`abc` 绝不能命中 `abcdef`）。

## 要点

Windows 需要 EBUSY / EPERM / EACCES / UNKNOWN / ETXTBSY 的重试梯子（约 1 秒）。`force: true` 只吞 ENOENT，不吞锁定错误。

根目录守卫必须跨平台：POSIX 的 `/`、Windows 盘符根 `C:\`、UNC 共享根都要挡住。

SessionId 需校验：非空、有长度上限、不含路径分隔符与 NUL、不是 `.` 或 `..`。

**不处理**会话查询的 sqlite 索引——生态里的插件都没碰，宿主重启后按磁盘重扫。

## 验收

- 删除后磁盘上目录消失
- 删除后该 id 不在归档集合里，也不以未分组身份出现
- 探针不过时中止，磁盘无任何改动
- 子串相近的会话 id 不会互相误删
- Windows 上删除成功率与 POSIX 一致

## Comments

已完成。删除路径是六道闸门：归档集合成员 → 拆除活体 → 定位日志 → 写租约已释放 → 目录归属校验 → `rm` → 从账本与归档集合中移除。

- **`resolveCurrentLog` 返回 `undefined` 有两个含义**：没有日志，或者盘上是旧版格式。两者可以区分：`list()` / `stat()` **包含**旧版世代（读时迁移，只跳过不支持的**更高**版本），而 `resolveCurrentLog` 拒绝旧版。所以用 `stat` 判别。旧版情况报告为独立的拒绝原因，绝不当成「无可删除」，也绝不把 id 移出归档集合。
- **更高版本的拒绝抛 `SessionFormatUnsupportedError`，带 `location.path`**，可以直接用来定位，不必扫描。
- **`owned: true`（也就是 basename 归属校验）只对 `scanned` 这一种情况成立**——那是本插件自己拼出来的路径，必须自证。后端给出的路径不做这个校验，否则是在质疑后端。
- **`abc` 与 `abcdef` 的子串碰撞**：`scanForSessionDir` 只认名字**完全等于**会话 id、且内部含有世代文件的目录，绝不做前缀匹配。跨平台根目录守卫（POSIX `/`、Windows `C:\`、UNC）单测覆盖。
- 活体确认：真实日志路径形如 `~/.dsh/sessions/--<编码后的 cwd>--/<会话 id>/session.v3.jsonl.zstd`，会话目录的 basename 就是原始会话 id。删除后目录确实从盘上消失，id 同时离开归档集合、工作区账本和持久化语料。未归档会话、非法会话 id 都被正确拒绝。
