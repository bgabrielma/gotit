import OpenAI from 'openai'
import type { EasyInputMessage, ResponseInput } from 'openai/resources/responses/responses'
import type { Tool } from 'openai/resources/responses/responses'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }
export type ChatCompleteArgs = { system: string; messages: ChatTurn[] }

export type ToolDef = {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ToolCallHandler = (name: string, args: Record<string, string>) => Promise<string>

export type ChatCompleteOptions = {
  tools?: ToolDef[]
  onToolCall?: ToolCallHandler
}

export interface ChatBackend {
  complete(args: ChatCompleteArgs, options?: ChatCompleteOptions): Promise<string>
}

/**
 * Infrastructure wrapper for chat completions.
 * Use {@link ChatAI.create} in production and {@link ChatAI.fromBackend} in tests.
 */
export class ChatAI {
  private constructor(private readonly backend: ChatBackend) {}

  /**
   * Creates a chat client backed by the configured OpenAI-compatible runtime.
   */
  static create(args: { apiKey: string; model: string; baseURL?: string }): ChatAI {
    const backend = new OpenAIChatBackend(args.apiKey, args.model, args.baseURL)
    return new ChatAI(backend)
  }

  /**
   * Creates a chat client from an injected backend.
   */
  static fromBackend(backend: ChatBackend): ChatAI {
    return new ChatAI(backend)
  }

  /**
   * Executes a completion request with optional tool-calling support.
   */
  complete(args: ChatCompleteArgs, options?: ChatCompleteOptions): Promise<string> {
    return this.backend.complete(args, options)
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

  async complete(
    { system, messages }: ChatCompleteArgs,
    options?: ChatCompleteOptions
  ): Promise<string> {
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

    const tools: Tool[] | undefined = options?.tools?.map((t) => ({
      type: t.type,
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      strict: false,
    }))

    const resp = await this.client.responses.create({
      model: this.model,
      input,
      ...(tools && tools.length > 0 ? { tools } : {}),
    })

    const toolCall = extractToolCall(resp)
    if (toolCall && options?.onToolCall) {
      const toolResult = await options.onToolCall(toolCall.name, toolCall.args)

      const followUpInput: ResponseInput = [
        ...input,
        {
          type: 'function_call',
          id: toolCall.id,
          call_id: toolCall.callId,
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.args),
        } as ResponseInput[number],
        {
          type: 'function_call_output',
          call_id: toolCall.callId,
          output: toolResult,
        } as ResponseInput[number],
      ]

      const followUp = await this.client.responses.create({
        model: this.model,
        input: followUpInput,
      })

      const followUpText = extractOutputText(followUp)
      if (!followUpText) {
        throw new Error('ChatAI: no text output after tool call')
      }
      return followUpText
    }

    const outputText = extractOutputText(resp)
    if (!outputText) {
      throw new Error('ChatAI: no text output')
    }
    return outputText
  }
}

type ToolCallInfo = {
  id: string
  callId: string
  name: string
  args: Record<string, string>
}

function extractToolCall(payload: unknown): ToolCallInfo | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const output = (payload as { output?: unknown }).output
  if (!Array.isArray(output)) {
    return null
  }
  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const type = (item as { type?: unknown }).type
    if (type === 'function_call') {
      const fc = item as {
        id?: string
        call_id?: string
        name?: string
        arguments?: string
      }
      const name = fc.name ?? ''
      const id = fc.id ?? ''
      const callId = fc.call_id ?? ''
      let args: Record<string, string> = {}
      try {
        args = JSON.parse(fc.arguments ?? '{}') as Record<string, string>
      } catch {
        args = {}
      }
      return { id, callId, name, args }
    }
  }
  return null
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
