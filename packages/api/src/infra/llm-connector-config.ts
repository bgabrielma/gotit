import type { Config } from '../config.js'

export type LLMRuntimeConfig = {
  model: string
  apiKey: string
  baseURL?: string
}

export class LLMConnectorConfig {
  static fromConfig(cfg: Config): LLMRuntimeConfig {
    if (cfg.llmConnector !== 'openai') {
      return {
        model: cfg.openaiModel,
        apiKey: cfg.llmApiKey || cfg.llmConnector,
        baseURL: cfg.llmBaseUrl,
      }
    }
    return {
      model: cfg.openaiModel,
      apiKey: cfg.openaiApiKey,
    }
  }
}
