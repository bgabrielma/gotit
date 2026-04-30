import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createChatAIMock, setupAuthedApp } from '../../helper.js'

/**
 * Creates an authenticated app/session pair for chat route tests.
 */
async function setup(chatResponse = 'reply') {
  const chatMock = createChatAIMock({ responses: [chatResponse] })
  return setupAuthedApp({
    chatAI: chatMock.instance,
  })
}

/**
 * Integration coverage for chat route behavior.
 */
describe('POST /chat', () => {
  it('appends user message, returns assistant reply', async () => {
    const { app, token } = await setup('hello back')
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'hello', source: 'text' })
    expect(res.status).toBe(201)
    expect(res.body.assistant_message.text).toBe('hello back')
  })

  it('rejects empty text', async () => {
    const { app, token } = await setup()
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '', source: 'text' })
    expect(res.status).toBe(400)
  })

  it('rejects mic/listen sources in Phase 1a (deferred to 1b/1c)', async () => {
    const { app, token } = await setup()
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'voice text', source: 'mic' })
    expect(res.status).toBe(400)
  })
})
