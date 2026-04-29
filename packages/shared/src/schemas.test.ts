import { describe, expect, it } from 'vitest'
import {
  CaptureRequestSchema,
  ChatRequestSchema,
  SaveRequestSchema,
  AnalysisResultSchema,
} from './api.js'

describe('AnalysisResultSchema', () => {
  it('accepts a fully populated analysis', () => {
    const parsed = AnalysisResultSchema.parse({
      raw_text: 'hello',
      urls: [{ href: 'https://example.com', anchor: 'Example' }],
      regions: [{ kind: 'paragraph', text: 'hello' }],
      context_kind: 'browser_article',
      summary: 'A page',
    })
    expect(parsed.urls[0]?.href).toBe('https://example.com')
  })

  it('rejects an invalid context_kind', () => {
    expect(() =>
      AnalysisResultSchema.parse({
        raw_text: '',
        urls: [],
        regions: [],
        context_kind: 'nope',
        summary: '',
      })
    ).toThrow()
  })
})

describe('ChatRequestSchema', () => {
  it('parses a minimal text chat request', () => {
    const parsed = ChatRequestSchema.parse({ text: 'hi', source: 'text' })
    expect(parsed.source).toBe('text')
  })
})

describe('CaptureRequestSchema', () => {
  it('requires source enum', () => {
    expect(() => CaptureRequestSchema.parse({ source: 'bogus' })).toThrow()
  })
})

describe('SaveRequestSchema', () => {
  it('allows optional instruction', () => {
    expect(SaveRequestSchema.parse({})).toEqual({})
    expect(SaveRequestSchema.parse({ instruction: 'as code' })).toEqual({
      instruction: 'as code',
    })
  })
})
