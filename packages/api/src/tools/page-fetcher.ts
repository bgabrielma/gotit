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
