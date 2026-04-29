import OpenAI from 'openai'
import type { EasyInputMessage, ResponseInput } from 'openai/resources/responses/responses'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }
export type ChatCompleteArgs = { system: string; messages: ChatTurn[] }

export interface ChatBackend {
  complete(args: ChatCompleteArgs): Promise<string>
}

export type NullableChatConfig = {
  responses?: string[]
  failure?: Error
}

export class ChatAI {
  private constructor(private readonly backend: ChatBackend) {}

  static create(args: { apiKey: string; model: string; baseURL?: string }): ChatAI {
    const backend = new OpenAIChatBackend(args.apiKey, args.model, args.baseURL)
    return new ChatAI(backend)
  }

  static createNull(config: NullableChatConfig = {}): ChatAI {
    const backend = new StubChatBackend(config)
    return new ChatAI(backend)
  }

  complete(args: ChatCompleteArgs): Promise<string> {
    return this.backend.complete(args)
  }
}

class StubChatBackend implements ChatBackend {
  private idx = 0
  constructor(private readonly config: NullableChatConfig) {}

  async complete(): Promise<string> {
    if (this.config.failure) {
      throw this.config.failure
    }
    const responses = this.config.responses ?? ['']
    const r = responses[this.idx % responses.length] ?? ''
    this.idx += 1
    return r
  }
}

class OpenAIChatBackend implements ChatBackend {
  private readonly client: OpenAI
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseURL?: string
  ) {
    this.client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL })
  }

  async complete({ system, messages }: ChatCompleteArgs): Promise<string> {
    const conversationItems: EasyInputMessage[] = messages.map(
      (message): EasyInputMessage => ({
        role: message.role,
        content: [{ type: 'input_text', text: message.content }],
      })
    )

    const input: ResponseInput = [
      { role: 'developer', content: [{ type: 'input_text', text: system }] },
      ...conversationItems,
    ]

    const resp = await this.client.responses.create({
      model: this.model,
      input,
    })

    const outputText = extractOutputText(resp)
    if (!outputText) {
      throw new Error('ChatAI: no text output')
    }
    return outputText
  }
}

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
