import { describe, expect, it } from 'vitest'
import { normalizeAnalysisResult } from '../../../infra/vision-ai.js'

describe('normalizeAnalysisResult', () => {
  it('normalizes context kind aliases and region kinds from labels', () => {
    const normalized = normalizeAnalysisResult({
      raw_text: '',
      summary: '',
      context_kind: 'browser_video',
      urls: [],
      regions: [{ label: 'menu bar', text: 'File', bbox: { x: 1, y: 2, w: 3, h: 4 } }],
    }) as {
      context_kind: string
      regions: Array<{
        kind: string
        text: string
        bbox?: { x: number; y: number; w: number; h: number }
      }>
    }

    expect(normalized.context_kind).toBe('video')
    expect(normalized.regions[0]).toEqual({
      label: 'menu bar',
      kind: 'ui',
      text: 'File',
      bbox: { x: 1, y: 2, w: 3, h: 4 },
    })
  })

  it('normalizes urls, drops invalid entries, and deduplicates by href', () => {
    const normalized = normalizeAnalysisResult({
      raw_text: '',
      summary: '',
      context_kind: 'unknown',
      regions: [],
      urls: [
        { href: 'google.com.' },
        { href: 'https://google.com' },
        { href: 'javascript:alert(1)' },
        { href: ' https://docs.example.org/path ', anchor: 'Docs', near_text: 'near' },
        { href: '' },
      ],
    }) as {
      urls: Array<{ href: string; anchor?: string; near_text?: string }>
    }

    expect(normalized.urls).toEqual([
      { href: 'https://google.com/' },
      { href: 'https://docs.example.org/path', anchor: 'Docs', near_text: 'near' },
    ])
  })
})
