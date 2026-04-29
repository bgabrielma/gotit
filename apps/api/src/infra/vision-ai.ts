import Anthropic from '@anthropic-ai/sdk'
import type { AnalysisResult } from '@got-it/shared'
import { AnalysisResultSchema } from '@got-it/shared'

export type VisionAnalyzeArgs = { image: Buffer; prompt: string }

export interface VisionBackend {
  analyze(args: VisionAnalyzeArgs): Promise<AnalysisResult>
}

export type NullableVisionConfig = {
  analysis?: AnalysisResult
  failure?: Error
}

export class VisionAI {
  private constructor(private readonly backend: VisionBackend) {}

  static create(args: { apiKey: string; model: string }): VisionAI {
    return new VisionAI(new AnthropicVisionBackend(args.apiKey, args.model))
  }

  static createNull(config: NullableVisionConfig = {}): VisionAI {
    return new VisionAI(new StubVisionBackend(config))
  }

  analyze(args: VisionAnalyzeArgs): Promise<AnalysisResult> {
    return this.backend.analyze(args)
  }
}

class StubVisionBackend implements VisionBackend {
  constructor(private readonly config: NullableVisionConfig) {}
  async analyze(): Promise<AnalysisResult> {
    if (this.config.failure) throw this.config.failure
    return (
      this.config.analysis ?? {
        raw_text: '',
        urls: [],
        regions: [],
        context_kind: 'unknown',
        summary: '',
      }
    )
  }
}

class AnthropicVisionBackend implements VisionBackend {
  private readonly client: Anthropic
  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new Anthropic({ apiKey })
  }
  async analyze({ image, prompt }: VisionAnalyzeArgs): Promise<AnalysisResult> {
    const resp = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: prompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: image.toString('base64'),
              },
            },
            { type: 'text', text: 'Analyze this screen.' },
          ],
        },
      ],
    })
    const block = resp.content[0]
    if (!block || block.type !== 'text') {
      throw new Error('VisionAI: model returned no text block')
    }
    const json = JSON.parse(block.text)
    return AnalysisResultSchema.parse(json)
  }
}
