import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { setupAuthedApp } from '../../helper.js'

/**
 * Integration coverage for session lifecycle routes.
 */
describe('sessions routes', () => {
  it('POST /sessions creates and activates a new session', async () => {
    const { app, token } = await setupAuthedApp({}, { createActiveSession: false })
    const res = await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(201)
    expect(res.body.session_id).toBeTruthy()
    expect(res.body.started_at).toBeTruthy()
  })

  it('GET /sessions/active returns the active session and tail', async () => {
    const { app, token } = await setupAuthedApp({}, { createActiveSession: false })
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    const res = await request(app).get('/sessions/active').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.session.id).toBeTruthy()
    expect(res.body.messages_tail).toEqual([])
  })

  it('POST /sessions/:id/activate sets the given session active', async () => {
    const { app, token } = await setupAuthedApp({}, { createActiveSession: false })
    const r1 = await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    const sid1 = r1.body.session_id
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    const res = await request(app)
      .post(`/sessions/${sid1}/activate`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.session.id).toBe(sid1)
  })

  it('GET /sessions lists newest first', async () => {
    const { app, token } = await setupAuthedApp({}, { createActiveSession: false })
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    const res = await request(app).get('/sessions').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.sessions).toHaveLength(2)
    expect(res.body.sessions[0].started_at >= res.body.sessions[1].started_at).toBe(true)
  })

  it('rejects unauthenticated requests', async () => {
    const { app } = await setupAuthedApp({}, { createActiveSession: false })
    const res = await request(app).get('/sessions/active')
    expect(res.status).toBe(401)
  })
})
