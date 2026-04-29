import { z } from 'zod'

export const ContextKindSchema = z.enum([
  'browser_article',
  'code',
  'chat',
  'video',
  'doc',
  'unknown',
])

export const ExtractedUrlSchema = z.object({
  href: z.string().url(),
  anchor: z.string().optional(),
  near_text: z.string().optional(),
})

export const RegionSchema = z.object({
  kind: z.enum(['header', 'paragraph', 'code', 'ui', 'media']),
  text: z.string(),
  bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
})

export const AnalysisResultSchema = z.object({
  raw_text: z.string(),
  urls: z.array(ExtractedUrlSchema),
  regions: z.array(RegionSchema),
  context_kind: ContextKindSchema,
  summary: z.string(),
})

export const CaptureSourceSchema = z.enum(['screenshot', 'keybind', 'refresh', 'invoke'])
export const ChatSourceSchema = z.enum(['text', 'mic', 'listen'])

export const CaptureRequestSchema = z.object({
  source: CaptureSourceSchema,
})

export const ChatRequestSchema = z.object({
  text: z.string().min(1),
  source: ChatSourceSchema,
})

export const SaveRequestSchema = z.object({
  instruction: z.string().optional(),
})

export const DeviceRegistrationRequestSchema = z.object({
  install_id: z.string().min(1),
})

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
})

export type CaptureRequest = z.infer<typeof CaptureRequestSchema>
export type ChatRequest = z.infer<typeof ChatRequestSchema>
export type SaveRequest = z.infer<typeof SaveRequestSchema>
export type DeviceRegistrationRequest = z.infer<typeof DeviceRegistrationRequestSchema>
export type AnalysisResultParsed = z.infer<typeof AnalysisResultSchema>
