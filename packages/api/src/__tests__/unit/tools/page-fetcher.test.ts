import { describe, expect, it, vi } from 'vitest'
import { PageFetcher, type PageFetchBackend } from '../../../tools/page-fetcher.js'

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
    const backend: PageFetchBackend = {
      fetch: vi.fn(async (url: string) => {
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
