export type ISODate = string

export type SessionId = string
export type MessageId = string
export type DeviceId = string

export type ContextKind = 'browser_article' | 'code' | 'chat' | 'video' | 'doc' | 'unknown'

export type BBox = { x: number; y: number; w: number; h: number }

export type ExtractedUrl = {
  href: string
  anchor?: string
  near_text?: string
}

export type Region = {
  kind: 'header' | 'paragraph' | 'code' | 'ui' | 'media'
  text: string
  bbox?: BBox
}

export type AnalysisResult = {
  raw_text: string
  urls: ExtractedUrl[]
  regions: Region[]
  context_kind: ContextKind
  summary: string
}

export type CaptureSource = 'screenshot' | 'keybind' | 'refresh' | 'invoke'
export type ChatSource = 'text' | 'mic' | 'listen'
export type MessageSource = CaptureSource | ChatSource

export type Session = {
  id: SessionId
  device_id: DeviceId
  started_at: ISODate
  ended_at: ISODate | null
  title: string | null
}

export type MessageBase = {
  id: MessageId
  session_id: SessionId
  created_at: ISODate
}

export type Message =
  | (MessageBase & { kind: 'user_text'; text: string; source: ChatSource })
  | (MessageBase & {
      kind: 'screen_capture'
      image_ref: string
      analysis: AnalysisResult
      source: CaptureSource
    })
  | (MessageBase & { kind: 'assistant'; text: string })
  | (MessageBase & { kind: 'save_record'; vault_path: string; instruction?: string })
  | (MessageBase & { kind: 'system'; text: string })
