# RelayNote

[English README](./README.md)

RelayNote 是一个自托管的会话交接层，面向长时编码任务。
它把终端活动压缩成结构化交接产物，方便你在不重读完整日志的情况下继续任务。

## 两种使用方式

### 1. 接入 TouchMux（快速路径）

把 RelayNote 当作 TouchMux（或类似手机工作台）的本地 handover API：

- `GET /api/touchmux/v1/sessions`
- `GET /api/touchmux/v1/sessions/:id`

同时也提供：

- `GET /api/health`
- `GET /api/sessions`
- `GET /api/sessions/:id/note`
- `GET /api/sessions/:id/resume-packet`

### 2. 独立使用（不依赖 TouchMux）

直接用 CLI/TUI：

- 监听现有 `tmux` 会话
- 包装命令执行并持续记录
- 添加检查项和人工注释
- 在终端、TUI、手机网页读取交接信息

## 快速开始

### 依赖

- Node.js 22+
- `tmux`（用于 `watch`）
- `git`（可选，用于改动文件和 diff 摘要）

### 安装与构建

```bash
npm install
npm run build
```

### 测试

```bash
npm test
```

## 常用命令

### 监听 tmux 会话

```bash
node dist/cli.js watch \
  --tmux codex-42 \
  --goal "Fix flaky auth refresh tests" \
  --cwd /path/to/repo
```

### 包装命令执行

```bash
node dist/cli.js run \
  --goal "Inspect websocket reconnect failures" \
  --cwd /path/to/repo \
  -- bash -lc "npm test"
```

### 列出会话

```bash
node dist/cli.js sessions
```

### 查看会话 note

```bash
node dist/cli.js show run-2026-03-31T00-00-00-000Z
```

### 查看 resume packet

```bash
node dist/cli.js resume run-2026-03-31T00-00-00-000Z
```

只输出 prompt：

```bash
node dist/cli.js resume run-2026-03-31T00-00-00-000Z --prompt-only
```

### 给会话附加检查项

```bash
node dist/cli.js check run-2026-03-31T00-00-00-000Z \
  --name test \
  --cwd /path/to/repo \
  -- bash -lc "npm test"
```

### 给会话附加注释

```bash
node dist/cli.js annotate run-2026-03-31T00-00-00-000Z \
  --type blocker \
  --text "Need a human review before merge"
```

### 启动终端 TUI（不打开网页）

```bash
node dist/cli.js tui
```

### 启动 API + 手机网页 Reader

```bash
node dist/cli.js serve --host 127.0.0.1 --port 4318
```

TouchMux 接入推荐：

```bash
node dist/cli.js serve \
  --host 127.0.0.1 \
  --port 4318 \
  --token your-strong-token \
  --allowed-origins https://touchmux.example.com
```

## 数据目录

默认输出：

```text
.relaynote/sessions/<session-id>/
  events.jsonl
  metadata.json
  current_note.json
  current_note.md
  resume_packet.json
```

## 安全默认策略

- 非 loopback 地址启动服务时，必须带 `--token`
- `/api/*` 全部支持 token 鉴权（`X-RelayNote-Token` 或 `?token=...`）
- 可用 `--allowed-origins` 配置来源白名单
- 服务端响应带基础安全头

## 简要架构

- Collectors：采集 tmux、包装进程、检查项、注释、git 信号
- 统一事件流：追加写入 `events.jsonl`
- Reducer：确定性状态推断与交接信息归约
- Storage/API/UI：JSON/Markdown 产物 + CLI/TUI + 手机网页/API

## 阶段状态

- 阶段一已完成：handover contract、状态推断、validation evidence、基础文件系统安全。
- 阶段二已完成：本地优先 CLI/TUI 流程。
- 阶段三已完成：集成与安全面（TouchMux v1 API、token 鉴权、origin allowlist）。
- 阶段四已完成：质量导向交接能力（`statusReason`、`confidence`、compact summary、handover checklist）。
