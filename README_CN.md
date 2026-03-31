# RelayNote

[English README](./README.md)

RelayNote 是一个面向手机优先、自托管场景的长时编码会话交接层。

它会把原始终端会话压成结构化的交接笔记和续跑包，让另一个人、另一个模型，或者未来的你，不需要重放整段 scrollback，也能继续工作。

## 两种使用方式

RelayNote 现在同时服务两类非常接近的使用方式。

### 1. 给 TouchMux 这类工作台快速接入

如果你已经有像 TouchMux 这样的远程工作台，RelayNote 可以作为背后的只读 handover 引擎。

内置 API 目前提供：

- `GET /api/health`
- `GET /api/sessions`
- `GET /api/sessions/:id/note`
- `GET /api/sessions/:id/resume-packet`

这样接入面会比较小，也更稳定。

### 2. 给不需要 TouchMux 的用户直接使用

如果你并不需要 TouchMux，RelayNote 也可以独立工作：

- CLI：`watch`、`run`、`note`、`resume`、`annotate`
- 一个很小的内置 Web 服务
- 一个手机友好的浏览器 reader

## 这个项目解决什么问题

现在的大多数 AI 编码工具，通常擅长这两件事：

- 帮你生成代码
- 把终端输出不断流式推出来

但它们通常不太擅长第三件真正影响实际工作的事：

- 把一个没做完、或者刚做完的会话，清楚地交给下一个接手者

RelayNote 就是补这层能力的。

它不替代终端、编辑器或 agent runtime，而是作为旁路 sidecar，持续记录：

- 这个会话想做什么
- 最近做了什么
- 改了哪些文件
- 有哪些证据
- 卡在哪
- 下一步应该做什么

## 典型痛点

一个持续很久的编码会话，经常只留下这些东西：

- 很长的终端滚动输出
- 一部分已经改过的代码
- 模糊的当前状态
- 不清楚的下一步

这会直接带来几个实际问题：

- 你在手机上很难快速判断这个任务现在到底怎么样了
- 换一个模型继续跑时，会浪费很多上下文重新理解现场
- 交给同事接手时，对方不容易安全接班
- 夜里跑了一晚，第二天有输出，但没有真正可用的 handoff

## 核心概念

RelayNote 会为每个 session 生成一组固定产物：

- `events.jsonl`：追加写入的标准化事件日志
- `current_note.json`：机器可读的当前状态
- `current_note.md`：给人看的交接文档
- `resume_packet.json`：给下一个操作者的最小续跑包

这份交接物会回答这些核心问题：

- 目标是什么？
- 最近发生了什么？
- 改了哪些文件？
- 有哪些证据？
- 当前是卡住了、做完了，还是适合续跑？
- 下一个接手者应该先做什么？

## 主要使用场景

### 1. 夜间长跑

睡前启动一个 coding agent，第二天早上不用看全量日志，直接看 handover note。

### 2. 手机监管

在手机上快速看进度、阻塞点和建议下一步，而不是打开完整浏览器 IDE。

### 3. 跨模型续跑

把一个任务从一个模型或工具切换到另一个模型或工具时，不丢工作状态。

例子：

- Codex CLI -> Cline
- aider -> Codex CLI
- 本机 -> 远程节点

### 4. 人类协作者接手

把一个没做完的 session 交给另一个工程师时，提供紧凑、结构化的上下文包。

### 5. 失败恢复

任务失败后，留下的是可恢复工单，而不只是原始终端转录。

## 当前 v0.1 已实现的能力

- 监听已有 `tmux` session，并持续刷新交接产物
- 包装一个命令运行，记录输出、退出码和当前状态
- 对已有 session 附加命名 validation check
- 直接在 CLI 列出会话（`relaynote sessions`）
- 直接在 CLI 查看单个会话（`relaynote show`）
- 本地终端 TUI（`relaynote tui`）
- 用状态机表示会话状态：
  - `running`
  - `waiting_for_human`
  - `blocked`
  - `ready_for_review`
  - `ready_to_resume`
  - `completed`
  - `abandoned`
- 支持人工加注释，例如 `blocker`、`note`、`handoff`
- 在 git 可用时记录改动文件和 diff 摘要
- 记录命名 validation checks，例如 `test`、`build`、`lint`
- 同时导出 JSON 和 Markdown 两种交接视图

## 阶段状态

- 阶段一：核心 handover contract、状态推断、validation evidence，以及基础文件系统安全边界已经完成。
- 阶段二：本地优先 CLI / TUI 使用体验已经实现。
- 阶段三：再继续把集成接口和 TouchMux 接入面做稳。

## 快速开始

### 依赖

- Node.js 22+
- `tmux`，用于 `watch` 模式
- `git`，如果你希望启用改动文件检测

### 安装与构建

```bash
npm install
npm run build
```

### 运行测试

```bash
npm test
```

## CLI 用法

### 监听一个现有 tmux session

```bash
node dist/cli.js watch \
  --tmux codex-42 \
  --goal "Fix flaky auth refresh tests" \
  --cwd /path/to/repo
```

### 包装一个命令

```bash
node dist/cli.js run \
  --goal "Inspect websocket reconnect failures" \
  --cwd /path/to/repo \
  -- bash -lc "npm test"
```

### 查看当前 note

```bash
node dist/cli.js note show run-2026-03-31T00-00-00-000Z
```

### 直接在 CLI 列出会话

```bash
node dist/cli.js sessions
```

### 直接在 CLI 查看单个会话

```bash
node dist/cli.js show run-2026-03-31T00-00-00-000Z
```

### 导出 JSON

```bash
node dist/cli.js note export run-2026-03-31T00-00-00-000Z --format json
```

### 读取 resume packet

```bash
node dist/cli.js resume run-2026-03-31T00-00-00-000Z
```

只输出 resume prompt 文本：

```bash
node dist/cli.js resume run-2026-03-31T00-00-00-000Z --prompt-only
```

### 手工加入 blocker

```bash
node dist/cli.js annotate run-2026-03-31T00-00-00-000Z \
  --type blocker \
  --text "Need a human review before merge"
```

### 给已有 session 附加一个命名 validation check

```bash
node dist/cli.js check run-2026-03-31T00-00-00-000Z \
  --name test \
  --cwd /path/to/repo \
  -- bash -lc "npm test"
```

### 启动内置 API 和手机 Reader

```bash
node dist/cli.js serve --host 127.0.0.1 --port 4318
```

然后打开：

- Web reader：`http://127.0.0.1:4318/`
- Sessions API：`http://127.0.0.1:4318/api/sessions`

### 启动本地终端 TUI（不需要浏览器）

```bash
node dist/cli.js tui
```

快捷键：

- `j/k`：移动选中项
- `r`：刷新
- `y`：在界面消息区打印当前 resume prompt
- `q`：退出

## 输出目录结构

默认情况下，RelayNote 会把数据写到：

```text
.relaynote/sessions/<session-id>/
  events.jsonl
  metadata.json
  current_note.json
  current_note.md
  resume_packet.json
```

## 技术架构

RelayNote 整体保持得很小，也尽量可组合。

### 1. Collectors

从不同来源采集运行信号，例如：

- tmux pane 抓取
- 包装进程的生命周期
- git 改动检测
- 人工注释

### 2. 标准化事件

把不同来源的信号压成统一事件模型，例如：

- `session_started`
- `output_chunk`
- `command_started`
- `command_finished`
- `annotation_added`
- `session_idle`
- `session_stopped`

### 3. Reducer

用确定性的 reducer，把事件流归约成当前 handover state。

### 4. Storage

RelayNote 会保存：

- 追加写入的事件日志
- 当前物化状态
- 给下一个接手者的续跑包

## 设计原则

- 终端优先，而不是 IDE 优先
- 自托管优先
- 先保证确定性核心行为，再考虑可选的 LLM 压缩
- 同时照顾人类可读和机器可读
- 即使 session 异常结束，也要留下有价值的交接物

## v0.1 暂时不做

这个版本刻意收得很窄。

- 还没有浏览器 dashboard
- 还没有 HTTP API
- 还没有多用户权限系统
- 不绑定某一家厂商的 agent
- 不强依赖 LLM 总结

## 下一步方向

v0.1 之后最值得做的是只读 API 和最小手机 reader，这样像 TouchMux 这样的工具就可以直接消费 RelayNote 的输出，而不需要自己解析内部文件。

更多说明：

- [技术架构](./docs/architecture.md)
- [Contracts](./docs/contracts.md)
- [安全说明](./docs/security.md)
- [Roadmap](./docs/roadmap.md)

## License

MIT
