# Wiki 对话 Web

简体中文 | [English](README.md)

本仓库 `wiki-query` 方法的本地单用户对话界面。每轮加载 `../skills/wiki-query/SKILL.md`，读取当前 wiki，只使用 `search_wiki`、`read_document` 和 `wiki_relations` 三个工具。回答通过 POST/Fetch SSE 流式返回；引用在中间阅读区打开，支持相对链接与 Raw 导航。

界面还提供**摄入入口**：输入来源 URL 或上传 `.md`/`.txt`/`.docx`/`.pdf`/`.pptx` 文件，按 `../skills/wiki-ingest` 的方法论整理进知识库。编译由 Claude Agent SDK 或本机 Codex CLI 驱动的 Agent 在临时 staging 副本上完成，产物经逐文件 diff 预览、人工确认后才写入 `WIKI_ROOT`，取消则真实库零改动。查询对话保持永远只读。

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
先点击「问知识库」展开问答，点击引用可在中间阅读区阅读来源、跳转关联文档或返回上一页。窄屏下点击引用会收起问答以展示正文。

点击"停止生成"可保留已显示的回答，随后重试或继续提问。
生成结束后再新建对话可清空当前讨论。
错误提示使用通俗语言并建议下一步操作。原始来源正文保持原样。
应用不保存对话，也不修改知识库。
问题与选中的证据会发送给所配置的模型服务方。

界面首次访问时跟随浏览器语言（中文或英文），可从顶栏切换；选择保存在浏览器中，下次访问自动恢复。切换不会重新翻译已流式显示的回答、历史轮次和来源正文，知识库名称来自服务端配置。回答语言跟随提问语言。

### 知识目录与本次更新

默认进入知识库工作区：左侧目录是唯一导航，分类只展开或收起，保留标题与路径筛选。点击文档直接在中间阅读全文；未选择文档时，阅读区仅显示一句低对比度提示：目录展开时为“从左侧目录选择一篇文档”，收起时为“点击左上角‘知识目录’开始阅读”。顶栏右侧依次为“添加资料”“问知识库”和语言切换；正文工具栏仅保留目录开关、文档位置和文档回退。宽屏（≥1280px）默认显示目录，较窄窗口使用抽屉。原始资料、索引与日志位于次级分组。目录扫描实际文件，不依赖索引登记，可手动刷新。

阅读工具栏的「问知识库」按需展开右侧问答，收起后保留对话、草稿及正文阅读位置。点击回答引用在中间打开原文，宽屏保留问答并排；较窄窗口收起问答以展示正文。当前提问始终检索整个知识库，领域、类型和当前文档只影响浏览，不限制问答范围。

点击顶栏「添加资料」摄入，确认后刷新目录并显示新增/更新数量；点击「查看本次更新」展开左侧目录，清空目录筛选并展开、定位本次更新分组，不切换当前正文；点击分组内文档阅读全文。当前阅读页被修改时自动重载。只保留最近一次成功摄入的页面内标记，刷新后清空；不保存历史。目录加载失败可单独重试，左侧更新分组仍显示实际应用的文件，不影响已写入的内容或对话。

`GET /api/catalog?wikiId=…` 返回 `{ pages: [{ path, title, type? }] }`；只包含知识库内可读文档的相对路径与元数据，不含正文或绝对路径。

### 摄入（预览-确认式）

顶栏「添加资料」打开摄入对话框（`INGEST_ENABLED=false` 时隐藏；Claude 引擎在 `LLM_API=openai-completions` 时也隐藏）。流程：

文档解析在独立工作线程中执行，最多同时解析一个文件，限时 60 秒、工作线程堆上限 512 MB；Office 累计解压上限 100 MB，二进制文档提取文本上限 200 万字符。所有上传转换后的 raw Markdown（含来源头）还须符合阅读接口的 8 MB 限制，超出时请拆分资料。损坏、加密、内容不完整、超限或无正文的文件会明确报错，不静默截断。不支持旧版 `.doc/.ppt`；未启用 OCR，扫描 PDF 和图片资料请先识别文字。Word/PPT 的复杂表格恢复以解析库能力为限；PDF 保留可提取的文字和换行，不保证恢复表格与多栏布局。解析在本机完成，提取文本随后按现有流程交给模型编译。

1. 输入来源 URL 或选择 `.md`/`.txt`/`.docx`/`.pdf`/`.pptx` 文件（不超过 `INGEST_MAX_UPLOAD_MB`）。Word、PPT 由服务端通过锁定版本的 `officeparser` 提取正文、标题、列表和表格；PDF 通过锁定版本的 `pdfjs-dist` 提取文本与页码，使用包内本地 CMap 支持中文，不访问 CDN。PPT 保留实际幻灯片顺序；提取文本按 raw 模板保存为 Markdown 并计算 SHA-256（仅在 staging 中保存，确认后写入真实库），不保存原始二进制文件；URL 由 Agent 经 WebFetch 抓取后保存 raw。
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
| `INGEST_ENGINE` | `claude` 或 `codex`；默认 `claude` |
| `CODEX_INGEST_MODEL` | 可选；Codex 专用，留空使用 CLI 默认模型，不沿用 GLM 模型配置 |
| `INGEST_MODEL` | 仅 Claude；默认同 `LLM_MODEL`，可与查询模型区分 |
| `INGEST_MAX_UPLOAD_MB` | `20`；1–100。上传文件大小上限（multipart 请求体限制） |
| `INGEST_TIMEOUT_MS` | 已停用并忽略；摄入无应用层整体超时限制，可手动取消。服务方或 CLI 的网络失败仍会结束任务。 |
| `INGEST_MAX_TURNS` | `80`；1–500。仅 Claude 的步数上限；Codex 无应用层步数或整体超时限制 |
| `INGEST_VALIDATE` | `auto`；`on`/`off` 控制预览附带的证据校验（check_evidence.py）报告 |

Claude 引擎要求 `LLM_API=anthropic-messages`。两个引擎均依赖仓库 `../skills/wiki-ingest/SKILL.md` 与 `references/templates.md` 可读；缺失时摄入任务报错。

临时使用本机 ChatGPT 登录摄入文件：安装 Codex CLI，使用运行后端的同一用户执行 `codex login` 并选择 ChatGPT 登录，在 `.env` 设置 `INGEST_ENGINE=codex` 后重启后端。不复制登录 token 或 API key；查询仍使用 `LLM_*`。Codex 模式仅支持 `.md`/`.txt`/`.docx`/`.pdf`/`.pptx` 上传，URL 输入禁用，API URL 请求返回 400。可选 `CODEX_INGEST_MODEL` 指定模型；留空使用 CLI 默认值。恢复 `INGEST_ENGINE=claude` 即可切回。

适配器要求 Codex CLI 支持 `exec --json`、`--ignore-user-config`、`--ignore-rules` 和 `--ephemeral`（可用 `codex exec --help` 检查）。每次启动忽略用户 provider/规则配置并强制 ChatGPT 登录，保留认证目录；不读取用户自定义模型默认值。CLI 缺失、登录失效或版本不支持时任务失败，详情见后端 `ingest_failed` 日志，不自动回退 Claude。

启动检查要求 `wiki/schema.md`、`wiki/index.md`、`wiki/domains/`、`raw/` 和仓库 Skill 可读。应用不会自动读取 mobi 或用户 Pi 设置中的凭证；要复用本地 Pi 配置，请把协议、Base URL、模型和 API key 显式复制到 `.env`。`.env` 已被 Git 忽略。模型目录按 131072 token 上下文上限和 8192 最大输出 token 配置；端点限额更小时可能拒绝请求，此时请新建对话。

## 行为与边界

对话只存在于服务端和页面内存中。刷新或新建对话都会重新开始；空闲对话 30 分钟后过期。每个对话同时只允许一个请求。已完成的 Pi 消息保留多轮上下文；每轮使用全新的隔离 Agent 和文件/关系视图。停止、断连、超时、工具预算错误和服务方失败都会丢弃未完成的轮次。已显示的文本保留并标记未完成状态。重试只复用已完成的轮次。自动模型重试和上下文压缩均已禁用。

仅接受带合法 Host 和 Origin 的本地请求。开发环境允许配置 `WEB_PORT` 上的 Vite 来源。文件工具与文档端点共用规范化、扩展名和 realpath 检查，文档限定在 `wiki/` 和 `raw/` 内。文档为 `.md` 或 `.txt`，最大 8 MB；搜索索引 Markdown 知识页。嵌套符号链接目录不建立索引。文件读取支持字符偏移并返回 `nextOffset` 用于分页。来源经过相同检查后打开；缺失或不安全的引用显示错误。

Markdown 中的原始 HTML、内嵌图片和危险链接已禁用。外部 HTTP(S) 链接只在点击后打开。查询 Agent 没有 shell、写入、扩展、外部上下文加载或网页搜索。文档正文属于不可信证据。**查询对话永远只读**——保存/编辑类请求会被拒绝并说明不支持。日志包含请求 ID、工具、时长和错误类别，不含提示词、文档正文或密钥。

### 摄入的写入边界

摄入是独立入口，写入被限制在 staging 副本内，经用户确认后才复制回真实库，Claude 引擎使用以下四层检查：

1. **工具白名单**：摄入 Agent 只开放 Read/Write/Edit/Glob/Grep/WebFetch/Bash；不通过 allowedTools 预批准工具，权限回调校验 WebFetch 来源域名、Bash 的摘要计算命令（禁止命令链接/替换）及写入路径；
2. **运行时路径围栏**：每次工具调用前校验写入目标位于 staging 内，越界即拒绝；
3. **staging 隔离**：Agent 只能看见 `wiki/` 与 `raw/` 的临时副本；它在工作区外或删除的文件不会被应用（预览中以提示标出）；
4. **人工确认 + 冲突复查**：应用前逐文件 diff 预览；`apply` 时复查真实库未被外部改动，不符则拒绝。raw 层不可变——同源新版本生成新 raw 文件并存，绝不覆盖。

Codex 引擎使用 `workspace-write` 沙箱限制命令写入 staging，关闭命令网络及 Web 搜索，不额外开放 `/tmp` 写入；不使用 Claude 的逐工具白名单。产物仍经过下述预览与应用检查，手动取消或服务关闭会终止 CLI 进程组后再清理 staging。

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
| `POST /api/ingest` | JSON `{wikiId, url}` 或 multipart（`wikiId`+`file`）；`202 {jobId, status, notices}`。错误码：`url`/`upload`/`upload_format`/`upload_empty`/`upload_encrypted`/`upload_corrupt`/`upload_limit`/`upload_timeout`(400)、`wiki`(400)、上传超限(413)、`duplicate`/`busy`(409)、`capacity`(429)、`ingest_disabled`(503) |
| `GET /api/ingest/:id/events` | SSE：`status`（含缓冲重放）、`progress`、`delta`、终态 `done {changes,…}` / `status {applied\|discarded}` / `error`；断连不中止任务，可按 id 重连续看 |
| `GET /api/ingest/:id/preview` | 变更清单（路径、added/modified、行数、diff）、摘要、警告与证据校验报告；非预览状态 409 |
| `POST /api/ingest/:id/apply` | `200 {applied:[paths]}`；真实库在预览后被外部改动则 409 `conflict` |
| `DELETE /api/ingest/:id` | 取消运行中任务或丢弃预览并清理 staging；204 |

流开始前的校验错误使用 HTTP 状态码；流开始后的错误使用 SSE `error`。未知/过期会话返回 404，并发生成返回 409。progress 保留工具标识和路径用于内部追踪，并在读取来源后附加可选的 `documentTitle`。界面展示自然语言状态和文档标题，隐藏路径与模型细节，并把错误映射为可执行的提示。来源正文保持原样；模型私有推理过程不会暴露。

## 验证分工

遵循根目录 [CLAUDE.md](../CLAUDE.md)：AI 仅执行 `npm test`（核心单元测试）。Web/API、前端、构建、浏览器和真实模型检查由用户执行。命令、案例、预期结果和当前验证状态见 [TESTING.md](TESTING.md)。

## 许可证

MIT——见仓库 [LICENSE](../LICENSE)。本 Web 应用是 llm-wiki 仓库的一部分，与仓库使用同一许可证。

### 按目录切换 Wiki

顶栏点击「切换 Wiki」，浏览子目录、返回上级，或填写绝对路径跳转；可打开「显示隐藏目录」。选择包含 `wiki/schema.md`、`wiki/index.md`、`wiki/domains/` 和 `raw/` 的项目根目录，再点击「使用此目录」。仅支持已有 Wiki，不会创建目录结构。目录浏览只列出实际子目录，符号链接可通过绝对路径输入访问，选择时规范化为真实路径。

切换立即生效，目录、正文、阅读回退、对话、输入和本次更新标记会清空；新的显示名称取目录名。正在问答、上传解析、摄入、应用变更或存在未确认预览时，先完成或取消任务、应用或丢弃预览，再切换。刷新页面或关闭预览后，重新点击「添加资料」可恢复当前未结束的任务，继续应用或丢弃；取消或丢弃失败会保留任务并显示错误。其他标签页使用旧 Wiki 标识时会提示刷新。

最近选择保存在 Git 忽略的 `web/.local/wiki-selection.json`，重启时优先于 `WIKI_ROOT` 恢复；记录损坏或目录失效时输出警告并回退到 `WIKI_ROOT`（未配置时使用示例 Wiki）。首次启动仍沿用 `WIKI_NAME`，恢复或切换后使用目录名。要重新使用环境配置，可在停止服务后删除该选择文件。保存失败不会切换当前 Wiki。服务全局共用一个 Wiki；目录是后端所在电脑的文件夹。

本地接口：`GET /api/config` 包含 `root`；`GET /api/directories?path=<绝对路径>&hidden=true` 返回路径、父目录与子目录；`POST /api/wiki/select` 接收 `{ path, wikiId }` 并返回新的公开配置。切换生成新标识，旧标识返回 `wiki` 错误；接口继续受本地来源限制。
