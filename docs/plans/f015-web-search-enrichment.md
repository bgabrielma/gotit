# F015 — Web Search Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tool-calling web search to the chat pipeline so the LLM can autonomously search the internet via SearXNG when it needs more information.

**Architecture:** New infra wrappers `WebSearchAI` and `PageFetcher` follow the existing `VisionAI`/`ChatAI` pattern (`.create()` + `.fromBackend()`). `ChatAI.complete()` gains optional tool-calling with a single-iteration resolution loop. The chat route wires a `web_search` tool that queries SearXNG and fetches top page content. All changes are in `packages/api` — no core or client changes.

**Tech Stack:** TypeScript, Express, OpenAI SDK (tool-calling), SearXNG (Docker), Vitest

**Spec:** `docs/specs/f015-web-search-enrichment.md`

---

## File Map

| Action | File                                                             | Responsibility                                      |
| ------ | ---------------------------------------------------------------- | --------------------------------------------------- |
| Create | `packages/api/src/infra/web-search-ai.ts`                        | SearXNG infra wrapper                               |
| Create | `packages/api/src/infra/page-fetcher.ts`                         | URL content extraction infra wrapper                |
| Create | `packages/api/src/__tests__/unit/infra/web-search-ai.test.ts`    | Unit tests for WebSearchAI                          |
| Create | `packages/api/src/__tests__/unit/infra/page-fetcher.test.ts`     | Unit tests for PageFetcher                          |
| Modify | `packages/api/src/infra/chat-ai.ts`                              | Add tool-calling support                            |
| Modify | `packages/api/src/prompts/defaults.ts`                           | Add web search tool definition + update chat prompt |
| Modify | `packages/api/src/config.ts`                                     | Add `GOTIT_SEARXNG_URL`                             |
| Modify | `packages/api/src/app.ts`                                        | Add `webSearchAI` and `pageFetcher` to `AppDeps`    |
| Modify | `packages/api/src/routes/chat.ts`                                | Wire tool-call handler                              |
| Modify | `packages/api/src/server.ts`                                     | Instantiate `WebSearchAI` + `PageFetcher`           |
| Modify | `packages/api/src/__tests__/helper.ts`                           | Add mock factories + update `createTestApp`         |
| Modify | `packages/api/src/__tests__/integration/routes/chat.test.ts`     | Tool-call integration tests                         |
| Modify | `packages/api/src/__tests__/integration/smoke/api.smoke.test.ts` | SearXNG smoke test                                  |
| Modify | `packages/api/src/__tests__/unit/config.test.ts`                 | Test new env var                                    |
| Modify | `docker-compose.yml`                                             | Add SearXNG service                                 |
| Modify | `.env.template`                                                  | Document `GOTIT_SEARXNG_URL`                        |

---

## Wave 1 — Config + Prompts (Tasks 1-2, parallelizable)

> **Parallel execution:** Tasks 1 and 2 are independent. Use `superpowers:dispatching-parallel-agents` to run them simultaneously.

### Task 1: Add `GOTIT_SEARXNG_URL` to Config

**Files:**

- Modify: `packages/api/src/config.ts`
- Modify: `packages/api/src/__tests__/unit/config.test.ts`
- Modify: `.env.template`

- [x] **Step 1.1: Write failing test for new config field**

In `packages/api/src/__tests__/unit/config.test.ts`, add a test:

```typescript
it('parses GOTIT_SEARXNG_URL with default', () => {
  const cfg = loadConfig({
    OPENAI_API_KEY: 'sk-test',
    GOTIT_LLM_CONNECTOR: 'openai',
  })
  expect(cfg.searxngUrl).toBe('http://localhost:8888')
})

it('parses custom GOTIT_SEARXNG_URL', () => {
  const cfg = loadConfig({
    OPENAI_API_KEY: 'sk-test',
    GOTIT_LLM_CONNECTOR: 'openai',
    GOTIT_SEARXNG_URL: 'http://search.internal:9090',
  })
  expect(cfg.searxngUrl).toBe('http://search.internal:9090')
})
```

- [x] **Step 1.2: Run test, expect failure**

Run: `cd packages/api && pnpm test src/__tests__/unit/config.test.ts`
Expected: FAIL — `searxngUrl` does not exist on type `Config`

- [x] **Step 1.3: Add GOTIT_SEARXNG_URL to ConfigSchema and Config type**

In `packages/api/src/config.ts`:

Add to `ConfigSchema` object:

```typescript
GOTIT_SEARXNG_URL: z.string().default('http://localhost:8888'),
```

Add to the `Config` type:

```typescript
searxngUrl: string
```

Add to `loadConfig` return:

```typescript
searxngUrl: parsed.GOTIT_SEARXNG_URL,
```

- [x] **Step 1.4: Run test, expect pass**

Run: `cd packages/api && pnpm test src/__tests__/unit/config.test.ts`
Expected: PASS

- [x] **Step 1.5: Add GOTIT_SEARXNG_URL to .env.template**

Append after the `GOTIT_VAULT_PATH` line block in `.env.template`:

```
# ─── Web Search (SearXNG) ────────────────────────────────────
# Base URL of the SearXNG instance used for web search enrichment.
# Start SearXNG alongside Postgres: docker compose up -d searxng
GOTIT_SEARXNG_URL=http://localhost:8888
```

- [x] **Step 1.6: Commit**

```bash
git add packages/api/src/config.ts packages/api/src/__tests__/unit/config.test.ts .env.template
git commit -m "feat(config): add GOTIT_SEARXNG_URL with default"
```

---

### Task 2: Add Web Search Tool Definition and Update Chat Prompt

**Files:**

- Modify: `packages/api/src/prompts/defaults.ts`

- [x] **Step 2.1: Add DEFAULT_WEB_SEARCH_TOOL_DESCRIPTION to defaults.ts**

In `packages/api/src/prompts/defaults.ts`, add after the existing `DEFAULT_CHAT_PROMPT` export:

```typescript
/**
 * Tool definition for web search, passed to the LLM as a callable tool.
 */
export const DEFAULT_WEB_SEARCH_TOOL = {
  type: 'function' as const,
  name: 'web_search',
  description:
    'Search the internet for current information. Use when: the user asks for details you are unsure about, screenshot text is unclear or incomplete, or you need to verify or supplement your knowledge.',
  parameters: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string' as const,
        description: 'The search query to look up',
      },
    },
    required: ['query'] as const,
  },
}
```

- [x] **Step 2.2: Update DEFAULT_CHAT_PROMPT with search awareness**

In `packages/api/src/prompts/defaults.ts`, update `DEFAULT_CHAT_PROMPT` — add a new behavior line at the end:

```typescript
export const DEFAULT_CHAT_PROMPT = `You are GotIt!, a concise screen-aware second-brain assistant.

Behaviors:
- Reason from the latest screen context provided as text. Do not invent details not present.
- Be terse. Prefer 1-3 sentence answers. Bullet lists when listing.
- When the user asks to save, do not draft the save body — the save layer handles that.
- If the user asks about content not visible, say so plainly.
- Never include raw HTML, never use emojis unless the user does first.
- You have a web_search tool. Use it when the user asks for more details, when screenshot text is unclear, or when you need to verify information.`
```

- [x] **Step 2.3: Commit**

```bash
git add packages/api/src/prompts/defaults.ts
git commit -m "feat(prompts): add web_search tool definition and update chat prompt"
```

---

## Wave 2 — Infrastructure Wrappers (Tasks 3-4, parallelizable)

> **Parallel execution:** Tasks 3 and 4 are independent. Use `superpowers:dispatching-parallel-agents` to run them simultaneously.

### Task 3: WebSearchAI Infrastructure Wrapper

**Files:**

- Create: `packages/api/src/infra/web-search-ai.ts`
- Create: `packages/api/src/__tests__/unit/infra/web-search-ai.test.ts`

- [x] **Step 3.1: Write failing tests for WebSearchAI**

Create `packages/api/src/__tests__/unit/infra/web-search-ai.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import {
  WebSearchAI,
  type WebSearchBackend,
  type SearchResult,
} from '../../../infra/web-search-ai.js'

const SAMPLE_RESULTS: SearchResult[] = [
  { title: 'Example Page', url: 'https://example.com', snippet: 'An example page for testing.' },
  { title: 'Another Page', url: 'https://another.com', snippet: 'Another result.' },
]

describe('WebSearchAI', () => {
  it('delegates search to backend and returns results', async () => {
    const backend: WebSearchBackend = {
      search: vi.fn(async () => SAMPLE_RESULTS),
    }
    const ws = WebSearchAI.fromBackend(backend)

    const results = await ws.search('test query', 3)

    expect(backend.search).toHaveBeenCalledWith('test query', 3)
    expect(results).toEqual(SAMPLE_RESULTS)
  })

  it('returns empty array when backend returns no results', async () => {
    const backend: WebSearchBackend = {
      search: vi.fn(async () => []),
    }
    const ws = WebSearchAI.fromBackend(backend)

    const results = await ws.search('obscure query')

    expect(results).toEqual([])
  })

  it('propagates backend errors', async () => {
    const backend: WebSearchBackend = {
      search: vi.fn(async () => {
        throw new Error('SearXNG unreachable')
      }),
    }
    const ws = WebSearchAI.fromBackend(backend)

    await expect(ws.search('query')).rejects.toThrow('SearXNG unreachable')
  })

  it('defaults maxResults to 3', async () => {
    const backend: WebSearchBackend = {
      search: vi.fn(async () => SAMPLE_RESULTS),
    }
    const ws = WebSearchAI.fromBackend(backend)

    await ws.search('query')

    expect(backend.search).toHaveBeenCalledWith('query', 3)
  })
})
```

- [x] **Step 3.2: Run tests, expect failure**

Run: `cd packages/api && pnpm test src/__tests__/unit/infra/web-search-ai.test.ts`
Expected: FAIL — module not found

- [x] **Step 3.3: Implement WebSearchAI**

Create `packages/api/src/infra/web-search-ai.ts`:

```typescript
export type SearchResult = {
  title: string
  url: string
  snippet: string
}

export interface WebSearchBackend {
  search(query: string, maxResults: number): Promise<SearchResult[]>
}

/**
 * Infrastructure wrapper for web search via SearXNG.
 * Use {@link WebSearchAI.create} in production and {@link WebSearchAI.fromBackend} in tests.
 */
export class WebSearchAI {
  private constructor(private readonly backend: WebSearchBackend) {}

  static create(baseUrl: string): WebSearchAI {
    return new WebSearchAI(new SearXNGBackend(baseUrl))
  }

  static fromBackend(backend: WebSearchBackend): WebSearchAI {
    return new WebSearchAI(backend)
  }

  search(query: string, maxResults = 3): Promise<SearchResult[]> {
    return this.backend.search(query, maxResults)
  }
}

class SearXNGBackend implements WebSearchBackend {
  constructor(private readonly baseUrl: string) {}

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      engines: 'google,duckduckgo',
    })
    const url = `${this.baseUrl}/search?${params.toString()}`

    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!resp.ok) {
      throw new Error(`SearXNG returned ${resp.status}`)
    }

    const body = (await resp.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>
    }
    const raw = body.results ?? []

    return raw.slice(0, maxResults).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.content ?? '',
    }))
  }
}
```

- [x] **Step 3.4: Run tests, expect pass**

Run: `cd packages/api && pnpm test src/__tests__/unit/infra/web-search-ai.test.ts`
Expected: PASS

- [x] **Step 3.5: Run typecheck**

Run: `cd packages/api && pnpm typecheck`
Expected: PASS

- [ ] **Step 3.6: Commit**

```bash
git add packages/api/src/infra/web-search-ai.ts packages/api/src/__tests__/unit/infra/web-search-ai.test.ts
git commit -m "feat(infra): add WebSearchAI wrapper for SearXNG"
```

---

### Task 4: PageFetcher Infrastructure Wrapper

**Files:**

- Create: `packages/api/src/infra/page-fetcher.ts`
- Create: `packages/api/src/__tests__/unit/infra/page-fetcher.test.ts`

- [ ] **Step 4.1: Write failing tests for PageFetcher**

Create `packages/api/src/__tests__/unit/infra/page-fetcher.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { PageFetcher, type PageFetchBackend } from '../../../infra/page-fetcher.js'

describe('PageFetcher', () => {
  it('delegates fetch to backend and returns extracted text', async () => {
    const backend: PageFetchBackend = {
      fetch: vi.fn(async () => 'Extracted page content'),
    }
    const pf = PageFetcher.fromBackend(backend)

    const text = await pf.fetch('https://example.com')

    expect(backend.fetch).toHaveBeenCalledWith('https://example.com')
    expect(text).toBe('Extracted page content')
  })

  it('fetchAll returns results for multiple URLs in parallel', async () => {
    const backend: PageFetchBackend = {
      fetch: vi.fn(async (url: string) => `Content of ${url}`),
    }
    const pf = PageFetcher.fromBackend(backend)

    const results = await pf.fetchAll(['https://a.com', 'https://b.com', 'https://c.com'])

    expect(results.size).toBe(3)
    expect(results.get('https://a.com')).toBe('Content of https://a.com')
    expect(results.get('https://b.com')).toBe('Content of https://b.com')
    expect(results.get('https://c.com')).toBe('Content of https://c.com')
  })

  it('fetchAll skips failed URLs and returns partial results', async () => {
    let callCount = 0
    const backend: PageFetchBackend = {
      fetch: vi.fn(async (url: string) => {
        callCount++
        if (url === 'https://fail.com') throw new Error('timeout')
        return `Content of ${url}`
      }),
    }
    const pf = PageFetcher.fromBackend(backend)

    const results = await pf.fetchAll(['https://ok.com', 'https://fail.com', 'https://also-ok.com'])

    expect(results.size).toBe(2)
    expect(results.has('https://fail.com')).toBe(false)
    expect(results.get('https://ok.com')).toBe('Content of https://ok.com')
    expect(results.get('https://also-ok.com')).toBe('Content of https://also-ok.com')
  })

  it('fetchAll returns empty map when all URLs fail', async () => {
    const backend: PageFetchBackend = {
      fetch: vi.fn(async () => {
        throw new Error('all fail')
      }),
    }
    const pf = PageFetcher.fromBackend(backend)

    const results = await pf.fetchAll(['https://a.com', 'https://b.com'])

    expect(results.size).toBe(0)
  })

  it('propagates error from single fetch', async () => {
    const backend: PageFetchBackend = {
      fetch: vi.fn(async () => {
        throw new Error('network error')
      }),
    }
    const pf = PageFetcher.fromBackend(backend)

    await expect(pf.fetch('https://fail.com')).rejects.toThrow('network error')
  })
})
```

- [ ] **Step 4.2: Run tests, expect failure**

Run: `cd packages/api && pnpm test src/__tests__/unit/infra/page-fetcher.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4.3: Implement PageFetcher**

Create `packages/api/src/infra/page-fetcher.ts`:

```typescript
const MAX_PAGE_CHARS = 2000
const FETCH_TIMEOUT_MS = 5_000

export interface PageFetchBackend {
  fetch(url: string): Promise<string>
}

/**
 * Infrastructure wrapper for fetching and extracting text from web pages.
 * Use {@link PageFetcher.create} in production and {@link PageFetcher.fromBackend} in tests.
 */
export class PageFetcher {
  private constructor(private readonly backend: PageFetchBackend) {}

  static create(): PageFetcher {
    return new PageFetcher(new HttpPageFetchBackend())
  }

  static fromBackend(backend: PageFetchBackend): PageFetcher {
    return new PageFetcher(backend)
  }

  fetch(url: string): Promise<string> {
    return this.backend.fetch(url)
  }

  async fetchAll(urls: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>()
    const settled = await Promise.allSettled(
      urls.map(async (url) => {
        const text = await this.backend.fetch(url)
        return { url, text }
      })
    )
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.set(result.value.url, result.value.text)
      }
    }
    return results
  }
}

class HttpPageFetchBackend implements PageFetchBackend {
  async fetch(url: string): Promise<string> {
    const resp = await fetch(url, {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (!resp.ok) {
      throw new Error(`Page fetch failed: ${resp.status}`)
    }

    const html = await resp.text()
    return stripHtml(html).slice(0, MAX_PAGE_CHARS)
  }
}

/**
 * Strips HTML tags, scripts, styles, and collapses whitespace.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
```

- [ ] **Step 4.4: Run tests, expect pass**

Run: `cd packages/api && pnpm test src/__tests__/unit/infra/page-fetcher.test.ts`
Expected: PASS

- [ ] **Step 4.5: Run typecheck**

Run: `cd packages/api && pnpm typecheck`
Expected: PASS

- [ ] **Step 4.6: Commit**

```bash
git add packages/api/src/infra/page-fetcher.ts packages/api/src/__tests__/unit/infra/page-fetcher.test.ts
git commit -m "feat(infra): add PageFetcher wrapper for URL content extraction"
```

---

## Wave 3 — ChatAI Tool-Calling Support (Task 5, sequential)

### Task 5: Extend ChatAI with Tool-Calling

**Files:**

- Modify: `packages/api/src/infra/chat-ai.ts`

This task extends `ChatAI` and its `OpenAIChatBackend` to support optional tool definitions and a single-iteration tool-call resolution loop. The public `ChatBackend` interface changes to accept optional tool-related args.

- [ ] **Step 5.1: Update ChatBackend interface and ChatAI.complete() signature**

In `packages/api/src/infra/chat-ai.ts`, update the types at the top of the file:

```typescript
import OpenAI from 'openai'
import type { EasyInputMessage, ResponseInput } from 'openai/resources/responses/responses'
import type { Tool } from 'openai/resources/responses/responses'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }
export type ChatCompleteArgs = { system: string; messages: ChatTurn[] }

export type ToolDef = {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ToolCallHandler = (name: string, args: Record<string, string>) => Promise<string>

export type ChatCompleteOptions = {
  tools?: ToolDef[]
  onToolCall?: ToolCallHandler
}

export interface ChatBackend {
  complete(args: ChatCompleteArgs, options?: ChatCompleteOptions): Promise<string>
}
```

Update `ChatAI.complete()`:

```typescript
complete(args: ChatCompleteArgs, options?: ChatCompleteOptions): Promise<string> {
  return this.backend.complete(args, options)
}
```

- [ ] **Step 5.2: Update OpenAIChatBackend to handle tool calls**

Replace the `OpenAIChatBackend.complete()` method:

```typescript
class OpenAIChatBackend implements ChatBackend {
  private readonly client: OpenAI
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseURL?: string
  ) {
    this.client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL })
  }

  async complete(
    { system, messages }: ChatCompleteArgs,
    options?: ChatCompleteOptions
  ): Promise<string> {
    const conversationItems: EasyInputMessage[] = messages.map(
      (message): EasyInputMessage => ({
        role: message.role,
        content: [{ type: 'input_text', text: message.content }],
      })
    )

    const input: ResponseInput = [
      { role: 'developer', content: [{ type: 'input_text', text: system }] },
      ...conversationItems,
    ]

    const tools: Tool[] | undefined = options?.tools?.map((t) => ({
      type: t.type,
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))

    const resp = await this.client.responses.create({
      model: this.model,
      input,
      ...(tools && tools.length > 0 ? { tools } : {}),
    })

    const toolCall = extractToolCall(resp)
    if (toolCall && options?.onToolCall) {
      const toolResult = await options.onToolCall(toolCall.name, toolCall.args)

      const followUpInput: ResponseInput = [
        ...input,
        {
          type: 'function_call',
          id: toolCall.id,
          call_id: toolCall.callId,
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.args),
        } as ResponseInput[number],
        {
          type: 'function_call_output',
          call_id: toolCall.callId,
          output: toolResult,
        } as ResponseInput[number],
      ]

      const followUp = await this.client.responses.create({
        model: this.model,
        input: followUpInput,
      })

      const followUpText = extractOutputText(followUp)
      if (!followUpText) {
        throw new Error('ChatAI: no text output after tool call')
      }
      return followUpText
    }

    const outputText = extractOutputText(resp)
    if (!outputText) {
      throw new Error('ChatAI: no text output')
    }
    return outputText
  }
}
```

- [ ] **Step 5.3: Add extractToolCall helper**

Add after the existing `extractOutputText` function:

```typescript
type ToolCallInfo = {
  id: string
  callId: string
  name: string
  args: Record<string, string>
}

function extractToolCall(payload: unknown): ToolCallInfo | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const output = (payload as { output?: unknown }).output
  if (!Array.isArray(output)) {
    return null
  }
  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const type = (item as { type?: unknown }).type
    if (type === 'function_call') {
      const fc = item as {
        id?: string
        call_id?: string
        name?: string
        arguments?: string
      }
      const name = fc.name ?? ''
      const id = fc.id ?? ''
      const callId = fc.call_id ?? ''
      let args: Record<string, string> = {}
      try {
        args = JSON.parse(fc.arguments ?? '{}') as Record<string, string>
      } catch {
        args = {}
      }
      return { id, callId, name, args }
    }
  }
  return null
}
```

- [ ] **Step 5.4: Run existing tests to verify no regression**

Run: `cd packages/api && pnpm test`
Expected: All existing tests PASS (the `ChatBackend` mock in `helper.ts` still works because `options` is optional)

- [ ] **Step 5.5: Run typecheck**

Run: `cd packages/api && pnpm typecheck`
Expected: PASS

- [ ] **Step 5.6: Commit**

```bash
git add packages/api/src/infra/chat-ai.ts
git commit -m "feat(infra): add tool-calling support to ChatAI with single-iteration resolution"
```

---

## Wave 4 — App Wiring (Tasks 6-7, sequential)

### Task 6: Add WebSearchAI and PageFetcher to AppDeps

**Files:**

- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/__tests__/helper.ts`

- [ ] **Step 6.1: Add imports and deps to app.ts**

In `packages/api/src/app.ts`:

```typescript
import express, { type Express } from 'express'
import type { StoreBackend } from './infra/store.js'
import type { VisionAI } from './infra/vision-ai.js'
import type { ChatAI } from './infra/chat-ai.js'
import type { WebSearchAI } from './infra/web-search-ai.js'
import type { PageFetcher } from './infra/page-fetcher.js'
import { healthRoute } from './routes/health.js'
import { deviceRoute } from './routes/device.js'
import { sessionsRouter } from './routes/sessions.js'
import { captureRouter } from './routes/capture.js'
import { chatRouter } from './routes/chat.js'
import { saveRouter } from './routes/save.js'

export type AppDeps = {
  store: StoreBackend
  visionAI: VisionAI
  chatAI: ChatAI
  webSearchAI: WebSearchAI
  pageFetcher: PageFetcher
  visionPrompt: string
  chatPersonaPrompt: string
  captureFolder: string
  dataDir: string
  version: string
}

export function createApp(deps: AppDeps): Express {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  app.use('/health', healthRoute(deps))
  app.use('/device', deviceRoute(deps))
  app.use('/sessions', sessionsRouter(deps))
  app.use('/capture', captureRouter(deps))
  app.use('/chat', chatRouter(deps))
  app.use('/save', saveRouter(deps))

  return app
}
```

- [ ] **Step 6.2: Add mock factories to helper.ts**

In `packages/api/src/__tests__/helper.ts`, add imports and factory functions:

Add at the top with other imports:

```typescript
import { WebSearchAI, type SearchResult } from '../infra/web-search-ai.js'
import { PageFetcher } from '../infra/page-fetcher.js'
```

Add the `WebSearchAI` and `PageFetcher` fields to `TestAppOptions`:

```typescript
type TestAppOptions = {
  store?: StoreBackend
  visionAI?: VisionAI
  chatAI?: ChatAI
  webSearchAI?: WebSearchAI
  pageFetcher?: PageFetcher
} & Partial<
  Pick<AppDeps, 'visionPrompt' | 'chatPersonaPrompt' | 'captureFolder' | 'dataDir' | 'version'>
>
```

Add after `createChatAIMock`:

```typescript
/**
 * Default search results used by mocked web search backends.
 */
export const DEFAULT_SEARCH_RESULTS: SearchResult[] = []

/**
 * Creates a mocked web search client wrapped in the WebSearchAI infrastructure class.
 */
export function createWebSearchAIMock(
  opts: {
    results?: SearchResult[]
    failure?: Error
  } = {}
): { instance: WebSearchAI; search: ReturnType<typeof vi.fn> } {
  const search = vi.fn(async () => {
    if (opts.failure) {
      throw opts.failure
    }
    return opts.results ?? DEFAULT_SEARCH_RESULTS
  })

  return {
    instance: WebSearchAI.fromBackend({ search }),
    search,
  }
}

/**
 * Creates a mocked page fetcher wrapped in the PageFetcher infrastructure class.
 */
export function createPageFetcherMock(
  opts: {
    pages?: Map<string, string>
    failure?: Error
  } = {}
): { instance: PageFetcher; fetch: ReturnType<typeof vi.fn> } {
  const fetchFn = vi.fn(async (url: string) => {
    if (opts.failure) {
      throw opts.failure
    }
    return opts.pages?.get(url) ?? ''
  })

  return {
    instance: PageFetcher.fromBackend({ fetch: fetchFn }),
    fetch: fetchFn,
  }
}
```

Update `createTestApp` to include the new deps:

```typescript
export function createTestApp(opts: TestAppOptions = {}): Express {
  mkdirSync(TEST_TMP_ROOT, { recursive: true })

  return createApp({
    store: opts.store ?? createFakeStoreBackend(),
    visionAI: opts.visionAI ?? createVisionAIMock().instance,
    chatAI: opts.chatAI ?? createChatAIMock().instance,
    webSearchAI: opts.webSearchAI ?? createWebSearchAIMock().instance,
    pageFetcher: opts.pageFetcher ?? createPageFetcherMock().instance,
    visionPrompt: opts.visionPrompt ?? DEFAULT_VISION_PROMPT,
    chatPersonaPrompt: opts.chatPersonaPrompt ?? DEFAULT_CHAT_PROMPT,
    captureFolder: opts.captureFolder ?? DEFAULT_CAPTURE_FOLDER,
    dataDir: opts.dataDir ?? tmpPath('data'),
    version: opts.version ?? 'test',
  })
}
```

- [ ] **Step 6.3: Run all tests to verify no regression**

Run: `cd packages/api && pnpm test`
Expected: All existing tests PASS

- [ ] **Step 6.4: Commit**

```bash
git add packages/api/src/app.ts packages/api/src/__tests__/helper.ts
git commit -m "feat(app): add webSearchAI and pageFetcher to AppDeps"
```

---

### Task 7: Wire Chat Route with Tool-Call Handler

**Files:**

- Modify: `packages/api/src/routes/chat.ts`

- [ ] **Step 7.1: Add tool-call wiring to chat route**

Replace the contents of `packages/api/src/routes/chat.ts`:

```typescript
import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { ChatRequestSchema } from '@got-it/shared'
import { buildChatRequest } from '@got-it/core'
import type { Message } from '@got-it/shared'
import type { AppDeps } from '../app.js'
import type { ChatCompleteOptions, ToolCallHandler } from '../infra/chat-ai.js'
import type { SearchResult } from '../infra/web-search-ai.js'
import { DEFAULT_WEB_SEARCH_TOOL } from '../prompts/defaults.js'
import { deviceAuth } from '../middleware/auth.js'

export function chatRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))

  r.post('/', async (req, res) => {
    const parsed = ChatRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message })
      return
    }
    if (parsed.data.source !== 'text') {
      res.status(400).json({ error: 'only source=text is supported in Phase 1a' })
      return
    }
    const device = req.device!
    const session = await deps.store.getActiveSession(device.id)
    if (!session) {
      res.status(409).json({ error: 'no active session' })
      return
    }

    const userMessage: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'user_text',
      text: parsed.data.text,
      source: 'text',
      created_at: new Date().toISOString(),
    }
    await deps.store.appendMessage(userMessage)

    const tail = await deps.store.listMessages({ session_id: session.id, limit: 50 })
    const payload = buildChatRequest({
      personaPrompt: deps.chatPersonaPrompt,
      messagesTail: tail.slice(0, -1),
      userMessage,
    })

    const onToolCall: ToolCallHandler = async (name, args) => {
      if (name !== 'web_search') {
        return 'Unknown tool'
      }
      const results = await deps.webSearchAI.search(args.query, 3)
      const pages = await deps.pageFetcher.fetchAll(results.map((r) => r.url))
      return formatSearchResults(results, pages)
    }

    const options: ChatCompleteOptions = {
      tools: [DEFAULT_WEB_SEARCH_TOOL],
      onToolCall,
    }

    let assistantText: string
    try {
      assistantText = await deps.chatAI.complete(payload, options)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'chat failure'
      res.status(502).json({ error: msg })
      return
    }

    const assistant: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'assistant',
      text: assistantText,
      created_at: new Date().toISOString(),
    }
    await deps.store.appendMessage(assistant)
    res.status(201).json({ message_id: userMessage.id, assistant_message: assistant })
  })

  return r
}

function formatSearchResults(results: SearchResult[], pages: Map<string, string>): string {
  const sections = results.map((r) => {
    const pageContent = pages.get(r.url)
    const pageBlock = pageContent ? `\nPage content:\n${pageContent}` : ''
    return `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}${pageBlock}`
  })
  return `Web search results:\n\n${sections.join('\n\n---\n\n')}`
}
```

- [ ] **Step 7.2: Run all tests**

Run: `cd packages/api && pnpm test`
Expected: All tests PASS (existing chat tests still pass because `createChatAIMock` backend ignores the options arg)

- [ ] **Step 7.3: Run typecheck**

Run: `cd packages/api && pnpm typecheck`
Expected: PASS

- [ ] **Step 7.4: Commit**

```bash
git add packages/api/src/routes/chat.ts
git commit -m "feat(chat): wire web_search tool-call handler into chat route"
```

---

## Wave 5 — Server Startup + Docker (Tasks 8-9, parallelizable)

> **Parallel execution:** Tasks 8 and 9 are independent. Use `superpowers:dispatching-parallel-agents` to run them simultaneously.

### Task 8: Wire Server Startup

**Files:**

- Modify: `packages/api/src/server.ts`

- [ ] **Step 8.1: Add WebSearchAI and PageFetcher to server.ts**

Update `packages/api/src/server.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { loadServerConfig } from './config.js'
import { ChatAI } from './infra/chat-ai.js'
import { LLMConnectorConfig } from './infra/llm-connector-config.js'
import { PageFetcher } from './infra/page-fetcher.js'
import { Store } from './infra/store.js'
import { VisionAI } from './infra/vision-ai.js'
import { WebSearchAI } from './infra/web-search-ai.js'
import { DEFAULT_CHAT_PROMPT, DEFAULT_VISION_PROMPT } from './prompts/defaults.js'

const cfg = loadServerConfig(import.meta.url)
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
  version: string
}

async function main(): Promise<void> {
  const store = await Store.create({
    databaseUrl: cfg.databaseUrl,
    migrationsDir: resolve(pkgRoot, 'migrations'),
  })
  const llm = LLMConnectorConfig.fromConfig(cfg)

  const app = createApp({
    store,
    visionAI: VisionAI.create(llm),
    chatAI: ChatAI.create(llm),
    webSearchAI: WebSearchAI.create(cfg.searxngUrl),
    pageFetcher: PageFetcher.create(),
    visionPrompt: DEFAULT_VISION_PROMPT,
    chatPersonaPrompt: DEFAULT_CHAT_PROMPT,
    captureFolder: 'GotIt!',
    dataDir: cfg.dataDir,
    version: pkg.version,
  })

  app.listen(cfg.port, () => {
    console.warn(`got-it api listening on ${cfg.port}`)
  })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 8.2: Run typecheck**

Run: `cd packages/api && pnpm typecheck`
Expected: PASS

- [ ] **Step 8.3: Commit**

```bash
git add packages/api/src/server.ts
git commit -m "feat(server): wire WebSearchAI and PageFetcher at startup"
```

---

### Task 9: Add SearXNG to Docker Compose

**Files:**

- Modify: `docker-compose.yml`
- Create: `searxng-settings.yml`

- [ ] **Step 9.1: Create SearXNG settings file**

Create `searxng-settings.yml` at the repo root:

```yaml
use_default_settings: true
server:
  secret_key: 'gotit-dev-searxng-key'
  limiter: false
search:
  formats:
    - json
    - html
engines:
  - name: google
    engine: google
    shortcut: g
  - name: duckduckgo
    engine: duckduckgo
    shortcut: ddg
```

- [ ] **Step 9.2: Add SearXNG service to docker-compose.yml**

Add the `searxng` service after the `api` service and before the `volumes:` section:

```yaml
searxng:
  image: searxng/searxng:latest
  restart: unless-stopped
  ports:
    - '${SEARXNG_PORT:-8888}:8080'
  volumes:
    - ./searxng-settings.yml:/etc/searxng/settings.yml:ro
  healthcheck:
    test: ['CMD', 'wget', '--spider', '-q', 'http://localhost:8080/healthz']
    interval: 10s
    timeout: 5s
    retries: 5
```

Update the `api` service environment to include `GOTIT_SEARXNG_URL`:

Add this line to the `api.environment` section:

```yaml
GOTIT_SEARXNG_URL: http://searxng:8080
```

Add `searxng` to the `api.depends_on` section:

```yaml
depends_on:
  postgres:
    condition: service_healthy
  searxng:
    condition: service_healthy
```

- [ ] **Step 9.3: Commit**

```bash
git add docker-compose.yml searxng-settings.yml
git commit -m "feat(docker): add SearXNG service for web search"
```

---

## Wave 6 — Integration + Smoke Tests (Tasks 10-11, parallelizable)

> **Parallel execution:** Tasks 10 and 11 are independent. Use `superpowers:dispatching-parallel-agents` to run them simultaneously.

### Task 10: Chat Route Integration Tests for Tool-Calling

**Files:**

- Modify: `packages/api/src/__tests__/integration/routes/chat.test.ts`

- [ ] **Step 10.1: Add tool-call integration tests**

Append to the existing `describe('POST /chat', ...)` block in `packages/api/src/__tests__/integration/routes/chat.test.ts`:

First, update the import at the top to include the new mock factories:

```typescript
import { describe, expect, it } from 'vitest'
import request from 'supertest'
import {
  createChatAIMock,
  createWebSearchAIMock,
  createPageFetcherMock,
  setupAuthedApp,
} from '../../helper.js'
import {
  ChatAI,
  type ChatBackend,
  type ChatCompleteArgs,
  type ChatCompleteOptions,
} from '../../../infra/chat-ai.js'
```

Add a helper that simulates tool-call behavior:

```typescript
function createToolCallChatMock(opts: {
  toolCallArgs?: Record<string, string>
  finalResponse: string
}): { instance: ChatAI; complete: ReturnType<typeof import('vitest').vi.fn> } {
  let callCount = 0
  const complete = vi.fn(async (_args: ChatCompleteArgs, options?: ChatCompleteOptions) => {
    callCount++
    if (callCount === 1 && options?.onToolCall) {
      const toolResult = await options.onToolCall(
        'web_search',
        opts.toolCallArgs ?? { query: 'test query' }
      )
      return opts.finalResponse
    }
    return opts.finalResponse
  })

  return {
    instance: ChatAI.fromBackend({ complete } as ChatBackend),
    complete,
  }
}
```

Add the new test cases (import `vi` at top):

```typescript
import { describe, expect, it, vi } from 'vitest'
```

```typescript
it('returns enriched response when LLM invokes web_search tool', async () => {
  const searchMock = createWebSearchAIMock({
    results: [{ title: 'Result 1', url: 'https://example.com', snippet: 'Example snippet' }],
  })
  const pageMock = createPageFetcherMock({
    pages: new Map([['https://example.com', 'Full page content here']]),
  })
  const chatMock = createToolCallChatMock({
    toolCallArgs: { query: 'what is example.com' },
    finalResponse: 'Based on my search, example.com is a test domain.',
  })

  const { app, token } = await setupAuthedApp({
    chatAI: chatMock.instance,
    webSearchAI: searchMock.instance,
    pageFetcher: pageMock.instance,
  })

  const res = await request(app)
    .post('/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({ text: 'Tell me about example.com', source: 'text' })

  expect(res.status).toBe(201)
  expect(res.body.assistant_message.text).toBe('Based on my search, example.com is a test domain.')
})

it('returns normal response when LLM does not invoke web_search', async () => {
  const { app, token } = await setupAuthedApp({
    chatAI: createChatAIMock({ responses: ['Simple reply'] }).instance,
  })

  const res = await request(app)
    .post('/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({ text: 'hello', source: 'text' })

  expect(res.status).toBe(201)
  expect(res.body.assistant_message.text).toBe('Simple reply')
})

it('returns response even when search backend fails', async () => {
  const searchMock = createWebSearchAIMock({
    failure: new Error('SearXNG down'),
  })
  const chatMock = createChatAIMock({ responses: ['Fallback reply'] })

  const { app, token } = await setupAuthedApp({
    chatAI: chatMock.instance,
    webSearchAI: searchMock.instance,
  })

  const res = await request(app)
    .post('/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({ text: 'search for something', source: 'text' })

  expect(res.status).toBe(201)
  expect(res.body.assistant_message.text).toBe('Fallback reply')
})
```

- [ ] **Step 10.2: Run integration tests**

Run: `cd packages/api && pnpm test src/__tests__/integration/routes/chat.test.ts`
Expected: PASS

- [ ] **Step 10.3: Run all tests**

Run: `cd packages/api && pnpm test`
Expected: All PASS

- [ ] **Step 10.4: Commit**

```bash
git add packages/api/src/__tests__/integration/routes/chat.test.ts
git commit -m "test(chat): add integration tests for web_search tool-call flow"
```

---

### Task 11: SearXNG Smoke Test

**Files:**

- Modify: `packages/api/src/__tests__/integration/smoke/api.smoke.test.ts`

- [ ] **Step 11.1: Add SearXNG connectivity smoke test**

Append a new `describe` block at the end of `api.smoke.test.ts`:

```typescript
import { WebSearchAI } from '../../../infra/web-search-ai.js'
import { loadConfig } from '../../../config.js'
```

Add the `loadConfig` import if not already present (it is), and add:

```typescript
describe('SearXNG smoke integration', () => {
  const cfg = loadConfig(process.env)

  it('queries SearXNG and returns structured results', async () => {
    const ws = WebSearchAI.create(cfg.searxngUrl)

    const results = await ws.search('typescript programming language', 3)

    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(3)
    for (const r of results) {
      expect(typeof r.title).toBe('string')
      expect(typeof r.url).toBe('string')
      expect(typeof r.snippet).toBe('string')
      expect(r.url).toMatch(/^https?:\/\//)
    }
  }, 30_000)
})
```

- [ ] **Step 11.2: Run smoke tests (requires SearXNG running)**

Run: `cd packages/api && pnpm test src/__tests__/integration/smoke/api.smoke.test.ts`
Expected: PASS if SearXNG is running at `GOTIT_SEARXNG_URL`, FAIL/SKIP otherwise

- [ ] **Step 11.3: Commit**

```bash
git add packages/api/src/__tests__/integration/smoke/api.smoke.test.ts
git commit -m "test(smoke): add SearXNG connectivity smoke test"
```

---

## Wave 7 — Final Validation (Task 12, sequential)

### Task 12: Full Validation Pass

- [ ] **Step 12.1: Run full typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages

- [ ] **Step 12.2: Run full lint**

Run: `pnpm lint`
Expected: PASS, zero warnings

- [ ] **Step 12.3: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 12.4: Verify no core package contamination**

Run: `pnpm purity-check`
Expected: PASS — no I/O in `packages/core/`

- [ ] **Step 12.5: Verify spec terminology conformance**

Verify the following terms appear in code matching the spec:

- `WebSearchAI` class in `packages/api/src/infra/web-search-ai.ts`
- `PageFetcher` class in `packages/api/src/infra/page-fetcher.ts`
- `SearchResult` type in `packages/api/src/infra/web-search-ai.ts`
- `WebSearchBackend` interface in `packages/api/src/infra/web-search-ai.ts`
- `PageFetchBackend` interface in `packages/api/src/infra/page-fetcher.ts`
- `DEFAULT_WEB_SEARCH_TOOL` in `packages/api/src/prompts/defaults.ts`
- `web_search` tool name in prompt definition
- `searxngUrl` in Config type

Run:

```bash
grep -n "WebSearchAI" packages/api/src/infra/web-search-ai.ts
grep -n "PageFetcher" packages/api/src/infra/page-fetcher.ts
grep -n "SearchResult" packages/api/src/infra/web-search-ai.ts
grep -n "WebSearchBackend" packages/api/src/infra/web-search-ai.ts
grep -n "PageFetchBackend" packages/api/src/infra/page-fetcher.ts
grep -n "DEFAULT_WEB_SEARCH_TOOL" packages/api/src/prompts/defaults.ts
grep -n "web_search" packages/api/src/prompts/defaults.ts
grep -n "searxngUrl" packages/api/src/config.ts
```

Expected: All terms found at expected locations.
