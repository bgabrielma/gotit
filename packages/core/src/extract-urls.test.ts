import { describe, expect, it } from 'vitest'
import { extractUrls } from './extract-urls.js'

describe('extractUrls', () => {
  it('extracts a single bare URL', () => {
    expect(extractUrls('Check out https://example.com today')).toEqual(['https://example.com'])
  })

  it('deduplicates repeated URLs preserving first-seen order', () => {
    const text = 'see https://a.com and https://b.com and again https://a.com'
    expect(extractUrls(text)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('handles trailing punctuation', () => {
    expect(extractUrls('Visit https://example.com.')).toEqual(['https://example.com'])
    expect(extractUrls('Visit (https://example.com),')).toEqual(['https://example.com'])
  })

  it('returns an empty array when no URLs are present', () => {
    expect(extractUrls('plain text only')).toEqual([])
  })

  it('ignores ftp:// and other non-http schemes', () => {
    expect(extractUrls('grab ftp://files/x and https://ok.com')).toEqual(['https://ok.com'])
  })
})
