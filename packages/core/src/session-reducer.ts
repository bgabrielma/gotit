import type { Message, Session, SessionId, DeviceId } from '@got-it/shared'

export function appendMessage(messages: readonly Message[], next: Message): Message[] {
  return [...messages, next]
}

export function startNewSession(args: { id: SessionId; device_id: DeviceId; now: Date }): Session {
  return {
    id: args.id,
    device_id: args.device_id,
    started_at: args.now.toISOString(),
    ended_at: null,
    title: null,
  }
}
