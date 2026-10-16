# Wiki chat Web

English | [简体中文](README_zh.md)

A local, single-user chat interface for the repository's `wiki-query` method. Each turn loads `../skills/wiki-query/SKILL.md`, reads the current wiki, and uses only `search_wiki`, `read_document`, and `wiki_relations`. Answers stream over POST/Fetch SSE; citations open in a source panel with relative links and Raw navigation.

The interface also offers an **ingest entry point**: provide a source URL or upload a `.md`/`.txt` file and it is compiled into the wiki following the `../skills/wiki-ingest` methodology. Compilation runs in a throwaway staging copy driven by a Claude Agent SDK agent; the result is applied to `WIKI_ROOT` only after a per-file diff preview and manual confirmation — cancelling leaves the real library untouched. Chat stays read-only forever.

## Run locally (user-operated)

Requires Node.js 22.19 or newer. Run these commands from `web/`:

```sh
npm ci
cp -n .env.example .env
# Edit .env: LLM_BASE_URL, LLM_MODEL and LLM_API_KEY are required.
npm run dev
```

The copy command preserves an existing `.env`; skip configuration if it is already complete.
From the repository root, use `npm --prefix web run dev` instead of plain `npm run dev`.

Open `http://127.0.0.1:5174`. Vite proxies API requests to the backend on port 3002. Both servers bind to loopback. To serve a production build:

```sh
npm run build
npm start
```

Open `http://127.0.0.1:3002`. The start command enables production origin restrictions. Restart after changing `.env`. `PORT=3002` fixes the backend/production port and `WEB_PORT=5174` fixes the development page port. Both listeners fail if the configured port is occupied; they never choose the next available port. Keep these two values distinct. For these two port settings, `.env` takes precedence over exported shell variables.

## Using the interface

Ask a question, then continue with follow-up questions in the same conversation.
Progress shows what the app is doing and the document title, for example
“正在阅读《抽奖尝试计数》”. The interface hides file paths, tool names and model details.
Click a citation to read its source, follow related documents, or return to the
previous source. The source panel fills the screen on narrow displays.

Use Stop to keep the answer already displayed, then retry or continue asking.
Start a new conversation after generation stops to clear the current discussion.
Errors use plain language and suggest a next step. Original source bodies remain
unchanged. The app does not save conversations or edit the knowledge base.
Questions and selected evidence are sent to the configured model provider.

The interface follows the browser language on first visit (Chinese or English)
and can be switched from the header; the choice is stored in the browser and
restored on return. Switching does not re-translate streamed answers, past
turns or source bodies, and the wiki name comes from server configuration.
Answers are written in the language of the question.

### Ingest (preview-then-confirm)

The header button “＋ Ingest” opens the ingest dialog (hidden when `INGEST_ENABLED=false` or `LLM_API=openai-completions`). Flow:

1. Enter a source URL or pick a `.md`/`.txt` file (up to `INGEST_MAX_UPLOAD_MB`). Uploads are written straight to raw by the server with their SHA-256; URLs are fetched by the agent via WebFetch and preserved as raw.
2. Deterministic pre-checks run before any model call: a body SHA identical to an existing raw is rejected; a URL matching an existing raw's Source produces a "will coexist as a new version" notice.
3. The agent compiles pages and log entries in a staging copy following wiki-ingest rules, with live progress in the dialog.
4. After compilation every changed file is previewed as a diff (plus the evidence-check report); “Apply” writes them into the wiki, “Discard” cancels. One ingest at a time; if the real library changed after the preview, apply is refused and the ingest must be redone.

## Configuration

| Variable | Default / requirement |
| --- | --- |
| `WIKI_ROOT` | `../examples/demo-wiki`; relative to `web/` in both source and production builds |
| `WIKI_ID` | `default` |
| `WIKI_NAME` | Wiki root directory name |
| `LLM_API` | `anthropic-messages` or `openai-completions` |
| `LLM_BASE_URL` | Required. Anthropic: host root, e.g. `https://api.anthropic.com` (SDK appends `/v1/messages`). OpenAI: API root, e.g. `https://api.openai.com/v1` (SDK appends `/chat/completions`). |
| `LLM_MODEL` | Required; model ID accepted by the configured endpoint |
| `LLM_API_KEY` | Required; server only |
| `PORT` | `3002`; backend and production page port |
| `WEB_PORT` | `5174`; development page port |
| `QUERY_TIMEOUT_MS` | Default `QUERY_MAX_TOOL_CALLS × 15s + 30s` (480000 at the default budget of 30), capped at 3600000; an explicit value takes precedence |
| `QUERY_MAX_TOOL_CALLS` | `30` |
| `INGEST_ENABLED` | `true`; hides the entry point and rejects ingest requests when off |
| `INGEST_MODEL` | Defaults to `LLM_MODEL`; model ID used by the ingest agent, so it can differ from the (lighter) query model |
| `INGEST_MAX_UPLOAD_MB` | `2`; 1–16. Upload size cap (multipart body limit) |
| `INGEST_TIMEOUT_MS` | `1200000`; capped at 3600000. Overall ingest timeout |
| `INGEST_MAX_TURNS` | `80`; 1–500. Ingest agent step budget |
| `INGEST_VALIDATE` | `auto`; `on`/`off` toggles the evidence-check (check_evidence.py) report attached to the preview |

Ingest additionally requires `LLM_API=anthropic-messages` (the Claude Agent SDK only speaks the Anthropic-compatible protocol) and readable `../skills/wiki-ingest/SKILL.md` plus `references/templates.md`; when missing, ingest disables itself and chat keeps working.

The startup check requires readable `wiki/schema.md`, `wiki/index.md`, `wiki/domains/`, `raw/`, and the repository Skill. The app does not automatically read credentials from mobi or the user's Pi settings; to reuse a local Pi setup, explicitly copy its protocol, base URL, model and API key into `.env`. `.env` is ignored by Git. The model catalog uses a 131072-token context ceiling and 8192 maximum output tokens; an endpoint with a smaller limit can reject the request, in which case start a new conversation.

## Behavior and boundaries

Conversations exist only in server and page memory. Refresh or New conversation starts over; idle conversations expire after 30 minutes. One request may run per conversation. Completed Pi messages preserve multi-turn context; each turn uses a fresh isolated Agent and file/relationship view. Stop, disconnect, timeout, tool-budget errors, and provider failures discard the unfinished turn. Already displayed text stays visible with an incomplete status. Retry reuses completed turns only. Automatic model retries and context compaction are disabled.

Only local requests with an allowed Host and Origin are accepted. Development permits the Vite origin on the configured `WEB_PORT`. File tools and the document endpoint share normalization, extension and realpath checks, limiting documents to `wiki/` and `raw/`. Documents can be `.md` or `.txt`, up to 8 MB; search indexes Markdown knowledge pages. Nested symlink directories are not indexed. File reads support character offsets and return `nextOffset` for pagination. Sources open through the same checks; missing or unsafe references show an error.

Raw HTML, embedded images and dangerous links are disabled in Markdown. External HTTP(S) links open only after a click. The query Agent has no shell, writes, extensions, external context loading or web search. Document text is untrusted evidence. **Chat is always read-only** — requests to save or edit are declined with an explanation. Logs contain request IDs, tools, duration and error categories, without prompts, document bodies or keys.

### Ingest write boundaries

Ingest is a separate entry point whose writes are confined to a staging copy until the user confirms, guarded by four fences:

1. **Tool allowlist** — the ingest agent gets only Read/Write/Edit/Glob/Grep/WebFetch/Bash; just the read-only tools are pre-approved, while WebFetch (source domain only), Bash (`sha256sum`/`shasum` only, no chaining or substitution) and every write pass a per-call runtime check;
2. **Runtime path fence** — every tool call is checked before execution; writes outside the staging copy are denied;
3. **Staging isolation** — the agent sees only a temporary copy of `wiki/` and `raw/`; files it writes outside those trees, or deletes, are never applied (flagged as notes in the preview);
4. **Human confirmation + conflict recheck** — a per-file diff preview precedes apply, and apply re-verifies the real library is unchanged, refusing with 409 otherwise. The raw layer is immutable — a new version of the same source becomes a new coexisting raw file, never an overwrite.

Ingest jobs also live in memory only; one at a time, previewing jobs auto-discard after 30 idle minutes. Uploads and source URLs are sent to the configured model provider; uploaded files are written to raw by the server first, so the model never re-transcribes the body.

Pi SDK and its related packages are pinned to 1.1.0; `@anthropic-ai/claude-agent-sdk` is pinned to 0.3.300. `package-lock.json` is committed to avoid incompatible transitive upgrades.

## API

| Endpoint | Response |
| --- | --- |
| `GET /healthz` | `{ ready: true }`; no model call |
| `GET /api/config` | Wiki ID/name, model and protocol; no secrets or absolute paths |
| `POST /api/chat` | `{ wikiId, message, sessionId? }`; SSE `session`, `progress`, `delta`, `done` or `error` |
| `DELETE /api/chat/:sessionId` | Cancel and destroy; 204 |
| `GET /api/document?wikiId=default&path=wiki/index.md&offset=0` | Title, relative path, text, offset, total and next offset |
| `POST /api/ingest` | JSON `{wikiId, url}` or multipart (`wikiId`+`file`); `202 {jobId, status, notices}`. Error codes: `url`/`upload`/`wiki` (400), `duplicate`/`busy` (409), `capacity` (429), `ingest_disabled` (503) |
| `GET /api/ingest/:id/events` | SSE: `status` (with buffered replay), `progress`, `delta`, terminal `done {changes,…}` / `status {applied\|discarded}` / `error`; disconnects never abort the job — reconnect by id |
| `GET /api/ingest/:id/preview` | Change list (path, added/modified, line counts, diff), summary, warnings and the evidence-check report; 409 outside preview |
| `POST /api/ingest/:id/apply` | `200 {applied:[paths]}`; 409 `conflict` if the real library changed after preview |
| `DELETE /api/ingest/:id` | Cancel a running job or discard a preview and clean up staging; 204 |

Validation errors before the stream use HTTP status codes; errors after streaming begins use SSE `error`. Unknown/expired sessions return 404, concurrent generation 409. Progress retains tool identifiers and paths for internal tracing and adds an optional `documentTitle` after a source is read. The interface shows natural-language status and document titles, hides paths and model details, and maps errors to actionable messages. Source bodies remain unchanged; private model reasoning is never exposed.

## Validation ownership

Following [CLAUDE.md](../CLAUDE.md), AI runs only `npm test` (core unit tests). The user runs Web/API, frontend, build, browser and live-model checks. See [TESTING.md](TESTING.md) for commands, cases, expected results and current verification status.

## License

MIT — see the repository [LICENSE](../LICENSE). The web app is part of the llm-wiki repository and shares its license.
