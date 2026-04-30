import OpenAI from 'openai'
import type { AnalysisResult } from '@got-it/shared'
import { AnalysisResultSchema } from '@got-it/shared'
import type { ResponseInput } from 'openai/resources/responses/responses'

export type VisionAnalyzeArgs = { image: Buffer; prompt: string }

export interface VisionBackend {
  analyze(args: VisionAnalyzeArgs): Promise<AnalysisResult>
}

/**
 * Infrastructure wrapper for vision analysis.
 * Use {@link VisionAI.create} in production and {@link VisionAI.fromBackend} in tests.
 */
export class VisionAI {
  private constructor(private readonly backend: VisionBackend) {}

  /**
   * Creates a vision client backed by the configured OpenAI-compatible runtime.
   */
  static create(args: { apiKey: string; model: string; baseURL?: string }): VisionAI {
    const backend = new OpenAIVisionBackend(args.apiKey, args.model, args.baseURL)
    return new VisionAI(backend)
  }

  /**
   * Creates a vision client from an injected backend.
   */
  static fromBackend(backend: VisionBackend): VisionAI {
    return new VisionAI(backend)
  }

  /**
   * Executes a vision analysis request.
   */
  analyze(args: VisionAnalyzeArgs): Promise<AnalysisResult> {
    return this.backend.analyze(args)
  }
}

class OpenAIVisionBackend implements VisionBackend {
  private readonly client: OpenAI
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseURL?: string
  ) {
    this.client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL })
  }

  async analyze({ image, prompt }: VisionAnalyzeArgs): Promise<AnalysisResult> {
    const input: ResponseInput = [
      {
        role: 'developer',
        content: [{ type: 'input_text', text: prompt }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_image',
            image_url: `data:image/png;base64,${image.toString('base64')}`,
            detail: 'high',
          },
        ],
      },
    ]

    const response = await this.client.responses.create({
      model: this.model,
      input,
      text: {
        format: {
          type: 'json_schema',
          name: 'analysis_result',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              raw_text: { type: 'string' },
              urls: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: { href: { type: 'string' } },
                  required: ['href'],
                },
              },
              regions: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    kind: {
                      type: 'string',
                      enum: ['header', 'paragraph', 'code', 'ui', 'media'],
                    },
                    text: { type: 'string' },
                    bbox: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                        w: { type: 'number' },
                        h: { type: 'number' },
                      },
                      required: ['x', 'y', 'w', 'h'],
                    },
                  },
                  required: ['kind', 'text'],
                },
              },
              context_kind: {
                type: 'string',
                enum: ['browser_article', 'code', 'chat', 'video', 'doc', 'unknown'],
              },
              summary: { type: 'string' },
            },
            required: ['raw_text', 'urls', 'regions', 'context_kind', 'summary'],
          },
        },
      },
    })
    const outputText = extractOutputText(response)
    if (!outputText) {
      throw new Error('VisionAI: no text output')
    }

    const json = JSON.parse(outputText)
    const normalized = normalizeAnalysisResult(json)
    return AnalysisResultSchema.parse(normalized)
  }
}

/**
 * Extracts plain text from an OpenAI responses payload.
 */
function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const direct = (payload as { output_text?: unknown }).output_text
  if (typeof direct === 'string' && direct.length > 0) {
    return direct
  }
  const output = (payload as { output?: unknown }).output
  if (!Array.isArray(output)) {
    return null
  }
  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) {
      continue
    }
    for (const part of content) {
      if (!part || typeof part !== 'object') {
        continue
      }
      const type = (part as { type?: unknown }).type
      const text = (part as { text?: unknown }).text
      if (type === 'output_text' && typeof text === 'string' && text.length > 0) {
        return text
      }
    }
  }
  return null
}

/**
 * Normalizes connector responses into the canonical analysis shape.
 */
export function normalizeAnalysisResult(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value
  }

  const obj = value as {
    context_kind?: unknown
    regions?: unknown
    urls?: unknown
  }

  const normalizedContextKind = normalizeContextKind(obj.context_kind)
  const normalizedRegions = normalizeRegions(obj.regions)
  const normalizedUrls = normalizeUrls(obj.urls)

  return {
    ...obj,
    context_kind: normalizedContextKind,
    regions: normalizedRegions,
    urls: normalizedUrls,
  }
}

/**
 * Maps provider-specific context aliases into canonical shared enum values.
 */
function normalizeContextKind(value: unknown): string {
  if (typeof value !== 'string') {
    return 'unknown'
  }

  const aliases: Record<string, string> = {
    browser_code: 'code',
    browser_video: 'video',
    pdf_document: 'doc',
    terminal: 'code',
    desktop: 'unknown',
    slides: 'doc',
    design_canvas: 'unknown',
  }

  const aliased = aliases[value]
  if (aliased !== undefined) {
    return aliased
  }

  return value
}

/**
 * Normalizes region payloads and infers missing kinds.
 */
function normalizeRegions(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((region): Record<string, unknown> => {
    if (!region || typeof region !== 'object') {
      return { kind: 'paragraph', text: '' }
    }

    const regionObj = region as Record<string, unknown>
    const kind =
      typeof regionObj.kind === 'string' ? regionObj.kind : deriveRegionKind(regionObj.label)
    const text = typeof regionObj.text === 'string' ? regionObj.text : ''
    const bbox = normalizeBbox(regionObj.bbox)

    return bbox ? { ...regionObj, kind, text, bbox } : { ...regionObj, kind, text }
  })
}

/**
 * Normalizes and deduplicates URL objects from provider output.
 */
function normalizeUrls(
  value: unknown
): Array<{ href: string; anchor?: string; near_text?: string }> {
  if (!Array.isArray(value)) {
    return []
  }

  const out: Array<{ href: string; anchor?: string; near_text?: string }> = []
  const seen = new Set<string>()

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const hrefRaw = (item as Record<string, unknown>).href
    const anchorRaw = (item as Record<string, unknown>).anchor
    const nearTextRaw = (item as Record<string, unknown>).near_text
    if (typeof hrefRaw !== 'string') {
      continue
    }

    const href = normalizeHref(hrefRaw)
    if (!href || seen.has(href)) {
      continue
    }

    seen.add(href)
    const urlObj: { href: string; anchor?: string; near_text?: string } = { href }
    if (typeof anchorRaw === 'string' && anchorRaw.length > 0) {
      urlObj.anchor = anchorRaw
    }
    if (typeof nearTextRaw === 'string' && nearTextRaw.length > 0) {
      urlObj.near_text = nearTextRaw
    }
    out.push(urlObj)
  }

  return out
}

function normalizeHref(href: string): string | null {
  const trimmed = href.trim().replace(/[.,;:!?)\]]+$/, '')
  if (trimmed.length === 0) {
    return null
  }

  const withScheme =
    trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(withScheme)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function deriveRegionKind(label: unknown): string {
  if (typeof label !== 'string') {
    return 'paragraph'
  }
  const normalized = label.toLowerCase()
  if (normalized.includes('header') || normalized.includes('title')) {
    return 'header'
  }
  if (normalized.includes('code') || normalized.includes('terminal')) {
    return 'code'
  }
  if (
    normalized.includes('ui') ||
    normalized.includes('button') ||
    normalized.includes('input') ||
    normalized.includes('menu')
  ) {
    return 'ui'
  }
  if (
    normalized.includes('image') ||
    normalized.includes('video') ||
    normalized.includes('media')
  ) {
    return 'media'
  }
  return 'paragraph'
}

function normalizeBbox(value: unknown): { x: number; y: number; w: number; h: number } | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const bbox = value as Record<string, unknown>
  const x = typeof bbox.x === 'number' ? bbox.x : undefined
  const y = typeof bbox.y === 'number' ? bbox.y : undefined
  const w = typeof bbox.w === 'number' ? bbox.w : undefined
  const h = typeof bbox.h === 'number' ? bbox.h : undefined

  if (x === undefined || y === undefined || w === undefined || h === undefined) {
    return undefined
  }
  return { x, y, w, h }
}
