import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { AnalysisResult } from '@got-it/shared'
import type { Express } from 'express'
import request from 'supertest'
import { vi } from 'vitest'
import { createApp, type AppDeps } from '../app.js'
import type { StoreBackend } from '../infra/store.js'
import { VisionAI } from '../infra/vision-ai.js'
import { ChatAI } from '../infra/chat-ai.js'
import { WebSearchAI, type SearchResult } from '../tools/web-search-ai.js'
import { PageFetcher } from '../tools/page-fetcher.js'
import { DEFAULT_CHAT_PROMPT, DEFAULT_VISION_PROMPT } from '../prompts/defaults.js'
import { createFakeStoreBackend } from './fakes/store.js'

/**
 * Root directory for API test artifacts written inside the repository.
 */
export const TEST_TMP_ROOT = resolve(process.cwd(), '../../tmp')

/**
 * Default capture folder used by API tests.
 */
export const DEFAULT_CAPTURE_FOLDER = 'GotIt!'

/**
 * Default vision analysis payload used by mocked vision backends.
 */
export const DEFAULT_ANALYSIS: AnalysisResult = {
  raw_text: '',
  urls: [],
  regions: [],
  context_kind: 'unknown',
  summary: '',
}

type TestAppOptions = {
  store?: StoreBackend
  visionAI?: VisionAI
  chatAI?: ChatAI
  webSearchAI?: WebSearchAI
  pageFetcher?: PageFetcher
} & Partial<
  Pick<AppDeps, 'visionPrompt' | 'chatPersonaPrompt' | 'captureFolder' | 'dataDir' | 'version'>
>

/**
 * Builds an absolute path inside the shared API test temporary root.
 */
export function tmpPath(...parts: string[]): string {
  return resolve(TEST_TMP_ROOT, ...parts)
}

/**
 * Removes a directory recursively when it exists.
 */
export function cleanupDir(dirPath: string): void {
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true })
  }
}

/**
 * Ensures a directory exists and is empty.
 */
export function ensureCleanDir(dirPath: string): void {
  cleanupDir(dirPath)
  mkdirSync(dirPath, { recursive: true })
}

/**
 * Lists files directly under a directory.
 */
export function listFiles(dirPath: string): string[] {
  if (!existsSync(dirPath)) {
    return []
  }
  return readdirSync(dirPath).map((fileName) => join(dirPath, fileName))
}

/**
 * Creates an API app instance with mock-friendly defaults for tests.
 */
export function createTestApp(opts: TestAppOptions = {}): Express {
  mkdirSync(TEST_TMP_ROOT, { recursive: true })

  return createApp({
    store: opts.store ?? createFakeStoreBackend(),
    visionAI: opts.visionAI ?? createVisionAIMock().instance,
    chatAI: opts.chatAI ?? createChatAIMock().instance,
    webSearchAI: opts.webSearchAI ?? createWebSearchAIMock().instance,
    pageFetcher: opts.pageFetcher ?? createPageFetcherMock().instance,
    visionPrompt: opts.visionPrompt ?? DEFAULT_VISION_PROMPT,
    chatPersonaPrompt: opts.chatPersonaPrompt ?? DEFAULT_CHAT_PROMPT,
    captureFolder: opts.captureFolder ?? DEFAULT_CAPTURE_FOLDER,
    dataDir: opts.dataDir ?? tmpPath('data'),
    version: opts.version ?? 'test',
  })
}

/**
 * Creates a mocked vision client wrapped in the VisionAI infrastructure class.
 */
export function createVisionAIMock(
  opts: {
    analysis?: AnalysisResult
    failure?: Error
  } = {}
): { instance: VisionAI; analyze: ReturnType<typeof vi.fn> } {
  const analyze = vi.fn(async () => {
    if (opts.failure) {
      throw opts.failure
    }
    return opts.analysis ?? DEFAULT_ANALYSIS
  })

  return {
    instance: VisionAI.fromBackend({ analyze }),
    analyze,
  }
}

/**
 * Creates a mocked chat client wrapped in the ChatAI infrastructure class.
 */
export function createChatAIMock(
  opts: {
    responses?: string[]
    failure?: Error
  } = {}
): { instance: ChatAI; complete: ReturnType<typeof vi.fn> } {
  const responses = opts.responses ?? ['']
  let idx = 0

  const complete = vi.fn(async () => {
    if (opts.failure) {
      throw opts.failure
    }
    const response = responses[idx % responses.length] ?? ''
    idx += 1
    return response
  })

  return {
    instance: ChatAI.fromBackend({ complete }),
    complete,
  }
}

/**
 * Default search results used by mocked web search backends.
 */
export const DEFAULT_SEARCH_RESULTS: SearchResult[] = []

/**
 * Creates a mocked web search client wrapped in the WebSearchAI infrastructure class.
 */
export function createWebSearchAIMock(
  opts: {
    results?: SearchResult[]
    failure?: Error
  } = {}
): { instance: WebSearchAI; search: ReturnType<typeof vi.fn> } {
  const search = vi.fn(async () => {
    if (opts.failure) {
      throw opts.failure
    }
    return opts.results ?? DEFAULT_SEARCH_RESULTS
  })

  return {
    instance: WebSearchAI.fromBackend({ search }),
    search,
  }
}

/**
 * Creates a mocked page fetcher wrapped in the PageFetcher infrastructure class.
 */
export function createPageFetcherMock(
  opts: {
    pages?: Map<string, string>
    failure?: Error
  } = {}
): { instance: PageFetcher; fetch: ReturnType<typeof vi.fn> } {
  const fetchFn = vi.fn(async (url: string) => {
    if (opts.failure) {
      throw opts.failure
    }
    return opts.pages?.get(url) ?? ''
  })

  return {
    instance: PageFetcher.fromBackend({ fetch: fetchFn }),
    fetch: fetchFn,
  }
}

/**
 * Registers a device and returns the auth token used by route tests.
 */
export async function registerDevice(app: Express, installId = 'inst-1'): Promise<string> {
  const deviceRes = await request(app).post('/device').send({ install_id: installId })
  return deviceRes.body.token as string
}

/**
 * Creates an active session for an authenticated device token.
 */
export async function createSession(app: Express, token: string): Promise<void> {
  await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
}

/**
 * Creates an app and authenticated device token with optional active session setup.
 */
export async function setupAuthedApp(
  appOpts: TestAppOptions = {},
  opts: { installId?: string; createActiveSession?: boolean } = {}
): Promise<{ app: Express; token: string }> {
  const app = createTestApp(appOpts)
  const token = await registerDevice(app, opts.installId)
  if (opts.createActiveSession !== false) {
    await createSession(app, token)
  }
  return { app, token }
}
