import { describe, expect, it } from 'vitest'
import type { Message, Session } from '@got-it/shared'
import { appendMessage, startNewSession } from './session-reducer.js'

const baseSession: Session = {
  id: 'sess_1',
  device_id: 'dev_1',
  started_at: '2026-04-28T12:00:00Z',
  ended_at: null,
  title: null,
}

const userText: Message = {
  id: 'msg_1',
  session_id: 'sess_1',
  kind: 'user_text',
  text: 'hello',
  source: 'text',
  created_at: '2026-04-28T12:00:01Z',
}

describe('appendMessage', () => {
  it('returns new arrays (no mutation)', () => {
    const messages: Message[] = []
    const next = appendMessage(messages, userText)
    expect(messages).toEqual([])
    expect(next).toEqual([userText])
  })

  it('appends in order', () => {
    const m2 = { ...userText, id: 'msg_2', text: 'world' }
    expect(appendMessage(appendMessage([], userText), m2)).toEqual([userText, m2])
  })
})

describe('startNewSession', () => {
  it('builds a session with the given id, device, and timestamp', () => {
    const s = startNewSession({
      id: 'sess_x',
      device_id: 'dev_1',
      now: new Date('2026-04-28T15:00:00Z'),
    })
    expect(s).toEqual({
      id: 'sess_x',
      device_id: 'dev_1',
      started_at: '2026-04-28T15:00:00.000Z',
      ended_at: null,
      title: null,
    })
  })
})

describe('reset semantics', () => {
  it('starting a new session leaves the old session reference unchanged', () => {
    const next = startNewSession({
      id: 'sess_2',
      device_id: 'dev_1',
      now: new Date('2026-04-28T16:00:00Z'),
    })
    expect(baseSession.id).toBe('sess_1')
    expect(next.id).toBe('sess_2')
  })
})
