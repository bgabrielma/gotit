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

    return raw.slice(0, maxResults).map((result) => ({
      title: result.title ?? '',
      url: result.url ?? '',
      snippet: result.content ?? '',
    }))
  }
}
