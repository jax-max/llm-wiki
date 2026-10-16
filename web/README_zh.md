# Wiki 对话 Web

简体中文 | [English](README.md)

本仓库 `wiki-query` 方法的本地单用户对话界面。每轮加载 `../skills/wiki-query/SKILL.md`，读取当前 wiki，只使用 `search_wiki`、`read_document` 和 `wiki_relations` 三个工具。回答通过 POST/Fetch SSE 流式返回；引用在来源面板中打开，支持相对链接与 Raw 导航。

界面还提供**摄入入口**：输入来源 URL 或上传 `.md`/`.txt` 文件，按 `../skills/wiki-ingest` 的方法论整理进知识库。编译由 Claude Agent SDK 驱动的 Agent 在临时 staging 副本上完成，产物经逐文件 diff 预览、人工确认后才写入 `WIKI_ROOT`，取消则真实库零改动。查询对话保持永远只读。

## 本地运行（用户执行）

需要 Node.js 22.19 或更高版本。在 `web/` 目录下执行：

```sh
npm ci
cp -n .env.example .env
# 编辑 .env：LLM_BASE_URL、LLM_MODEL 和 LLM_API_KEY 为必填项。
npm run dev
```

复制命令不会覆盖已存在的 `.env`；配置已完整时可以跳过。
在仓库根目录执行时，用 `npm --prefix web run dev` 代替 `npm run dev`。

打开 `http://127.0.0.1:5174`。Vite 会把 API 请求代理到 3002 端口的后端。两个服务都只绑定回环地址。若要提供生产构建：

```sh
npm run build
npm start
```

打开 `http://127.0.0.1:3002`。start 命令会启用生产来源限制。修改 `.env` 后需重启。`PORT=3002` 固定后端/生产端口，`WEB_PORT=5174` 固定开发页面端口。两个监听在端口被占用时会直接失败，不会自动改用其他端口，请保持两个值不同。这两个端口设置中 `.env` 优先于导出的环境变量。

## 使用界面

提出一个问题，然后在同一对话中继续追问。
进度会显示应用正在做什么和文档标题，例如"正在阅读《抽奖尝试计数》"。
界面不显示文件路径、工具名和模型细节。
点击引用即可阅读来源、跳转关联文档或返回上一个来源。窄屏下来源面板会全屏展示。

点击"停止生成"可保留已显示的回答，随后重试或继续提问。
生成结束后再新建对话可清空当前讨论。
错误提示使用通俗语言并建议下一步操作。原始来源正文保持原样。
应用不保存对话，也不修改知识库。
问题与选中的证据会发送给所配置的模型服务方。

界面首次访问时跟随浏览器语言（中文或英文），可从顶栏切换；选择保存在浏览器中，下次访问自动恢复。切换不会重新翻译已流式显示的回答、历史轮次和来源正文，知识库名称来自服务端配置。回答语言跟随提问语言。

### 摄入（预览-确认式）

顶栏「＋ 摄入」打开摄入对话框（`INGEST_ENABLED=false` 或 `LLM_API=openai-completions` 时隐藏）。流程：

1. 输入来源 URL 或选择 `.md`/`.txt` 文件（不超过 `INGEST_MAX_UPLOAD_MB`）。上传文件由服务端直接按 raw 模板落盘并计算 SHA-256；URL 由 Agent 经 WebFetch 抓取后保存 raw。
2. 摄入前服务端做确定性预检：正文 SHA 与既有 raw 完全一致会直接拒绝；URL 与既有 raw 的 Source 相同时会提示"将作为新版本并存"。
3. Agent 按 wiki-ingest 规范在 staging 副本上编译页面与 log，界面实时显示进度。
4. 编译完成后逐文件预览变更 diff（含证据校验报告），点「确认写入知识库」应用，或「丢弃」取消。同一时间只允许一个摄入任务；预览后若真实库被外部修改，应用会被拒绝并要求重摄。

## 配置

| 变量 | 默认值 / 要求 |
| --- | --- |
| `WIKI_ROOT` | `../examples/demo-wiki`；源码与生产构建中都相对 `web/` 解析 |
| `WIKI_ID` | `default` |
| `WIKI_NAME` | Wiki 根目录名 |
| `LLM_API` | `anthropic-messages` 或 `openai-completions` |
| `LLM_BASE_URL` | 必填。Anthropic：主机根地址，如 `https://api.anthropic.com`（SDK 自动拼接 `/v1/messages`）。OpenAI：API 根地址，如 `https://api.openai.com/v1`（SDK 自动拼接 `/chat/completions`）。 |
| `LLM_MODEL` | 必填；所配置端点接受的模型 ID |
| `LLM_API_KEY` | 必填；仅服务端使用 |
| `PORT` | `3002`；后端与生产页面端口 |
| `WEB_PORT` | `5174`；开发页面端口 |
| `QUERY_TIMEOUT_MS` | 默认 `QUERY_MAX_TOOL_CALLS × 15s + 30s`（默认预算 30 时为 480000），上限 3600000；显式值优先 |
| `QUERY_MAX_TOOL_CALLS` | `30` |
| `INGEST_ENABLED` | `true`；关闭后隐藏入口并拒绝摄入请求 |
| `INGEST_MODEL` | 默认同 `LLM_MODEL`；摄入 Agent 使用的模型 ID，可与查询的轻量模型区分 |
| `INGEST_MAX_UPLOAD_MB` | `2`；1–16。上传文件大小上限（multipart 请求体限制） |
| `INGEST_TIMEOUT_MS` | `1200000`；上限 3600000。单次摄入整体超时 |
| `INGEST_MAX_TURNS` | `80`；1–500。摄入 Agent 步数上限 |
| `INGEST_VALIDATE` | `auto`；`on`/`off` 控制预览附带的证据校验（check_evidence.py）报告 |

摄入额外要求 `LLM_API=anthropic-messages`（Claude Agent SDK 只走 Anthropic 兼容通道），并依赖仓库 `../skills/wiki-ingest/SKILL.md` 与 `references/templates.md` 可读；缺失时摄入自动停用，查询不受影响。

启动检查要求 `wiki/schema.md`、`wiki/index.md`、`wiki/domains/`、`raw/` 和仓库 Skill 可读。应用不会自动读取 mobi 或用户 Pi 设置中的凭证；要复用本地 Pi 配置，请把协议、Base URL、模型和 API key 显式复制到 `.env`。`.env` 已被 Git 忽略。模型目录按 131072 token 上下文上限和 8192 最大输出 token 配置；端点限额更小时可能拒绝请求，此时请新建对话。

## 行为与边界

对话只存在于服务端和页面内存中。刷新或新建对话都会重新开始；空闲对话 30 分钟后过期。每个对话同时只允许一个请求。已完成的 Pi 消息保留多轮上下文；每轮使用全新的隔离 Agent 和文件/关系视图。停止、断连、超时、工具预算错误和服务方失败都会丢弃未完成的轮次。已显示的文本保留并标记未完成状态。重试只复用已完成的轮次。自动模型重试和上下文压缩均已禁用。

仅接受带合法 Host 和 Origin 的本地请求。开发环境允许配置 `WEB_PORT` 上的 Vite 来源。文件工具与文档端点共用规范化、扩展名和 realpath 检查，文档限定在 `wiki/` 和 `raw/` 内。文档为 `.md` 或 `.txt`，最大 8 MB；搜索索引 Markdown 知识页。嵌套符号链接目录不建立索引。文件读取支持字符偏移并返回 `nextOffset` 用于分页。来源经过相同检查后打开；缺失或不安全的引用显示错误。

Markdown 中的原始 HTML、内嵌图片和危险链接已禁用。外部 HTTP(S) 链接只在点击后打开。查询 Agent 没有 shell、写入、扩展、外部上下文加载或网页搜索。文档正文属于不可信证据。**查询对话永远只读**——保存/编辑类请求会被拒绝并说明不支持。日志包含请求 ID、工具、时长和错误类别，不含提示词、文档正文或密钥。

### 摄入的写入边界

摄入是独立入口，写入被限制在 staging 副本内，经用户确认后才复制回真实库，共四层围栏：

1. **工具白名单**：摄入 Agent 只开放 Read/Write/Edit/Glob/Grep/WebFetch/Bash；只有只读工具被预批准，WebFetch（仅来源域名）、Bash（仅 `sha256sum`/`shasum` 且禁止命令链接/替换）与全部写入都逐一经过运行时校验；
2. **运行时路径围栏**：每次工具调用前校验写入目标位于 staging 内，越界即拒绝；
3. **staging 隔离**：Agent 只能看见 `wiki/` 与 `raw/` 的临时副本；它在工作区外或删除的文件不会被应用（预览中以提示标出）；
4. **人工确认 + 冲突复查**：应用前逐文件 diff 预览；`apply` 时复查真实库未被外部改动，不符则拒绝。raw 层不可变——同源新版本生成新 raw 文件并存，绝不覆盖。

摄入任务同样只存在于内存中；同一时间仅一个任务，预览闲置 30 分钟自动丢弃。上传文件与来源 URL 会发送给所配置的模型服务方；上传文件先落盘 raw 再编译，模型不搬运文件正文。

Pi SDK 及相关包锁定在 1.1.0；`@anthropic-ai/claude-agent-sdk` 锁定在 0.3.300。`package-lock.json` 已提交，避免传递性升级导致不兼容。

## API

| 端点 | 响应 |
| --- | --- |
| `GET /healthz` | `{ ready: true }`；不调用模型 |
| `GET /api/config` | Wiki ID/名称、模型、协议和摄入可用性；不含密钥或绝对路径 |
| `POST /api/chat` | `{ wikiId, message, sessionId? }`；SSE `session`、`progress`、`delta`、`done` 或 `error` |
| `DELETE /api/chat/:sessionId` | 取消并销毁；204 |
| `GET /api/document?wikiId=default&path=wiki/index.md&offset=0` | 标题、相对路径、正文、偏移、总数和下一偏移 |
| `POST /api/ingest` | JSON `{wikiId, url}` 或 multipart（`wikiId`+`file`）；`202 {jobId, status, notices}`。错误码：`url`/`upload`(400)、`wiki`(400)、`duplicate`/`busy`(409)、`capacity`(429)、`ingest_disabled`(503) |
| `GET /api/ingest/:id/events` | SSE：`status`（含缓冲重放）、`progress`、`delta`、终态 `done {changes,…}` / `status {applied\|discarded}` / `error`；断连不中止任务，可按 id 重连续看 |
| `GET /api/ingest/:id/preview` | 变更清单（路径、added/modified、行数、diff）、摘要、警告与证据校验报告；非预览状态 409 |
| `POST /api/ingest/:id/apply` | `200 {applied:[paths]}`；真实库在预览后被外部改动则 409 `conflict` |
| `DELETE /api/ingest/:id` | 取消运行中任务或丢弃预览并清理 staging；204 |

流开始前的校验错误使用 HTTP 状态码；流开始后的错误使用 SSE `error`。未知/过期会话返回 404，并发生成返回 409。progress 保留工具标识和路径用于内部追踪，并在读取来源后附加可选的 `documentTitle`。界面展示自然语言状态和文档标题，隐藏路径与模型细节，并把错误映射为可执行的提示。来源正文保持原样；模型私有推理过程不会暴露。

## 验证分工

遵循根目录 [CLAUDE.md](../CLAUDE.md)：AI 仅执行 `npm test`（核心单元测试）。Web/API、前端、构建、浏览器和真实模型检查由用户执行。命令、案例、预期结果和当前验证状态见 [TESTING.md](TESTING.md)。

## 许可证

MIT——见仓库 [LICENSE](../LICENSE)。本 Web 应用是 llm-wiki 仓库的一部分，与仓库使用同一许可证。
