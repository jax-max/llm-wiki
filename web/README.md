# Wiki chat Web

A local, single-user chat interface for the repository's `wiki-query` method. Each turn loads `../skills/wiki-query/SKILL.md`, reads the current wiki, and uses only `search_wiki`, `read_document`, and `wiki_relations`. Answers stream over POST/Fetch SSE; citations open in a source panel with relative links and Raw navigation.

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
| `QUERY_TIMEOUT_MS` | `180000` |
| `QUERY_MAX_TOOL_CALLS` | `30` |

The startup check requires readable `wiki/schema.md`, `wiki/index.md`, `wiki/domains/`, `raw/`, and the repository Skill. The app does not automatically read credentials from mobi or the user's Pi settings; to reuse a local Pi setup, explicitly copy its protocol, base URL, model and API key into `.env`. `.env` is ignored by Git. The model catalog uses a 131072-token context ceiling and 8192 maximum output tokens; an endpoint with a smaller limit can reject the request, in which case start a new conversation.

## Behavior and boundaries

Conversations exist only in server and page memory. Refresh or New conversation starts over; idle conversations expire after 30 minutes. One request may run per conversation. Completed Pi messages preserve multi-turn context; each turn uses a fresh isolated Agent and file/relationship view. Stop, disconnect, timeout, tool-budget errors, and provider failures discard the unfinished turn. Already displayed text stays visible with an incomplete status. Retry reuses completed turns only. Automatic model retries and context compaction are disabled.

Only local requests with an allowed Host and Origin are accepted. Development permits the Vite origin on the configured `WEB_PORT`. File tools and the document endpoint share normalization, extension and realpath checks, limiting documents to `wiki/` and `raw/`. Documents can be `.md` or `.txt`, up to 8 MB; search indexes Markdown knowledge pages. Nested symlink directories are not indexed. File reads support character offsets and return `nextOffset` for pagination. Sources open through the same checks; missing or unsafe references show an error.

Raw HTML, embedded images and dangerous links are disabled in Markdown. External HTTP(S) links open only after a click. The Agent has no shell, writes, extensions, external context loading or web search. Document text is untrusted evidence. Requests to save knowledge are unsupported in this entry point. Logs contain request IDs, tools, duration and error categories, without prompts, document bodies or keys.

Pi SDK and its related packages are pinned to 1.1.0, with `package-lock.json` committed. Pinning the whole package family avoids incompatible transitive upgrades.

## API

| Endpoint | Response |
| --- | --- |
| `GET /healthz` | `{ ready: true }`; no model call |
| `GET /api/config` | Wiki ID/name, model and protocol; no secrets or absolute paths |
| `POST /api/chat` | `{ wikiId, message, sessionId? }`; SSE `session`, `progress`, `delta`, `done` or `error` |
| `DELETE /api/chat/:sessionId` | Cancel and destroy; 204 |
| `GET /api/document?wikiId=default&path=wiki/index.md&offset=0` | Title, relative path, text, offset, total and next offset |

Validation errors before the stream use HTTP status codes; errors after streaming begins use SSE `error`. Unknown/expired sessions return 404, concurrent generation 409. Progress retains tool identifiers and paths for internal tracing and adds an optional `documentTitle` after a source is read. The interface shows natural-language status and document titles, hides paths and model details, and maps errors to actionable messages. Source bodies remain unchanged; private model reasoning is never exposed.

## Validation ownership

Following [CLAUDE.md](../CLAUDE.md), AI runs only `npm test` (core unit tests). The user runs Web/API, frontend, build, browser and live-model checks. See [TESTING.md](TESTING.md) for commands, cases, expected results and current verification status.
