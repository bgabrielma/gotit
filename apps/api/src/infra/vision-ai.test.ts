import { describe, expect, it } from 'vitest'
import { VisionAI } from './vision-ai.js'

describe('VisionAI (Nullable)', () => {
  it('returns the configured analysis on analyze()', async () => {
    const ai = VisionAI.createNull({
      analysis: {
        raw_text: 'hi',
        urls: [{ href: 'https://example.com' }],
        regions: [],
        context_kind: 'browser_article',
        summary: 'a page',
      },
    })
    const result = await ai.analyze({ image: Buffer.from('fake'), prompt: 'p' })
    expect(result.summary).toBe('a page')
    expect(result.urls[0]?.href).toBe('https://example.com')
  })

  it('throws when configured to fail', async () => {
    const ai = VisionAI.createNull({ failure: new Error('vision down') })
    await expect(ai.analyze({ image: Buffer.from('x'), prompt: 'p' })).rejects.toThrow(
      'vision down'
    )
  })
})
