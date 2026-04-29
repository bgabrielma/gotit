import Anthropic from '@anthropic-ai/sdk'

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

  static create(args: { apiKey: string; model: string }): ChatAI {
    return new ChatAI(new AnthropicChatBackend(args.apiKey, args.model))
  }

  static createNull(config: NullableChatConfig = {}): ChatAI {
    return new ChatAI(new StubChatBackend(config))
  }

  complete(args: ChatCompleteArgs): Promise<string> {
    return this.backend.complete(args)
  }
}

class StubChatBackend implements ChatBackend {
  private idx = 0
  constructor(private readonly config: NullableChatConfig) {}
  async complete(): Promise<string> {
    if (this.config.failure) throw this.config.failure
    const responses = this.config.responses ?? ['']
    const r = responses[this.idx % responses.length] ?? ''
    this.idx += 1
    return r
  }
}

class AnthropicChatBackend implements ChatBackend {
  private readonly client: Anthropic
  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new Anthropic({ apiKey })
  }
  async complete({ system, messages }: ChatCompleteArgs): Promise<string> {
    const resp = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })
    const block = resp.content[0]
    if (!block || block.type !== 'text') throw new Error('ChatAI: no text block')
    return block.text
  }
}
