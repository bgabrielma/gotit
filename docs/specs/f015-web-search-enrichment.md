# F015 — Web Search Enrichment

> **Status:** Draft
> **Depends on:** F001 (Screen Capture + Chat MVP)
> **Phase:** Single phase

## 1. Purpose

Enrich chat responses with real-time internet information when the user requests more details or when the model detects unclear/incomplete screenshot content. Uses LLM tool-calling to let the model decide when and what to search.

## 2. Triggers

1. **User-initiated:** The user asks for more details, clarification, or information the model doesn't have.
2. **Model-autonomous:** The model detects that screenshot OCR text is unclear, incomplete, or ambiguous and decides a web search would produce a more accurate response.

In both cases, the model itself decides to invoke the `web_search` tool — no keyword detection or heuristics on the backend.

## 3. Architecture

Entirely server-side in `packages/api`. No client changes. No `packages/core` changes (search is I/O, not pure logic).

### 3.1 New Infrastructure Wrappers

| Component     | File                                      | Responsibility                                       |
| ------------- | ----------------------------------------- | ---------------------------------------------------- |
| `WebSearchAI` | `packages/api/src/infra/web-search-ai.ts` | Queries SearXNG JSON API, returns structured results |
| `PageFetcher` | `packages/api/src/infra/page-fetcher.ts`  | Fetches and extracts text content from URLs          |

Both follow the existing infra wrapper pattern:

- `*.create(...)` — production constructor
- `*.fromBackend(...)` — test injection

### 3.2 Modified Components

| Component  | File                                   | Change                                                                                                         |
| ---------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ChatAI`   | `packages/api/src/infra/chat-ai.ts`    | Add tool-calling support: optional `tools` param, `onToolCall` callback, single-iteration tool resolution loop |
| Chat route | `packages/api/src/routes/chat.ts`      | Wire `WebSearchAI` + `PageFetcher` into `onToolCall` handler                                                   |
| Defaults   | `packages/api/src/prompts/defaults.ts` | New `DEFAULT_WEB_SEARCH_TOOL` export; update `DEFAULT_CHAT_PROMPT` with search awareness                       |
| App deps   | `packages/api/src/app.ts`              | Add `webSearchAI` and `pageFetcher` to `AppDeps`                                                               |
| Config     | `packages/api/src/config.ts`           | Add `GOTIT_SEARXNG_URL` env var (default `http://localhost:8888`)                                              |
| Docker     | `docker-compose.yml`                   | Add SearXNG service                                                                                            |

### 3.3 Data Flow

```
User message
    │
    ▼
chat route
    │
    ▼
ChatAI.complete({ tools: [web_search], onToolCall, ... })
    │
    ▼
LLM response
    ├── text output ──────────────────────► return to client
    └── tool_call: web_search({ query })
         │
         ▼
     WebSearchAI.search(query, maxResults=3)
         │  └── SearXNG JSON API
         ▼
     PageFetcher.fetch(top 3 URLs, parallel)
         │  └── HTTP GET + HTML-to-text, 5s timeout per page
         ▼
     Format tool result (snippets + page content)
         │
         ▼
     ChatAI.complete({ ..., toolResults, tools: [] })
         │  └── No tools = forces final text answer
         ▼
     return to client
```

### 3.4 Constraints

- **Max one search per turn.** After injecting search results, the second LLM call has no tools defined, preventing recursive loops.
- **Page fetch limit:** Top 3 URLs, 5-second timeout each, ~2000 chars extracted per page. Failures silently skipped (partial results are fine).
- **Transparent UX:** No client-side search indicator. Response arrives naturally.
- **Model compatibility:** Requires tool-calling support. Works with OpenAI models and Ollama models that support tools (llama3.1+, mistral, etc.).

## 4. Tool Definition

Defined in `packages/api/src/prompts/defaults.ts` as `DEFAULT_WEB_SEARCH_TOOL`.

```json
{
  "name": "web_search",
  "description": "Search the internet for current information. Use when: the user asks for details you're unsure about, screenshot text is unclear or incomplete, or you need to verify or supplement your knowledge.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The search query to look up"
      }
    },
    "required": ["query"]
  }
}
```

## 5. SearXNG Configuration

Added to `docker-compose.yml` as a service alongside Postgres.

```yaml
searxng:
  image: searxng/searxng:latest
  ports:
    - '8888:8080'
  environment:
    - SEARXNG_BASE_URL=http://localhost:8888
  volumes:
    - ./searxng-settings.yml:/etc/searxng/settings.yml
```

Minimal `searxng-settings.yml`:

- JSON output format enabled
- Engines: google, duckduckgo, brave (meta-search across multiple)
- No UI theming needed (API-only usage)

New env var in `.env.template`:

```
GOTIT_SEARXNG_URL=http://localhost:8888
```

## 6. WebSearchAI

```typescript
export type SearchResult = {
  title: string
  url: string
  snippet: string
}

export interface WebSearchBackend {
  search(query: string, maxResults: number): Promise<SearchResult[]>
}

export class WebSearchAI {
  static create(baseUrl: string): WebSearchAI
  static fromBackend(backend: WebSearchBackend): WebSearchAI

  search(query: string, maxResults?: number): Promise<SearchResult[]>
}
```

SearXNG JSON API call: `GET {baseUrl}/search?q={query}&format=json&engines=google,duckduckgo`

Parse response `results` array, take top `maxResults` entries, map to `SearchResult`.

## 7. PageFetcher

```typescript
export interface PageFetchBackend {
  fetch(url: string): Promise<string>
}

export class PageFetcher {
  static create(): PageFetcher
  static fromBackend(backend: PageFetchBackend): PageFetcher

  fetch(url: string): Promise<string>
  fetchAll(urls: string[], maxConcurrent?: number): Promise<Map<string, string>>
}
```

- HTTP GET with `Accept: text/html`
- 5-second timeout per request
- Strip HTML tags, extract text content (lightweight — `linkedom` or regex)
- Truncate to ~2000 chars per page
- `fetchAll` runs in parallel, returns partial results on individual failures

## 8. ChatAI Changes

Extended `complete()` signature:

```typescript
type ToolDef = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

type ToolCallHandler = (name: string, args: Record<string, string>) => Promise<string>

complete(args: ChatCompleteArgs & {
  tools?: ToolDef[]
  onToolCall?: ToolCallHandler
}): Promise<string>
```

**Resolution flow inside `complete()`:**

1. Call LLM with `tools` (if provided)
2. If response is text → return it (normal path)
3. If response is a tool call → invoke `onToolCall(name, args)`
4. Re-call LLM with original messages + tool result, **no tools** (forces text)
5. Return final text

Single iteration. No recursion.

## 9. Chat Route Wiring

In `chat.ts`, the `onToolCall` handler:

```typescript
const onToolCall = async (name: string, args: Record<string, string>) => {
  if (name !== 'web_search') {
    return 'Unknown tool'
  }
  const results = await deps.webSearchAI.search(args.query, 3)
  const pages = await deps.pageFetcher.fetchAll(results.map((r) => r.url))

  return formatSearchResults(results, pages)
}
```

`formatSearchResults` (defined in `packages/api/src/routes/chat.ts` as a local helper) builds a text block with snippets and page excerpts that becomes the tool result injected back to the LLM. This is a shell-layer formatter — it formats I/O results for LLM consumption, not pure business logic.

## 10. Testing Strategy

All server-side. No client test changes. No core package tests.

### 10.1 Unit Tests

| File                                         | Tests                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `__tests__/unit/infra/web-search-ai.test.ts` | Query passthrough, result formatting, empty results, error handling         |
| `__tests__/unit/infra/page-fetcher.test.ts`  | Text extraction, timeout behavior, partial failures (1/3 fails → returns 2) |

### 10.2 Integration Tests

Extend `__tests__/integration/routes/chat.test.ts`:

| Test Case                      | Behavior                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| LLM requests `web_search`      | Mock ChatAI returns tool call first, text second. Mock WebSearchAI + PageFetcher. Assert enriched response. |
| LLM does not call `web_search` | Normal single round-trip. No regression.                                                                    |
| Search backend failure         | WebSearchAI throws → chat returns response without search (graceful degradation).                           |

### 10.3 Smoke Test

Extend `__tests__/integration/smoke/api.smoke.test.ts`:

- If SearXNG reachable at `GOTIT_SEARXNG_URL`, run a real search and verify structured `SearchResult[]`.

### 10.4 Helper Updates

| Helper                    | Change                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `createWebSearchAIMock()` | New. Returns canned `SearchResult[]`. Same pattern as `createVisionAIMock`.                  |
| `createPageFetcherMock()` | New. Returns canned page text.                                                               |
| `createChatAIMock()`      | Extended to support tool-call simulation (return tool call on first invoke, text on second). |
| `createTestApp()`         | Gains optional `webSearchAI` and `pageFetcher` deps.                                         |

## 11. Terminology

| Spec Term                 | Code Symbol                               |
| ------------------------- | ----------------------------------------- |
| Web search enrichment     | Feature name (F015)                       |
| `web_search`              | Tool name (LLM tool definition)           |
| `WebSearchAI`             | Infrastructure wrapper class              |
| `PageFetcher`             | Infrastructure wrapper class              |
| `SearchResult`            | Type: `{ title, url, snippet }`           |
| `WebSearchBackend`        | Backend interface for test injection      |
| `PageFetchBackend`        | Backend interface for test injection      |
| `DEFAULT_WEB_SEARCH_TOOL` | Tool definition constant in `defaults.ts` |

## 12. Out of Scope

- Client-side search indicator UI
- Search result caching
- User-configurable search engines
- Search history/logging
- Multiple searches per turn
- Core package changes (all I/O stays in shell)

## 13. Sprint Contract

### Success Criteria

- [ ] SearXNG runs in docker-compose alongside Postgres
- [ ] `WebSearchAI` queries SearXNG and returns `SearchResult[]`
- [ ] `PageFetcher` extracts text from URLs with timeout and partial-failure handling
- [ ] `ChatAI.complete()` supports tool-calling with single-iteration resolution
- [ ] Chat route wires tool call to search + fetch pipeline
- [ ] Tool definition and prompt updates in `defaults.ts`
- [ ] Config gains `GOTIT_SEARXNG_URL` with default
- [ ] Unit tests for `WebSearchAI` and `PageFetcher`
- [ ] Integration tests for chat route with tool-call flow
- [ ] Smoke test for live SearXNG connectivity
- [ ] All existing tests pass (no regression)

### Quality Gate

- Minimum score: 7/10
- Scoring: functionality (30%), code quality (20%), test coverage (20%), spec conformance (20%), lint + types (10%)
