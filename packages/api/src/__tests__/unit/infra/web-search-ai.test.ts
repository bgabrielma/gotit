import { describe, expect, it, vi } from 'vitest'
import {
  WebSearchAI,
  type SearchResult,
  type WebSearchBackend,
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
