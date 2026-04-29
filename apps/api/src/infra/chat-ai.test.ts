import { describe, expect, it } from 'vitest'
import { ChatAI } from './chat-ai.js'

describe('ChatAI (Nullable)', () => {
  it('returns the configured response', async () => {
    const ai = ChatAI.createNull({ responses: ['hello there'] })
    const out = await ai.complete({
      system: 'persona',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(out).toBe('hello there')
  })

  it('cycles through queued responses', async () => {
    const ai = ChatAI.createNull({ responses: ['a', 'b'] })
    const r1 = await ai.complete({ system: 's', messages: [{ role: 'user', content: 'x' }] })
    const r2 = await ai.complete({ system: 's', messages: [{ role: 'user', content: 'y' }] })
    expect([r1, r2]).toEqual(['a', 'b'])
  })

  it('throws when configured to fail', async () => {
    const ai = ChatAI.createNull({ failure: new Error('chat down') })
    await expect(
      ai.complete({ system: 's', messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toThrow('chat down')
  })
})
