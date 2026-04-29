import { describe, expect, it } from 'vitest'
import { ChatAI } from '../../infra/chat-ai.js'
import { VisionAI } from '../../infra/vision-ai.js'
import { loadConfig } from '../../config.js'
import { LLMConnectorConfig } from '../../infra/llm-connector-config.js'
import { DEFAULT_VISION_PROMPT } from '../../prompts/default-vision.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const canRunCloudLive =
  process.env.GOTIT_LLM_CONNECTOR === 'openai' &&
  typeof process.env.OPENAI_API_KEY === 'string' &&
  process.env.OPENAI_API_KEY.length > 0

const canRunLocalLive =
  process.env.GOTIT_LLM_CONNECTOR === 'local' &&
  typeof process.env.GOTIT_LLM_BASE_URL === 'string' &&
  process.env.GOTIT_LLM_BASE_URL.length > 0

const describeIfLiveReady = canRunCloudLive || canRunLocalLive ? describe : describe.skip

describeIfLiveReady('LLM live integration', () => {
  const cfg = loadConfig(process.env)
  const llm = LLMConnectorConfig.fromConfig(cfg)
  const screenshotPath = resolve('src/__tests__/fixtures/screenshot-sample.png')

  it('chat connector returns a non-empty response', async () => {
    const chatAI = ChatAI.create(llm)
    const response = await chatAI.complete({
      system: 'Reply with one short sentence.',
      messages: [{ role: 'user', content: 'Say hello from integration test.' }],
    })
    console.debug('LLM live chat response:', response)
    expect(typeof response).toBe('string')
    expect(response.length).toBeGreaterThan(0)
  }, 120_000)

  it('vision connector returns a schema-valid analysis response', async () => {
    const visionAI = VisionAI.create(llm)
    const png = readFileSync(screenshotPath)
    let result

    try {
      result = await visionAI.analyze({
        image: png,
        prompt: DEFAULT_VISION_PROMPT,
      })
    } catch (error) {
      console.error('LLM live vision error:', error)
      throw error
    }

    console.debug('LLM live vision response:', {
      context_kind: result.context_kind,
      summary: result.summary,
      urls: result.urls,
      regions: result.regions,
      raw_text: result.raw_text,
    })
    expect(result.context_kind).toBeDefined()
    expect(Array.isArray(result.urls)).toBe(true)
    expect(typeof result.summary).toBe('string')
  }, 120_000)
})
