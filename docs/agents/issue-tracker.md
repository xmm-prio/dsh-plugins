# Issue 跟踪器：本地 Markdown

本仓库的 Issue 与规格以 Markdown 文件形式存放于 `.scratch/`。

## 约定

- 每个功能使用一个目录：`.scratch/<feature-slug>/`
- 规格文件：`.scratch/<feature-slug>/spec.md`
- 实施任务每项一个文件：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，序号从 `01` 开始；不得将多个任务合并到同一文件。
- 在任务文件开头附近用 `Status:` 行记录状态。
- 在文件末尾的 `## Comments` 标题下追加评论与讨论历史。

## 技能要求“发布到 Issue 跟踪器”时

在 `.scratch/<feature-slug>/` 下创建文件；目录不存在时一并创建。

## 技能要求“获取相关任务”时

读取引用路径对应的文件。用户通常会直接提供路径或任务编号。

## Wayfinding 操作

供 `/wayfinder` 使用。映射文件为每个任务维护一个子文件。

- 映射文件：`.scratch/<effort>/map.md`，内容为记录、已决策事项与待澄清问题。
- 子任务：`.scratch/<effort>/issues/NN-<slug>.md`，序号从 `01` 开始，正文包含问题；开头使用 `Type:` 记录任务类型（`research`、`prototype`、`grilling` 或 `task`），并用 `Status:` 记录 `claimed` 或 `resolved`。
- 阻塞关系：在文件开头使用 `Blocked by: NN, NN`。列出的全部任务变为 `resolved` 后，该任务解除阻塞。
- 可执行任务：扫描 `.scratch/<effort>/issues/`，选择首个开放、未阻塞且未被认领的任务，序号小者优先。
- 认领：开始工作前，将 `Status:` 更新为 `claimed` 并保存。
- 解决：在 `## Answer` 标题下追加结论，将 `Status:` 更新为 `resolved`，再向 `map.md` 的“已决策事项”追加上下文指针（摘要与链接）。
