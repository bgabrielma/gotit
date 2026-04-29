# F001 Phase 1a — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Express/TypeScript backend that powers F001 Phase 1a (Capture + Chat + Save). Vision pipeline, chat completions, Obsidian save, session storage. End state: a single `pnpm dev` starts the API; integration tests via Nullable wrappers pass; macOS client (next plan) plugs in via documented HTTP contracts.

**Architecture:** Functional Core / Imperative Shell. `packages/core` is pure TypeScript with zero side effects, tested with real inputs. `apps/api` is the Express shell that owns I/O — Anthropic SDK calls, SQLite, filesystem writes — wrapped in `createNull()`-capable infrastructure classes (James Shore Nullable pattern). `packages/shared` exports Zod schemas + types consumed by both shell and core. Strict TS, no `any`, no `@ts-ignore`. No mock frameworks anywhere.

**Tech Stack:** Node 22.16.0 (pinned via `.nvmrc`), pnpm 10 workspaces, TypeScript 5.x strict, Express 4, vitest, better-sqlite3, @anthropic-ai/sdk, zod, dotenv, husky, lint-staged, eslint + @typescript-eslint, prettier.

---

## Spec References

This plan implements the backend portion of:

- **Spec:** `docs/specs/f001-screen-capture-mvp.md`
- **Phase target:** §3 Phase 1a + §16.1 sprint contract
- **Architecture rules:** `CLAUDE.md` (FC/IS, Nullable pattern, no mocks, strict TS)
- **Env contract:** spec §13.2 + `.env.template`

Phase 1b/1c/1d (mic, Listen, history tab) live in **separate later plans** — this plan deliberately stops at the Phase 1a sprint contract. Routes for `/transcribe` and `/chat/audio-stream` are **not** built here.

## File Structure

```
got-it/
├── package.json                          (modify — add workspaces, scripts)
├── pnpm-workspace.yaml                   (create)
├── tsconfig.base.json                    (create)
├── .eslintrc.cjs                         (create)
├── .prettierrc.json                      (create)
├── vitest.config.ts                      (create — root, shared base)
├── .husky/
│   ├── pre-commit                        (create)
│   └── pre-push                          (create)
│
├── packages/shared/
│   ├── package.json                      (create)
│   ├── tsconfig.json                     (create)
│   └── src/
│       ├── index.ts                      (create — barrel)
│       ├── domain.ts                     (create — Session, Message, AnalysisResult, BBox)
│       ├── api.ts                        (create — request/response Zod schemas)
│       └── schemas.test.ts               (create — schema round-trips)
│
├── packages/core/
│   ├── package.json                      (create)
│   ├── tsconfig.json                     (create)
│   └── src/
│       ├── index.ts                      (create — barrel)
│       ├── extract-urls.ts               (create)
│       ├── extract-urls.test.ts          (create)
│       ├── session-reducer.ts            (create — appendMessage, startNewSession)
│       ├── session-reducer.test.ts       (create)
│       ├── build-chat-request.ts         (create)
│       ├── build-chat-request.test.ts    (create)
│       ├── detect-refresh-intent.ts      (create)
│       ├── detect-refresh-intent.test.ts (create)
│       ├── slugify-summary.ts            (create)
│       ├── slugify-summary.test.ts       (create)
│       ├── next-available-filename.ts    (create — pure)
│       ├── next-available-filename.test.ts(create)
│       ├── format-obsidian-entry.ts      (create)
│       ├── format-obsidian-entry.test.ts (create)
│       ├── resolve-save-format.ts        (create)
│       └── resolve-save-format.test.ts   (create)
│
└── apps/api/
    ├── package.json                      (create)
    ├── tsconfig.json                     (create)
    ├── migrations/
    │   └── 001_init.sql                  (create)
    ├── src/
    │   ├── config.ts                     (create — env via Zod)
    │   ├── config.test.ts                (create)
    │   ├── app.ts                        (create — createApp factory)
    │   ├── server.ts                     (create — entry point)
    │   ├── prompts/
    │   │   ├── default-vision.ts         (create)
    │   │   └── default-chat.ts           (create)
    │   ├── infra/
    │   │   ├── store.ts                  (create — SQLite + Nullable)
    │   │   ├── store.test.ts             (create)
    │   │   ├── vision-ai.ts              (create — Anthropic vision + Nullable)
    │   │   ├── vision-ai.test.ts         (create)
    │   │   ├── chat-ai.ts                (create — Anthropic chat + Nullable)
    │   │   ├── chat-ai.test.ts           (create)
    │   │   ├── obsidian-writer.ts        (create — fs writes + Nullable)
    │   │   └── obsidian-writer.test.ts   (create)
    │   ├── middleware/
    │   │   └── auth.ts                   (create — resolves device token)
    │   └── routes/
    │       ├── device.ts                 (create + .test.ts)
    │       ├── health.ts                 (create + .test.ts)
    │       ├── sessions.ts               (create + .test.ts)
    │       ├── capture.ts                (create + .test.ts)
    │       ├── chat.ts                   (create + .test.ts)
    │       └── save.ts                   (create + .test.ts)
    └── vitest.config.ts                  (create — extends root)
```

**Boundaries:**

- `packages/shared` defines wire types (Zod). No runtime logic.
- `packages/core` consumes types from shared. Pure. Tests use real inputs.
- `apps/api` consumes shared + core. `process.env` is read **only** in `src/config.ts`. Routes consume `Config` and infrastructure wrappers from a DI container assembled by `createApp({ config, store, visionAI, chatAI, obsidianWriter })`.

---

## Tasks

> **TDD discipline:** every code-producing task has a failing test first, run-to-fail, minimal impl, run-to-pass, commit. No exceptions in `packages/core`. Routes use sociable tests with `createNull()` infra. Skip TDD only for pure config files (eslint, tsconfig).

---

### Task 1: pnpm workspace + Node version verification

**Files:**

- Create: `pnpm-workspace.yaml`
- Modify: `package.json`

- [x] **Step 1.1: Verify Node matches `.nvmrc`**

```bash
cd /Users/bgabrielma/personal-workspace/got-it
nvm use
node --version
```

Expected: `v22.16.0` (or run `nvm install 22.16.0` if missing).

- [x] **Step 1.2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [x] **Step 1.3: Modify root `package.json`**

Replace the existing `package.json` with:

```json
{
  "name": "got-it",
  "version": "0.0.1",
  "private": true,
  "packageManager": "pnpm@10.12.4",
  "engines": {
    "node": "22.16.0"
  },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "purity-check": "node scripts/purity-check.mjs",
    "validate": "pnpm typecheck && pnpm lint && pnpm test && pnpm purity-check",
    "dev": "pnpm --filter @got-it/api dev",
    "docs:build": "mmdc -i docs/architecture.mmd -o docs/architecture.svg",
    "docs:preview": "live-server docs --port=3333",
    "prepare": "husky"
  },
  "devDependencies": {
    "@mermaid-js/mermaid-cli": "^11",
    "@typescript-eslint/eslint-plugin": "^8",
    "@typescript-eslint/parser": "^8",
    "eslint": "^9",
    "husky": "^9",
    "lint-staged": "^15",
    "live-server": "^1.2.2",
    "prettier": "^3",
    "typescript": "^5.6",
    "vitest": "^2"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.md": ["prettier --write"]
  }
}
```

- [x] **Step 1.4: Install**

```bash
pnpm install
```

Expected: `pnpm` creates `node_modules`, no errors.

- [x] **Step 1.5: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: configure pnpm workspaces and Node 22 engine pin"
```

---

### Task 2: Root TypeScript + ESLint + Prettier base configs

**Files:**

- Create: `tsconfig.base.json`, `.eslintrc.cjs`, `.prettierrc.json`, `vitest.config.ts`

- [x] **Step 2.1: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitAny": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  }
}
```

- [x] **Step 2.2: Create `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/ban-ts-comment': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: ['dist', 'build', 'node_modules', '*.cjs'],
}
```

- [x] **Step 2.3: Create `.prettierrc.json`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100
}
```

- [x] **Step 2.4: Create root `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
})
```

- [x] **Step 2.5: Commit**

```bash
git add tsconfig.base.json .eslintrc.cjs .prettierrc.json vitest.config.ts
git commit -m "chore: add root TS, ESLint, Prettier, and Vitest configs"
```

---

### Task 3: Husky pre-commit and pre-push hooks

**Files:**

- Create: `.husky/pre-commit`, `.husky/pre-push`

- [x] **Step 3.1: Initialize husky**

```bash
pnpm exec husky init
```

Expected: creates `.husky/pre-commit` with default content.

- [x] **Step 3.2: Replace `.husky/pre-commit`**

```sh
pnpm lint-staged
```

- [x] **Step 3.3: Create `.husky/pre-push`**

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm purity-check
```

- [x] **Step 3.4: Make hooks executable**

```bash
chmod +x .husky/pre-commit .husky/pre-push
```

- [x] **Step 3.5: Commit**

```bash
git add .husky/pre-commit .husky/pre-push
git commit -m "chore: add husky pre-commit (lint-staged) and pre-push (full validate) hooks"
```

---

### Task 4: Purity check script

**Files:**

- Create: `scripts/purity-check.mjs`

The validator and pre-push hook need an automated check that `packages/core` contains no I/O. This script greps the source.

- [x] **Step 4.1: Create `scripts/purity-check.mjs`**

```js
#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { argv, exit } from 'node:process'

const FORBIDDEN = [
  /from\s+['"]node:fs['"]/,
  /from\s+['"]node:path['"]/,
  /from\s+['"]node:http['"]/,
  /from\s+['"]node:net['"]/,
  /from\s+['"]node:child_process['"]/,
  /\bfetch\s*\(/,
  /\bDate\.now\s*\(/,
  /\bMath\.random\s*\(/,
  /\bprocess\.env\b/,
  /\bconsole\.(log|info|debug)\b/,
]

const files = globSync('packages/core/src/**/*.ts', { ignore: ['**/*.test.ts'] })
let failed = false

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  for (const pat of FORBIDDEN) {
    if (pat.test(src)) {
      console.error(`PURITY VIOLATION: ${file} matches ${pat}`)
      failed = true
    }
  }
}

if (failed) exit(1)
console.error('purity check passed')
```

- [x] **Step 4.2: Run it**

```bash
node scripts/purity-check.mjs
```

Expected: `purity check passed` (no core files exist yet, so no matches).

- [x] **Step 4.3: Commit**

```bash
git add scripts/purity-check.mjs
git commit -m "chore: add purity-check script for packages/core"
```

---

### Task 5: `@got-it/shared` package — domain types

**Files:**

- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/domain.ts`

- [x] **Step 5.1: Create `packages/shared/package.json`**

```json
{
  "name": "@got-it/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23"
  }
}
```

- [x] **Step 5.2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist" },
  "include": ["src"]
}
```

- [x] **Step 5.3: Create `packages/shared/src/domain.ts`**

```ts
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
```

- [x] **Step 5.4: Create `packages/shared/src/index.ts`**

```ts
export * from './domain.js'
export * from './api.js'
```

- [x] **Step 5.5: Run typecheck**

```bash
pnpm --filter @got-it/shared typecheck
```

Expected: fails because `./api.js` does not exist yet. Continue to Task 6 to fix.

---

### Task 6: `@got-it/shared` — API Zod schemas

**Files:**

- Create: `packages/shared/src/api.ts`, `packages/shared/src/schemas.test.ts`

- [x] **Step 6.1: Write failing test `packages/shared/src/schemas.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  CaptureRequestSchema,
  ChatRequestSchema,
  SaveRequestSchema,
  AnalysisResultSchema,
} from './api.js'

describe('AnalysisResultSchema', () => {
  it('accepts a fully populated analysis', () => {
    const parsed = AnalysisResultSchema.parse({
      raw_text: 'hello',
      urls: [{ href: 'https://example.com', anchor: 'Example' }],
      regions: [{ kind: 'paragraph', text: 'hello' }],
      context_kind: 'browser_article',
      summary: 'A page',
    })
    expect(parsed.urls[0]?.href).toBe('https://example.com')
  })

  it('rejects an invalid context_kind', () => {
    expect(() =>
      AnalysisResultSchema.parse({
        raw_text: '',
        urls: [],
        regions: [],
        context_kind: 'nope',
        summary: '',
      })
    ).toThrow()
  })
})

describe('ChatRequestSchema', () => {
  it('parses a minimal text chat request', () => {
    const parsed = ChatRequestSchema.parse({ text: 'hi', source: 'text' })
    expect(parsed.source).toBe('text')
  })
})

describe('CaptureRequestSchema', () => {
  it('requires source enum', () => {
    expect(() => CaptureRequestSchema.parse({ source: 'bogus' })).toThrow()
  })
})

describe('SaveRequestSchema', () => {
  it('allows optional instruction', () => {
    expect(SaveRequestSchema.parse({})).toEqual({})
    expect(SaveRequestSchema.parse({ instruction: 'as code' })).toEqual({
      instruction: 'as code',
    })
  })
})
```

- [x] **Step 6.2: Run test, expect fail**

```bash
pnpm --filter @got-it/shared test
```

Expected: import error, `./api.js` not found.

- [x] **Step 6.3: Create `packages/shared/src/api.ts`**

```ts
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
```

- [x] **Step 6.4: Run test, expect pass**

```bash
pnpm --filter @got-it/shared test
```

Expected: all tests pass.

- [x] **Step 6.5: Run typecheck**

```bash
pnpm --filter @got-it/shared typecheck
```

Expected: passes.

- [x] **Step 6.6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add domain types and Zod API schemas"
```

---

### Task 7: `@got-it/core` package skeleton

**Files:**

- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`

- [x] **Step 7.1: Create `packages/core/package.json`**

```json
{
  "name": "@got-it/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "@got-it/shared": "workspace:*"
  }
}
```

- [x] **Step 7.2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist" },
  "include": ["src"]
}
```

- [x] **Step 7.3: Create `packages/core/src/index.ts`**

```ts
export * from './extract-urls.js'
export * from './session-reducer.js'
export * from './build-chat-request.js'
export * from './detect-refresh-intent.js'
export * from './slugify-summary.js'
export * from './next-available-filename.js'
export * from './format-obsidian-entry.js'
export * from './resolve-save-format.js'
```

(Files don't exist yet — typecheck will fail. Tasks 8-15 fill them in.)

- [x] **Step 7.4: Re-run install to wire workspace deps**

```bash
pnpm install
```

- [x] **Step 7.5: Commit**

```bash
git add packages/core
git commit -m "feat(core): scaffold package with workspace dep on shared"
```

---

### Task 8: `extractUrls` (pure, core)

**Files:**

- Create: `packages/core/src/extract-urls.ts`, `packages/core/src/extract-urls.test.ts`

- [x] **Step 8.1: Write failing test**

```ts
// packages/core/src/extract-urls.test.ts
import { describe, expect, it } from 'vitest'
import { extractUrls } from './extract-urls.js'

describe('extractUrls', () => {
  it('extracts a single bare URL', () => {
    expect(extractUrls('Check out https://example.com today')).toEqual(['https://example.com'])
  })

  it('deduplicates repeated URLs preserving first-seen order', () => {
    const text = 'see https://a.com and https://b.com and again https://a.com'
    expect(extractUrls(text)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('handles trailing punctuation', () => {
    expect(extractUrls('Visit https://example.com.')).toEqual(['https://example.com'])
    expect(extractUrls('Visit (https://example.com),')).toEqual(['https://example.com'])
  })

  it('returns an empty array when no URLs are present', () => {
    expect(extractUrls('plain text only')).toEqual([])
  })

  it('ignores ftp:// and other non-http schemes', () => {
    expect(extractUrls('grab ftp://files/x and https://ok.com')).toEqual(['https://ok.com'])
  })
})
```

- [x] **Step 8.2: Run, expect fail**

```bash
pnpm --filter @got-it/core test
```

Expected: import error.

- [x] **Step 8.3: Implement**

```ts
// packages/core/src/extract-urls.ts
const URL_REGEX = /\bhttps?:\/\/[^\s<>"')\]]+/gi
const TRAILING_PUNCT = /[.,;:!?)\]]+$/

export function extractUrls(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of text.matchAll(URL_REGEX)) {
    const cleaned = match[0].replace(TRAILING_PUNCT, '')
    if (!seen.has(cleaned)) {
      seen.add(cleaned)
      out.push(cleaned)
    }
  }
  return out
}
```

- [x] **Step 8.4: Run, expect pass**

```bash
pnpm --filter @got-it/core test
```

- [x] **Step 8.5: Run purity check**

```bash
node scripts/purity-check.mjs
```

Expected: passes.

- [x] **Step 8.6: Commit**

```bash
git add packages/core/src/extract-urls.ts packages/core/src/extract-urls.test.ts
git commit -m "feat(core): add pure extractUrls"
```

---

### Task 9: `sessionReducer` — appendMessage and startNewSession

**Files:**

- Create: `packages/core/src/session-reducer.ts`, `packages/core/src/session-reducer.test.ts`

- [x] **Step 9.1: Write failing test**

```ts
// packages/core/src/session-reducer.test.ts
import { describe, expect, it } from 'vitest'
import type { Message, Session } from '@got-it/shared'
import { appendMessage, startNewSession } from './session-reducer.js'

const baseSession: Session = {
  id: 'sess_1',
  device_id: 'dev_1',
  started_at: '2026-04-28T12:00:00Z',
  ended_at: null,
  title: null,
}

const userText: Message = {
  id: 'msg_1',
  session_id: 'sess_1',
  kind: 'user_text',
  text: 'hello',
  source: 'text',
  created_at: '2026-04-28T12:00:01Z',
}

describe('appendMessage', () => {
  it('returns new arrays (no mutation)', () => {
    const messages: Message[] = []
    const next = appendMessage(messages, userText)
    expect(messages).toEqual([])
    expect(next).toEqual([userText])
  })

  it('appends in order', () => {
    const m2 = { ...userText, id: 'msg_2', text: 'world' }
    expect(appendMessage(appendMessage([], userText), m2)).toEqual([userText, m2])
  })
})

describe('startNewSession', () => {
  it('builds a session with the given id, device, and timestamp', () => {
    const s = startNewSession({
      id: 'sess_x',
      device_id: 'dev_1',
      now: new Date('2026-04-28T15:00:00Z'),
    })
    expect(s).toEqual({
      id: 'sess_x',
      device_id: 'dev_1',
      started_at: '2026-04-28T15:00:00.000Z',
      ended_at: null,
      title: null,
    })
  })
})

describe('reset semantics', () => {
  it('starting a new session leaves the old session reference unchanged', () => {
    const next = startNewSession({
      id: 'sess_2',
      device_id: 'dev_1',
      now: new Date('2026-04-28T16:00:00Z'),
    })
    expect(baseSession.id).toBe('sess_1')
    expect(next.id).toBe('sess_2')
  })
})
```

- [x] **Step 9.2: Run, expect fail.**

```bash
pnpm --filter @got-it/core test session-reducer
```

- [x] **Step 9.3: Implement**

```ts
// packages/core/src/session-reducer.ts
import type { Message, Session, SessionId, DeviceId } from '@got-it/shared'

export function appendMessage(messages: readonly Message[], next: Message): Message[] {
  return [...messages, next]
}

export function startNewSession(args: { id: SessionId; device_id: DeviceId; now: Date }): Session {
  return {
    id: args.id,
    device_id: args.device_id,
    started_at: args.now.toISOString(),
    ended_at: null,
    title: null,
  }
}
```

- [x] **Step 9.4: Run, expect pass.**
- [x] **Step 9.5: Commit**

```bash
git add packages/core/src/session-reducer.ts packages/core/src/session-reducer.test.ts
git commit -m "feat(core): add pure sessionReducer (appendMessage, startNewSession)"
```

---

### Task 10: `detectRefreshIntent` (pure)

**Files:**

- Create: `packages/core/src/detect-refresh-intent.ts`, `packages/core/src/detect-refresh-intent.test.ts`

- [x] **Step 10.1: Write failing test**

```ts
import { describe, expect, it } from 'vitest'
import { detectRefreshIntent } from './detect-refresh-intent.js'

describe('detectRefreshIntent', () => {
  it.each([
    ['look at the screen now', true],
    ["what's on screen?", true],
    ['look again', true],
    ['refresh the screen', true],
    ['take another look', true],
    ['summarize this', false],
    ['save this for later', false],
    ['', false],
  ])('"%s" → %s', (input, expected) => {
    expect(detectRefreshIntent(input)).toBe(expected)
  })
})
```

- [x] **Step 10.2: Run, expect fail.**
- [x] **Step 10.3: Implement**

```ts
// packages/core/src/detect-refresh-intent.ts
const PATTERNS: RegExp[] = [
  /\blook (at|again)\b/i,
  /\bwhat'?s on (the )?screen\b/i,
  /\brefresh (the )?screen\b/i,
  /\btake another look\b/i,
]

export function detectRefreshIntent(text: string): boolean {
  return PATTERNS.some((p) => p.test(text))
}
```

- [x] **Step 10.4: Run, expect pass.**
- [x] **Step 10.5: Commit**

```bash
git add packages/core/src/detect-refresh-intent.ts packages/core/src/detect-refresh-intent.test.ts
git commit -m "feat(core): add pure detectRefreshIntent heuristic"
```

---

### Task 11: `slugifySummary` and `nextAvailableFilename` (pure)

**Files:**

- Create: `packages/core/src/slugify-summary.ts` + test, `packages/core/src/next-available-filename.ts` + test

- [x] **Step 11.1: Write failing test for slug**

```ts
// packages/core/src/slugify-summary.test.ts
import { describe, expect, it } from 'vitest'
import { slugifySummary } from './slugify-summary.js'

describe('slugifySummary', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugifySummary('Hello World')).toBe('hello-world')
  })
  it('strips punctuation and collapses repeats', () => {
    expect(slugifySummary("It's a test! Yes? Yes!!")).toBe('its-a-test-yes-yes')
  })
  it('truncates to 60 chars on word boundary', () => {
    const long = 'word '.repeat(40).trim()
    const out = slugifySummary(long)
    expect(out.length).toBeLessThanOrEqual(60)
    expect(out.endsWith('-')).toBe(false)
  })
  it('returns "untitled" for empty input', () => {
    expect(slugifySummary('')).toBe('untitled')
    expect(slugifySummary('   ')).toBe('untitled')
  })
})
```

- [x] **Step 11.2: Run, expect fail.**
- [x] **Step 11.3: Implement slug**

```ts
// packages/core/src/slugify-summary.ts
const MAX_LEN = 60

export function slugifySummary(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (normalized.length === 0) return 'untitled'
  if (normalized.length <= MAX_LEN) return normalized
  const truncated = normalized.slice(0, MAX_LEN)
  const lastDash = truncated.lastIndexOf('-')
  return lastDash > 0 ? truncated.slice(0, lastDash) : truncated
}
```

- [x] **Step 11.4: Run, expect pass.**

- [x] **Step 11.5: Write failing test for nextAvailableFilename (pure — takes existing names)**

```ts
// packages/core/src/next-available-filename.test.ts
import { describe, expect, it } from 'vitest'
import { nextAvailableFilename } from './next-available-filename.js'

describe('nextAvailableFilename', () => {
  it('returns the original when no collision', () => {
    expect(nextAvailableFilename('foo.md', new Set())).toBe('foo.md')
  })
  it('appends -1 on first collision', () => {
    expect(nextAvailableFilename('foo.md', new Set(['foo.md']))).toBe('foo-1.md')
  })
  it('walks until clear', () => {
    expect(nextAvailableFilename('foo.md', new Set(['foo.md', 'foo-1.md', 'foo-2.md']))).toBe(
      'foo-3.md'
    )
  })
  it('handles names with multiple dots', () => {
    expect(nextAvailableFilename('a.b.md', new Set(['a.b.md']))).toBe('a.b-1.md')
  })
})
```

- [x] **Step 11.6: Run, expect fail.**
- [x] **Step 11.7: Implement**

```ts
// packages/core/src/next-available-filename.ts
export function nextAvailableFilename(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name
  const dot = name.lastIndexOf('.')
  const base = dot === -1 ? name : name.slice(0, dot)
  const ext = dot === -1 ? '' : name.slice(dot)
  for (let i = 1; i < 10_000; i++) {
    const candidate = `${base}-${i}${ext}`
    if (!taken.has(candidate)) return candidate
  }
  throw new Error('nextAvailableFilename: too many collisions')
}
```

- [x] **Step 11.8: Run, expect pass.**
- [x] **Step 11.9: Commit**

```bash
git add packages/core/src/slugify-summary.* packages/core/src/next-available-filename.*
git commit -m "feat(core): add slugifySummary and nextAvailableFilename"
```

---

### Task 12: `formatObsidianEntry` (pure)

**Files:**

- Create: `packages/core/src/format-obsidian-entry.ts` + test

- [x] **Step 12.1: Write failing test**

````ts
// packages/core/src/format-obsidian-entry.test.ts
import { describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@got-it/shared'
import { formatObsidianEntry } from './format-obsidian-entry.js'

const analysis: AnalysisResult = {
  raw_text: 'hello',
  urls: [{ href: 'https://a.com', anchor: 'A' }, { href: 'https://b.com' }],
  regions: [],
  context_kind: 'browser_article',
  summary: 'A page about A',
}

describe('formatObsidianEntry — default template', () => {
  const out = formatObsidianEntry({
    template: 'default',
    analysis,
    body: 'My notes',
    sessionId: 'sess_1',
    savedAt: new Date('2026-04-28T15:42:00Z'),
    title: 'A page about A',
  })

  it('contains the frontmatter block', () => {
    expect(out).toMatch(/^---\nsource: gotit\ncaptured_at: 2026-04-28T15:42:00\.000Z/)
  })
  it('lists urls in frontmatter', () => {
    expect(out).toContain('  - https://a.com')
    expect(out).toContain('  - https://b.com')
  })
  it('includes context_kind', () => {
    expect(out).toContain('context_kind: browser_article')
  })
  it('renders title and Links and Notes sections', () => {
    expect(out).toContain('# A page about A')
    expect(out).toContain('## Links')
    expect(out).toContain('- [A](https://a.com)')
    expect(out).toContain('- https://b.com')
    expect(out).toContain('## Notes\n\nMy notes')
  })
})

describe('formatObsidianEntry — override template', () => {
  it('uses supplied body verbatim and keeps frontmatter', () => {
    const out = formatObsidianEntry({
      template: 'override',
      analysis,
      body: '```ts\nconst x = 1\n```',
      sessionId: 'sess_1',
      savedAt: new Date('2026-04-28T15:42:00Z'),
      title: 'A page about A',
    })
    expect(out).toContain('---\nsource: gotit')
    expect(out).toContain('```ts\nconst x = 1\n```')
    expect(out).not.toContain('## Links')
  })
})
````

- [x] **Step 12.2: Run, expect fail.**
- [x] **Step 12.3: Implement**

```ts
// packages/core/src/format-obsidian-entry.ts
import type { AnalysisResult, SessionId } from '@got-it/shared'

export type RenderTemplate = 'default' | 'override'

export type FormatObsidianEntryArgs = {
  template: RenderTemplate
  analysis: AnalysisResult
  body: string
  sessionId: SessionId
  savedAt: Date
  title: string
}

export function formatObsidianEntry(args: FormatObsidianEntryArgs): string {
  const fm = renderFrontmatter(args)
  if (args.template === 'override') {
    return `${fm}\n\n# ${args.title}\n\n${args.body}\n`
  }
  const links = args.analysis.urls
    .map((u) => (u.anchor ? `- [${u.anchor}](${u.href})` : `- ${u.href}`))
    .join('\n')
  const linksSection = links.length > 0 ? `## Links\n\n${links}\n\n` : ''
  return `${fm}\n\n# ${args.title}\n\n${args.analysis.summary}\n\n${linksSection}## Notes\n\n${args.body}\n`
}

function renderFrontmatter(args: FormatObsidianEntryArgs): string {
  const urlLines = args.analysis.urls.map((u) => `  - ${u.href}`).join('\n')
  const urlsBlock = args.analysis.urls.length > 0 ? `urls:\n${urlLines}\n` : ''
  return [
    '---',
    'source: gotit',
    `captured_at: ${args.savedAt.toISOString()}`,
    `session_id: ${args.sessionId}`,
    urlsBlock.trimEnd(),
    `context_kind: ${args.analysis.context_kind}`,
    '---',
  ]
    .filter((l) => l !== '')
    .join('\n')
}
```

- [x] **Step 12.4: Run, expect pass.**
- [x] **Step 12.5: Commit**

```bash
git add packages/core/src/format-obsidian-entry.*
git commit -m "feat(core): add pure formatObsidianEntry (default + override templates)"
```

---

### Task 13: `resolveSaveFormat` (pure)

**Files:**

- Create: `packages/core/src/resolve-save-format.ts` + test

- [x] **Step 13.1: Write failing test**

```ts
// packages/core/src/resolve-save-format.test.ts
import { describe, expect, it } from 'vitest'
import { resolveSaveFormat } from './resolve-save-format.js'

describe('resolveSaveFormat', () => {
  it('returns default when no instruction provided', () => {
    expect(resolveSaveFormat(undefined)).toEqual({ template: 'default', instruction: null })
    expect(resolveSaveFormat('')).toEqual({ template: 'default', instruction: null })
    expect(resolveSaveFormat('  ')).toEqual({ template: 'default', instruction: null })
  })
  it('returns override when instruction is non-empty', () => {
    expect(resolveSaveFormat('save as a code snippet')).toEqual({
      template: 'override',
      instruction: 'save as a code snippet',
    })
  })
  it('trims instruction whitespace', () => {
    expect(resolveSaveFormat('  do this  ')).toEqual({
      template: 'override',
      instruction: 'do this',
    })
  })
})
```

- [x] **Step 13.2: Run, expect fail.**
- [x] **Step 13.3: Implement**

```ts
// packages/core/src/resolve-save-format.ts
import type { RenderTemplate } from './format-obsidian-entry.js'

export type RenderPlan = {
  template: RenderTemplate
  instruction: string | null
}

export function resolveSaveFormat(userInstruction: string | undefined): RenderPlan {
  const trimmed = (userInstruction ?? '').trim()
  if (trimmed.length === 0) return { template: 'default', instruction: null }
  return { template: 'override', instruction: trimmed }
}
```

- [x] **Step 13.4: Run, expect pass.**
- [x] **Step 13.5: Commit**

```bash
git add packages/core/src/resolve-save-format.*
git commit -m "feat(core): add pure resolveSaveFormat"
```

---

### Task 14: `buildChatRequest` (pure)

**Files:**

- Create: `packages/core/src/build-chat-request.ts` + test

This is the multi-modal turn builder per spec §8.4. It takes the session's recent messages plus the latest screen-capture analysis and produces a provider-agnostic chat request payload (Anthropic-shaped for now, but defined as our own type).

- [x] **Step 14.1: Write failing test**

```ts
// packages/core/src/build-chat-request.test.ts
import { describe, expect, it } from 'vitest'
import type { Message } from '@got-it/shared'
import { buildChatRequest } from './build-chat-request.js'

const personaPrompt = 'You are GotIt!, a screen-aware assistant.'
const baseAt = '2026-04-28T12:00:00Z'

const captureMsg: Message = {
  id: 'm1',
  session_id: 's1',
  kind: 'screen_capture',
  image_ref: 'images/abc.png',
  source: 'keybind',
  created_at: baseAt,
  analysis: {
    raw_text: 'GitHub README for a JSON parser',
    urls: [{ href: 'https://github.com/x/y' }],
    regions: [],
    context_kind: 'browser_article',
    summary: 'GitHub repo: a JSON parser',
  },
}

const userMsg: Message = {
  id: 'm2',
  session_id: 's1',
  kind: 'user_text',
  text: 'what does this repo do?',
  source: 'text',
  created_at: baseAt,
}

describe('buildChatRequest', () => {
  it('places persona prompt as system, threads capture analysis as text context, then user turn', () => {
    const req = buildChatRequest({
      personaPrompt,
      messagesTail: [captureMsg],
      userMessage: userMsg,
    })

    expect(req.system).toBe(personaPrompt)
    expect(req.messages).toHaveLength(2)
    expect(req.messages[0]).toMatchObject({
      role: 'user',
      content: expect.stringContaining('Screen context'),
    })
    expect(req.messages[0]?.content).toContain('GitHub repo: a JSON parser')
    expect(req.messages[0]?.content).toContain('https://github.com/x/y')
    expect(req.messages[1]).toEqual({ role: 'user', content: 'what does this repo do?' })
  })

  it('does not include image bytes in the request (text-only threading per §8.4)', () => {
    const req = buildChatRequest({
      personaPrompt,
      messagesTail: [captureMsg],
      userMessage: userMsg,
    })
    const serialized = JSON.stringify(req)
    expect(serialized).not.toMatch(/image_ref/)
    expect(serialized).not.toMatch(/base64/i)
  })

  it('handles no prior capture (chat without context)', () => {
    const req = buildChatRequest({
      personaPrompt,
      messagesTail: [],
      userMessage: userMsg,
    })
    expect(req.messages).toEqual([{ role: 'user', content: 'what does this repo do?' }])
  })

  it('uses only the most recent screen_capture when multiple are present', () => {
    const olderCapture: Message = {
      ...captureMsg,
      id: 'm0',
      analysis: { ...captureMsg.analysis, summary: 'OLD CAPTURE' },
    }
    const req = buildChatRequest({
      personaPrompt,
      messagesTail: [olderCapture, captureMsg],
      userMessage: userMsg,
    })
    expect(JSON.stringify(req)).not.toContain('OLD CAPTURE')
  })

  it('threads prior assistant + user turns in order', () => {
    const assistant: Message = {
      id: 'a1',
      session_id: 's1',
      kind: 'assistant',
      text: 'It parses JSON.',
      created_at: baseAt,
    }
    const followup: Message = { ...userMsg, id: 'u2', text: 'how fast?' }
    const req = buildChatRequest({
      personaPrompt,
      messagesTail: [captureMsg, userMsg, assistant],
      userMessage: followup,
    })
    expect(req.messages.map((m) => m.role)).toEqual(['user', 'user', 'assistant', 'user'])
    expect(req.messages.at(-1)?.content).toBe('how fast?')
  })
})
```

- [x] **Step 14.2: Run, expect fail.**
- [x] **Step 14.3: Implement**

```ts
// packages/core/src/build-chat-request.ts
import type { Message } from '@got-it/shared'

export type ChatRole = 'user' | 'assistant'

export type ChatTurn = {
  role: ChatRole
  content: string
}

export type ChatRequestPayload = {
  system: string
  messages: ChatTurn[]
}

export type BuildChatRequestArgs = {
  personaPrompt: string
  messagesTail: readonly Message[]
  userMessage: Message
}

export function buildChatRequest(args: BuildChatRequestArgs): ChatRequestPayload {
  const messages: ChatTurn[] = []

  const lastCapture = findLastCapture(args.messagesTail)
  if (lastCapture) {
    messages.push({ role: 'user', content: renderCaptureContext(lastCapture) })
  }

  for (const m of args.messagesTail) {
    if (m.kind === 'user_text') {
      messages.push({ role: 'user', content: m.text })
    } else if (m.kind === 'assistant') {
      messages.push({ role: 'assistant', content: m.text })
    }
  }

  if (args.userMessage.kind === 'user_text') {
    messages.push({ role: 'user', content: args.userMessage.text })
  }

  return { system: args.personaPrompt, messages }
}

function findLastCapture(
  messages: readonly Message[]
): Extract<Message, { kind: 'screen_capture' }> | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m && m.kind === 'screen_capture') return m
  }
  return null
}

function renderCaptureContext(m: Extract<Message, { kind: 'screen_capture' }>): string {
  const urls = m.analysis.urls.map((u) => `- ${u.href}`).join('\n')
  const urlsBlock = urls.length > 0 ? `\nURLs:\n${urls}` : ''
  return `Screen context (kind: ${m.analysis.context_kind}):\n${m.analysis.summary}${urlsBlock}`
}
```

- [x] **Step 14.4: Run, expect pass.**
- [x] **Step 14.5: Run purity check.**

```bash
node scripts/purity-check.mjs
```

- [x] **Step 14.6: Commit**

```bash
git add packages/core/src/build-chat-request.*
git commit -m "feat(core): add pure buildChatRequest (multi-modal context as text)"
```

---

### Task 15: `apps/api` package skeleton + dev script

**Files:**

- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/src/server.ts`

- [x] **Step 15.1: Create `apps/api/package.json`**

```json
{
  "name": "@got-it/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30",
    "@got-it/core": "workspace:*",
    "@got-it/shared": "workspace:*",
    "better-sqlite3": "^11",
    "dotenv": "^16",
    "express": "^4",
    "multer": "^1",
    "uuid": "^10",
    "zod": "^3.23"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7",
    "@types/express": "^4",
    "@types/multer": "^1",
    "@types/node": "^22",
    "@types/supertest": "^6",
    "@types/uuid": "^10",
    "supertest": "^7",
    "tsx": "^4"
  }
}
```

- [x] **Step 15.2: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src"]
}
```

- [x] **Step 15.3: Create `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
```

- [x] **Step 15.4: Stub `apps/api/src/server.ts`** (will be replaced in Task 24)

```ts
console.error('apps/api server stub — implemented in Task 24')
```

- [x] **Step 15.5: Install**

```bash
pnpm install
```

- [x] **Step 15.6: Commit**

```bash
git add apps/api/package.json apps/api/tsconfig.json apps/api/vitest.config.ts apps/api/src/server.ts pnpm-lock.yaml
git commit -m "chore(api): scaffold apps/api package"
```

---

### Task 16: `Config` module (env loader, fail-fast)

**Files:**

- Create: `apps/api/src/config.ts`, `apps/api/src/config.test.ts`

Per spec §13.2 — the **only** place `process.env` is read.

- [x] **Step 16.1: Write failing test**

```ts
// apps/api/src/config.test.ts
import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig', () => {
  it('parses a fully populated env', () => {
    const cfg = loadConfig({
      ANTHROPIC_API_KEY: 'sk-test',
      GOTIT_VISION_MODEL: 'm-vision',
      GOTIT_CHAT_MODEL: 'm-chat',
      GOTIT_DB_PATH: '/tmp/db.sqlite',
      GOTIT_DATA_DIR: '/tmp/data',
      PORT: '4000',
      LOG_LEVEL: 'debug',
    })
    expect(cfg.anthropicApiKey).toBe('sk-test')
    expect(cfg.visionModel).toBe('m-vision')
    expect(cfg.port).toBe(4000)
    expect(cfg.logLevel).toBe('debug')
  })

  it('applies defaults for optional vars', () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: 'sk-test' })
    expect(cfg.dbPath).toBe('./data/gotit.db')
    expect(cfg.dataDir).toBe('./data')
    expect(cfg.port).toBe(3000)
    expect(cfg.logLevel).toBe('info')
  })

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    expect(() => loadConfig({})).toThrow(/ANTHROPIC_API_KEY/)
  })

  it('throws on invalid PORT', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: 'sk', PORT: 'not-a-number' })).toThrow()
  })

  it('throws on invalid LOG_LEVEL', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: 'sk', LOG_LEVEL: 'shout' })).toThrow()
  })
})
```

- [x] **Step 16.2: Run, expect fail.**

```bash
pnpm --filter @got-it/api test config
```

- [x] **Step 16.3: Implement**

```ts
// apps/api/src/config.ts
import { z } from 'zod'

const ConfigSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  GOTIT_VISION_MODEL: z.string().default('claude-opus-4-7'),
  GOTIT_CHAT_MODEL: z.string().default('claude-opus-4-7'),
  GOTIT_DB_PATH: z.string().default('./data/gotit.db'),
  GOTIT_DATA_DIR: z.string().default('./data'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
})

export type Config = {
  anthropicApiKey: string
  visionModel: string
  chatModel: string
  dbPath: string
  dataDir: string
  port: number
  logLevel: 'error' | 'warn' | 'info' | 'debug'
}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config {
  const parsed = ConfigSchema.parse(env)
  return {
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    visionModel: parsed.GOTIT_VISION_MODEL,
    chatModel: parsed.GOTIT_CHAT_MODEL,
    dbPath: parsed.GOTIT_DB_PATH,
    dataDir: parsed.GOTIT_DATA_DIR,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
  }
}
```

- [x] **Step 16.4: Run, expect pass.**
- [x] **Step 16.5: Commit**

```bash
git add apps/api/src/config.ts apps/api/src/config.test.ts
git commit -m "feat(api): add Config module with Zod validation, fail-fast on missing keys"
```

---

### Task 17: `Store` infrastructure wrapper (SQLite + Nullable)

**Files:**

- Create: `apps/api/migrations/001_init.sql`, `apps/api/src/infra/store.ts`, `apps/api/src/infra/store.test.ts`

- [x] **Step 17.1: Create `apps/api/migrations/001_init.sql`**

```sql
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  install_id TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  active_session_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  title TEXT
);
CREATE INDEX idx_sessions_device ON sessions(device_id, started_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_session ON messages(session_id, created_at);

CREATE TABLE images (
  ref TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
```

- [x] **Step 17.2: Write failing test**

```ts
// apps/api/src/infra/store.test.ts
import { describe, expect, it, beforeEach } from 'vitest'
import { Store } from './store.js'
import type { Message } from '@got-it/shared'

describe('Store (Nullable)', () => {
  let store: Store
  beforeEach(() => {
    store = Store.createNull()
  })

  it('issues a device token and looks it up', () => {
    const { device_id, token } = store.registerDevice({ install_id: 'inst-1' })
    expect(device_id).toBeTruthy()
    expect(token).toBeTruthy()
    expect(store.findDeviceByToken(token)).toEqual(
      expect.objectContaining({ id: device_id, install_id: 'inst-1' })
    )
  })

  it('creates a session and sets it active', () => {
    const { device_id } = store.registerDevice({ install_id: 'inst-1' })
    const session = store.createSession({ device_id, now: new Date('2026-04-28T10:00:00Z') })
    store.setActiveSession({ device_id, session_id: session.id })
    expect(store.getActiveSession(device_id)?.id).toBe(session.id)
  })

  it('appends messages and reads them in order', () => {
    const { device_id } = store.registerDevice({ install_id: 'inst-1' })
    const session = store.createSession({ device_id, now: new Date() })
    const m: Message = {
      id: 'm1',
      session_id: session.id,
      kind: 'user_text',
      text: 'hi',
      source: 'text',
      created_at: '2026-04-28T10:00:01Z',
    }
    store.appendMessage(m)
    expect(store.listMessages({ session_id: session.id, limit: 50 })).toEqual([m])
  })

  it('lists sessions reverse-chronologically per device', () => {
    const { device_id } = store.registerDevice({ install_id: 'inst-1' })
    const s1 = store.createSession({ device_id, now: new Date('2026-04-28T10:00:00Z') })
    const s2 = store.createSession({ device_id, now: new Date('2026-04-28T11:00:00Z') })
    expect(store.listSessions({ device_id, limit: 10 }).map((s) => s.id)).toEqual([s2.id, s1.id])
  })
})
```

- [x] **Step 17.3: Run, expect fail.**

- [x] **Step 17.4: Implement** — `Store` with two backends: real (better-sqlite3) and embedded stub used by `createNull()`. Both implement the same interface.

```ts
// apps/api/src/infra/store.ts
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { Message, Session, DeviceId, SessionId } from '@got-it/shared'

export type Device = {
  id: DeviceId
  install_id: string
  token: string
  active_session_id: SessionId | null
  created_at: string
}

export interface StoreBackend {
  registerDevice(args: { install_id: string }): { device_id: DeviceId; token: string }
  findDeviceByToken(token: string): Device | null
  createSession(args: { device_id: DeviceId; now: Date }): Session
  setActiveSession(args: { device_id: DeviceId; session_id: SessionId }): void
  getActiveSession(device_id: DeviceId): Session | null
  listSessions(args: { device_id: DeviceId; limit: number }): Session[]
  getSession(session_id: SessionId): Session | null
  appendMessage(m: Message): void
  listMessages(args: { session_id: SessionId; limit: number }): Message[]
}

export class Store {
  private constructor(private readonly backend: StoreBackend) {}

  static create(args: { dbPath: string; migrationsDir: string }): Store {
    const db = new Database(args.dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    const sql = readFileSync(resolve(args.migrationsDir, '001_init.sql'), 'utf8')
    db.exec(sql)
    return new Store(new SqliteBackend(db))
  }

  static createNull(): Store {
    return new Store(new InMemoryBackend())
  }

  registerDevice(args: { install_id: string }) {
    return this.backend.registerDevice(args)
  }
  findDeviceByToken(token: string) {
    return this.backend.findDeviceByToken(token)
  }
  createSession(args: { device_id: DeviceId; now: Date }) {
    return this.backend.createSession(args)
  }
  setActiveSession(args: { device_id: DeviceId; session_id: SessionId }) {
    return this.backend.setActiveSession(args)
  }
  getActiveSession(device_id: DeviceId) {
    return this.backend.getActiveSession(device_id)
  }
  listSessions(args: { device_id: DeviceId; limit: number }) {
    return this.backend.listSessions(args)
  }
  getSession(session_id: SessionId) {
    return this.backend.getSession(session_id)
  }
  appendMessage(m: Message) {
    return this.backend.appendMessage(m)
  }
  listMessages(args: { session_id: SessionId; limit: number }) {
    return this.backend.listMessages(args)
  }
}

// ───── In-memory backend (production code, used by createNull) ─────
class InMemoryBackend implements StoreBackend {
  private devices = new Map<DeviceId, Device>()
  private byToken = new Map<string, DeviceId>()
  private sessions = new Map<SessionId, Session>()
  private messages = new Map<SessionId, Message[]>()

  registerDevice({ install_id }: { install_id: string }) {
    for (const d of this.devices.values()) {
      if (d.install_id === install_id) {
        return { device_id: d.id, token: d.token }
      }
    }
    const id = uuid()
    const token = uuid()
    const device: Device = {
      id,
      install_id,
      token,
      active_session_id: null,
      created_at: new Date().toISOString(),
    }
    this.devices.set(id, device)
    this.byToken.set(token, id)
    return { device_id: id, token }
  }
  findDeviceByToken(token: string) {
    const id = this.byToken.get(token)
    return id ? (this.devices.get(id) ?? null) : null
  }
  createSession({ device_id, now }: { device_id: DeviceId; now: Date }) {
    const s: Session = {
      id: uuid(),
      device_id,
      started_at: now.toISOString(),
      ended_at: null,
      title: null,
    }
    this.sessions.set(s.id, s)
    return s
  }
  setActiveSession({ device_id, session_id }: { device_id: DeviceId; session_id: SessionId }) {
    const d = this.devices.get(device_id)
    if (d) d.active_session_id = session_id
  }
  getActiveSession(device_id: DeviceId) {
    const d = this.devices.get(device_id)
    if (!d?.active_session_id) return null
    return this.sessions.get(d.active_session_id) ?? null
  }
  listSessions({ device_id, limit }: { device_id: DeviceId; limit: number }) {
    return [...this.sessions.values()]
      .filter((s) => s.device_id === device_id)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, limit)
  }
  getSession(session_id: SessionId) {
    return this.sessions.get(session_id) ?? null
  }
  appendMessage(m: Message) {
    const arr = this.messages.get(m.session_id) ?? []
    arr.push(m)
    this.messages.set(m.session_id, arr)
  }
  listMessages({ session_id, limit }: { session_id: SessionId; limit: number }) {
    return (this.messages.get(session_id) ?? []).slice(-limit)
  }
}

// ───── SQLite backend ─────
class SqliteBackend implements StoreBackend {
  constructor(private readonly db: Database.Database) {}

  registerDevice({ install_id }: { install_id: string }) {
    const existing = this.db
      .prepare('SELECT id, token FROM devices WHERE install_id = ?')
      .get(install_id) as { id: string; token: string } | undefined
    if (existing) return { device_id: existing.id, token: existing.token }
    const id = uuid()
    const token = uuid()
    this.db
      .prepare(
        'INSERT INTO devices(id, install_id, token, active_session_id, created_at) VALUES (?, ?, ?, NULL, ?)'
      )
      .run(id, install_id, token, new Date().toISOString())
    return { device_id: id, token }
  }
  findDeviceByToken(token: string) {
    return (
      (this.db.prepare('SELECT * FROM devices WHERE token = ?').get(token) as Device | undefined) ??
      null
    )
  }
  createSession({ device_id, now }: { device_id: DeviceId; now: Date }) {
    const id = uuid()
    const startedAt = now.toISOString()
    this.db
      .prepare(
        'INSERT INTO sessions(id, device_id, started_at, ended_at, title) VALUES (?, ?, ?, NULL, NULL)'
      )
      .run(id, device_id, startedAt)
    return { id, device_id, started_at: startedAt, ended_at: null, title: null }
  }
  setActiveSession({ device_id, session_id }: { device_id: DeviceId; session_id: SessionId }) {
    this.db
      .prepare('UPDATE devices SET active_session_id = ? WHERE id = ?')
      .run(session_id, device_id)
  }
  getActiveSession(device_id: DeviceId) {
    const row = this.db
      .prepare(
        'SELECT s.* FROM sessions s JOIN devices d ON d.active_session_id = s.id WHERE d.id = ?'
      )
      .get(device_id)
    return (row as Session | undefined) ?? null
  }
  listSessions({ device_id, limit }: { device_id: DeviceId; limit: number }) {
    return this.db
      .prepare('SELECT * FROM sessions WHERE device_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(device_id, limit) as Session[]
  }
  getSession(session_id: SessionId) {
    return (
      (this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id) as
        | Session
        | undefined) ?? null
    )
  }
  appendMessage(m: Message) {
    this.db
      .prepare(
        'INSERT INTO messages(id, session_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(m.id, m.session_id, m.kind, JSON.stringify(m), m.created_at)
  }
  listMessages({ session_id, limit }: { session_id: SessionId; limit: number }) {
    const rows = this.db
      .prepare('SELECT payload FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?')
      .all(session_id, limit) as { payload: string }[]
    return rows.map((r) => JSON.parse(r.payload) as Message)
  }
}
```

- [x] **Step 17.5: Run, expect pass.**

```bash
pnpm --filter @got-it/api test store
```

- [x] **Step 17.6: Commit**

```bash
git add apps/api/migrations apps/api/src/infra/store.*
git commit -m "feat(api): add Store wrapper with SQLite backend and in-memory Nullable"
```

---

### Task 18: `VisionAI` infrastructure wrapper (Anthropic + Nullable)

**Files:**

- Create: `apps/api/src/prompts/default-vision.ts`, `apps/api/src/infra/vision-ai.ts`, `apps/api/src/infra/vision-ai.test.ts`

- [x] **Step 18.1: Create the default vision prompt**

```ts
// apps/api/src/prompts/default-vision.ts
export const DEFAULT_VISION_PROMPT = `You are GotIt!'s screen-analysis engine.

Given a screenshot, return a structured JSON object with these fields:
- raw_text: all visible text, grouped by visual region.
- urls: every URL/link visible. Each entry has href and optionally anchor and near_text.
- regions: visual regions {kind, text, optional bbox}. kind ∈ {header, paragraph, code, ui, media}.
- context_kind: one of browser_article | code | chat | video | doc | unknown.
- summary: concise 1-3 sentence summary the user can question or save.

Prioritize URLs first. Return JSON matching the schema exactly. No prose outside JSON.`
```

- [x] **Step 18.2: Write failing test**

```ts
// apps/api/src/infra/vision-ai.test.ts
import { describe, expect, it } from 'vitest'
import { VisionAI } from './vision-ai.js'

describe('VisionAI (Nullable)', () => {
  it('returns the configured analysis on analyze()', async () => {
    const ai = VisionAI.createNull({
      analysis: {
        raw_text: 'hi',
        urls: [{ href: 'https://example.com' }],
        regions: [],
        context_kind: 'browser_article',
        summary: 'a page',
      },
    })
    const result = await ai.analyze({ image: Buffer.from('fake'), prompt: 'p' })
    expect(result.summary).toBe('a page')
    expect(result.urls[0]?.href).toBe('https://example.com')
  })

  it('throws when configured to fail', async () => {
    const ai = VisionAI.createNull({ failure: new Error('vision down') })
    await expect(ai.analyze({ image: Buffer.from('x'), prompt: 'p' })).rejects.toThrow(
      'vision down'
    )
  })
})
```

- [x] **Step 18.3: Run, expect fail.**

- [x] **Step 18.4: Implement**

```ts
// apps/api/src/infra/vision-ai.ts
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
              source: { type: 'base64', media_type: 'image/png', data: image.toString('base64') },
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
```

- [x] **Step 18.5: Run, expect pass.**
- [x] **Step 18.6: Commit**

```bash
git add apps/api/src/prompts/default-vision.ts apps/api/src/infra/vision-ai.*
git commit -m "feat(api): add VisionAI wrapper (Anthropic backend + Nullable stub)"
```

---

### Task 19: `ChatAI` infrastructure wrapper

**Files:**

- Create: `apps/api/src/prompts/default-chat.ts`, `apps/api/src/infra/chat-ai.ts`, `apps/api/src/infra/chat-ai.test.ts`

- [x] **Step 19.1: Create default chat persona prompt**

```ts
// apps/api/src/prompts/default-chat.ts
export const DEFAULT_CHAT_PROMPT = `You are GotIt!, a concise screen-aware second-brain assistant.

Behaviors:
- Reason from the latest screen context provided as text. Do not invent details not present.
- Be terse. Prefer 1-3 sentence answers. Bullet lists when listing.
- When the user asks to save, do not draft the save body — the save layer handles that.
- If the user asks about content not visible, say so plainly.
- Never include raw HTML, never use emojis unless the user does first.`
```

- [x] **Step 19.2: Write failing test**

```ts
// apps/api/src/infra/chat-ai.test.ts
import { describe, expect, it } from 'vitest'
import { ChatAI } from './chat-ai.js'

describe('ChatAI (Nullable)', () => {
  it('returns the configured response', async () => {
    const ai = ChatAI.createNull({ responses: ['hello there'] })
    const out = await ai.complete({
      system: 'persona',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(out).toBe('hello there')
  })

  it('cycles through queued responses', async () => {
    const ai = ChatAI.createNull({ responses: ['a', 'b'] })
    const r1 = await ai.complete({ system: 's', messages: [{ role: 'user', content: 'x' }] })
    const r2 = await ai.complete({ system: 's', messages: [{ role: 'user', content: 'y' }] })
    expect([r1, r2]).toEqual(['a', 'b'])
  })

  it('throws when configured to fail', async () => {
    const ai = ChatAI.createNull({ failure: new Error('chat down') })
    await expect(
      ai.complete({ system: 's', messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toThrow('chat down')
  })
})
```

- [x] **Step 19.3: Run, expect fail.**
- [x] **Step 19.4: Implement**

```ts
// apps/api/src/infra/chat-ai.ts
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
```

- [x] **Step 19.5: Run, expect pass.**
- [x] **Step 19.6: Commit**

```bash
git add apps/api/src/prompts/default-chat.ts apps/api/src/infra/chat-ai.*
git commit -m "feat(api): add ChatAI wrapper (Anthropic backend + Nullable stub)"
```

---

### Task 20: `ObsidianWriter` infrastructure wrapper

**Files:**

- Create: `apps/api/src/infra/obsidian-writer.ts`, `apps/api/src/infra/obsidian-writer.test.ts`

- [x] **Step 20.1: Write failing test**

```ts
// apps/api/src/infra/obsidian-writer.test.ts
import { describe, expect, it } from 'vitest'
import { ObsidianWriter } from './obsidian-writer.js'

describe('ObsidianWriter (Nullable)', () => {
  it('records writes for inspection', async () => {
    const w = ObsidianWriter.createNull()
    const result = await w.write({
      vaultPath: '/tmp/vault',
      relativePath: 'GotIt!/file.md',
      contents: '# hi',
    })
    expect(result.fullPath).toBe('/tmp/vault/GotIt!/file.md')
    expect(w.writes).toHaveLength(1)
    expect(w.writes[0]?.contents).toBe('# hi')
  })

  it('reports existing filenames in a folder', async () => {
    const w = ObsidianWriter.createNull({
      existing: { 'GotIt!': new Set(['a.md', 'b.md']) },
    })
    expect(await w.listFolder({ vaultPath: '/tmp/vault', relativeFolder: 'GotIt!' })).toEqual(
      new Set(['a.md', 'b.md'])
    )
  })

  it('throws when vault path missing', async () => {
    const w = ObsidianWriter.createNull({ writeFailure: new Error('ENOENT') })
    await expect(
      w.write({ vaultPath: '/nope', relativePath: 'x.md', contents: '' })
    ).rejects.toThrow('ENOENT')
  })
})
```

- [x] **Step 20.2: Run, expect fail.**

- [x] **Step 20.3: Implement**

```ts
// apps/api/src/infra/obsidian-writer.ts
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

export type WriteArgs = { vaultPath: string; relativePath: string; contents: string }
export type ListFolderArgs = { vaultPath: string; relativeFolder: string }
export type WriteResult = { fullPath: string }

export interface ObsidianBackend {
  write(args: WriteArgs): Promise<WriteResult>
  listFolder(args: ListFolderArgs): Promise<Set<string>>
}

export type NullableObsidianConfig = {
  existing?: Record<string, Set<string>>
  writeFailure?: Error
}

export class ObsidianWriter {
  readonly writes: WriteArgs[] = []

  private constructor(
    private readonly backend: ObsidianBackend,
    private readonly trackingStub?: StubBackend
  ) {}

  static create(): ObsidianWriter {
    return new ObsidianWriter(new RealBackend())
  }

  static createNull(config: NullableObsidianConfig = {}): ObsidianWriter {
    const stub = new StubBackend(config)
    const w = new ObsidianWriter(stub, stub)
    return w
  }

  async write(args: WriteArgs): Promise<WriteResult> {
    const result = await this.backend.write(args)
    if (this.trackingStub) this.writes.push({ ...args })
    return result
  }
  listFolder(args: ListFolderArgs): Promise<Set<string>> {
    return this.backend.listFolder(args)
  }
}

class RealBackend implements ObsidianBackend {
  async write({ vaultPath, relativePath, contents }: WriteArgs): Promise<WriteResult> {
    const fullPath = join(vaultPath, relativePath)
    await mkdir(dirname(fullPath), { recursive: true })
    const tmp = `${fullPath}.${randomBytes(4).toString('hex')}.tmp`
    await writeFile(tmp, contents, 'utf8')
    await rename(tmp, fullPath)
    return { fullPath }
  }
  async listFolder({ vaultPath, relativeFolder }: ListFolderArgs): Promise<Set<string>> {
    try {
      const entries = await readdir(join(vaultPath, relativeFolder))
      return new Set(entries)
    } catch {
      return new Set()
    }
  }
}

class StubBackend implements ObsidianBackend {
  constructor(private readonly config: NullableObsidianConfig) {}
  async write({ vaultPath, relativePath }: WriteArgs): Promise<WriteResult> {
    if (this.config.writeFailure) throw this.config.writeFailure
    return { fullPath: join(vaultPath, relativePath) }
  }
  async listFolder({ relativeFolder }: ListFolderArgs): Promise<Set<string>> {
    return this.config.existing?.[relativeFolder] ?? new Set()
  }
}
```

- [x] **Step 20.4: Run, expect pass.**
- [x] **Step 20.5: Commit**

```bash
git add apps/api/src/infra/obsidian-writer.*
git commit -m "feat(api): add ObsidianWriter wrapper (atomic writes + Nullable)"
```

---

### Task 21: Express `createApp` factory + auth middleware

**Files:**

- Create: `apps/api/src/middleware/auth.ts`, `apps/api/src/app.ts`

- [x] **Step 21.1: Create `apps/api/src/middleware/auth.ts`**

```ts
// apps/api/src/middleware/auth.ts
import type { NextFunction, Request, Response } from 'express'
import type { Store } from '../infra/store.js'
import type { Device } from '../infra/store.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      device?: Device
    }
  }
}

export function deviceAuth(store: Store) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.header('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) {
      res.status(401).json({ error: 'missing bearer token' })
      return
    }
    const device = store.findDeviceByToken(token)
    if (!device) {
      res.status(401).json({ error: 'invalid token' })
      return
    }
    req.device = device
    next()
  }
}
```

- [x] **Step 21.2: Create `apps/api/src/app.ts`** — DI factory. Routes are registered in tasks 22-26 by appending to this file or via separate router files imported here. Initial form:

```ts
// apps/api/src/app.ts
import express, { type Express } from 'express'
import type { Store } from './infra/store.js'
import type { VisionAI } from './infra/vision-ai.js'
import type { ChatAI } from './infra/chat-ai.js'
import type { ObsidianWriter } from './infra/obsidian-writer.js'
import { healthRoute } from './routes/health.js'
import { deviceRoute } from './routes/device.js'
import { sessionsRouter } from './routes/sessions.js'
import { captureRouter } from './routes/capture.js'
import { chatRouter } from './routes/chat.js'
import { saveRouter } from './routes/save.js'

export type AppDeps = {
  store: Store
  visionAI: VisionAI
  chatAI: ChatAI
  obsidianWriter: ObsidianWriter
  visionPrompt: string
  chatPersonaPrompt: string
  vaultPath: string
  captureFolder: string
  dataDir: string
  version: string
}

export function createApp(deps: AppDeps): Express {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  app.use('/health', healthRoute(deps))
  app.use('/device', deviceRoute(deps))
  app.use('/sessions', sessionsRouter(deps))
  app.use('/capture', captureRouter(deps))
  app.use('/chat', chatRouter(deps))
  app.use('/save', saveRouter(deps))

  return app
}
```

(The route imports will fail until tasks 22-26. That's expected.)

- [x] **Step 21.3: Commit (without yet running)**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/app.ts
git commit -m "feat(api): add createApp factory and deviceAuth middleware"
```

---

### Task 22: `GET /health` and `POST /device` routes

**Files:**

- Create: `apps/api/src/routes/health.ts` + `.test.ts`, `apps/api/src/routes/device.ts` + `.test.ts`

- [x] **Step 22.1: Write failing test for health**

```ts
// apps/api/src/routes/health.test.ts
import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { Store } from '../infra/store.js'
import { VisionAI } from '../infra/vision-ai.js'
import { ChatAI } from '../infra/chat-ai.js'
import { ObsidianWriter } from '../infra/obsidian-writer.js'

function makeApp() {
  return createApp({
    store: Store.createNull(),
    visionAI: VisionAI.createNull(),
    chatAI: ChatAI.createNull(),
    obsidianWriter: ObsidianWriter.createNull(),
    visionPrompt: 'p',
    chatPersonaPrompt: 'p',
    vaultPath: '/tmp/vault',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
}

describe('GET /health', () => {
  it('returns ok and version', async () => {
    const app = makeApp()
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, version: 'test' })
  })
})
```

- [x] **Step 22.2: Run, expect fail.**

- [x] **Step 22.3: Implement**

```ts
// apps/api/src/routes/health.ts
import { Router } from 'express'
import type { AppDeps } from '../app.js'

export function healthRoute(deps: AppDeps): Router {
  const r = Router()
  r.get('/', (_req, res) => {
    res.json({ ok: true, version: deps.version })
  })
  return r
}
```

- [x] **Step 22.4: Run, expect pass.**

- [x] **Step 22.5: Write failing test for device registration**

```ts
// apps/api/src/routes/device.test.ts
import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { Store } from '../infra/store.js'
import { VisionAI } from '../infra/vision-ai.js'
import { ChatAI } from '../infra/chat-ai.js'
import { ObsidianWriter } from '../infra/obsidian-writer.js'

function makeApp(store: Store) {
  return createApp({
    store,
    visionAI: VisionAI.createNull(),
    chatAI: ChatAI.createNull(),
    obsidianWriter: ObsidianWriter.createNull(),
    visionPrompt: 'p',
    chatPersonaPrompt: 'p',
    vaultPath: '/tmp/vault',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
}

describe('POST /device', () => {
  it('issues a device_id and token', async () => {
    const app = makeApp(Store.createNull())
    const res = await request(app).post('/device').send({ install_id: 'inst-1' })
    expect(res.status).toBe(201)
    expect(res.body.device_id).toBeTruthy()
    expect(res.body.token).toBeTruthy()
  })

  it('rejects empty install_id', async () => {
    const app = makeApp(Store.createNull())
    const res = await request(app).post('/device').send({ install_id: '' })
    expect(res.status).toBe(400)
  })

  it('returns the same device on repeated registration with same install_id', async () => {
    const store = Store.createNull()
    const app = makeApp(store)
    const r1 = await request(app).post('/device').send({ install_id: 'inst-1' })
    const r2 = await request(app).post('/device').send({ install_id: 'inst-1' })
    expect(r1.body.device_id).toBe(r2.body.device_id)
  })
})
```

- [x] **Step 22.6: Run, expect fail.**

- [x] **Step 22.7: Implement**

```ts
// apps/api/src/routes/device.ts
import { Router } from 'express'
import { DeviceRegistrationRequestSchema } from '@got-it/shared'
import type { AppDeps } from '../app.js'

export function deviceRoute(deps: AppDeps): Router {
  const r = Router()
  r.post('/', (req, res) => {
    const parsed = DeviceRegistrationRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message })
      return
    }
    const { device_id, token } = deps.store.registerDevice({ install_id: parsed.data.install_id })
    res.status(201).json({ device_id, token })
  })
  return r
}
```

(In-memory `Store.createNull()` already short-circuits duplicate `install_id` because `registerDevice` checks for existing record. Confirm in test — fix Nullable backend if needed.)

- [x] **Step 22.8: Run, expect pass.** The in-memory `registerDevice` (Task 17) already deduplicates by `install_id`, mirroring the SQLite branch, so the duplicate-install test passes without further changes.

- [x] **Step 22.9: Commit**

```bash
git add apps/api/src/routes/health.* apps/api/src/routes/device.*
git commit -m "feat(api): add GET /health and POST /device routes"
```

---

### Task 23: Sessions routes

**Files:**

- Create: `apps/api/src/routes/sessions.ts` + `.test.ts`

Covers `POST /sessions` (reset → new active), `GET /sessions/active`, `POST /sessions/:id/activate`, `GET /sessions`.

- [x] **Step 23.1: Write failing test**

```ts
// apps/api/src/routes/sessions.test.ts
import { describe, expect, it, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { Store } from '../infra/store.js'
import { VisionAI } from '../infra/vision-ai.js'
import { ChatAI } from '../infra/chat-ai.js'
import { ObsidianWriter } from '../infra/obsidian-writer.js'

function setup() {
  const store = Store.createNull()
  const { token } = store.registerDevice({ install_id: 'inst-1' })
  const app = createApp({
    store,
    visionAI: VisionAI.createNull(),
    chatAI: ChatAI.createNull(),
    obsidianWriter: ObsidianWriter.createNull(),
    visionPrompt: 'p',
    chatPersonaPrompt: 'p',
    vaultPath: '/tmp/vault',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
  return { app, store, token }
}

describe('sessions routes', () => {
  it('POST /sessions creates and activates a new session', async () => {
    const { app, token } = setup()
    const res = await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(201)
    expect(res.body.session_id).toBeTruthy()
    expect(res.body.started_at).toBeTruthy()
  })

  it('GET /sessions/active returns the active session and tail', async () => {
    const { app, token } = setup()
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    const res = await request(app).get('/sessions/active').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.session.id).toBeTruthy()
    expect(res.body.messages_tail).toEqual([])
  })

  it('POST /sessions/:id/activate sets the given session active', async () => {
    const { app, token } = setup()
    const r1 = await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    const sid1 = r1.body.session_id
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`) // creates and activates a 2nd
    const res = await request(app)
      .post(`/sessions/${sid1}/activate`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.session.id).toBe(sid1)
  })

  it('GET /sessions lists newest first', async () => {
    const { app, token } = setup()
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    const res = await request(app).get('/sessions').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.sessions).toHaveLength(2)
    expect(res.body.sessions[0].started_at >= res.body.sessions[1].started_at).toBe(true)
  })

  it('rejects unauthenticated requests', async () => {
    const { app } = setup()
    const res = await request(app).get('/sessions/active')
    expect(res.status).toBe(401)
  })
})
```

- [x] **Step 23.2: Run, expect fail.**

- [x] **Step 23.3: Implement**

```ts
// apps/api/src/routes/sessions.ts
import { Router } from 'express'
import { startNewSession } from '@got-it/core'
import type { AppDeps } from '../app.js'
import { deviceAuth } from '../middleware/auth.js'

export function sessionsRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))

  r.post('/', (req, res) => {
    const device = req.device!
    const session = deps.store.createSession({ device_id: device.id, now: new Date() })
    deps.store.setActiveSession({ device_id: device.id, session_id: session.id })
    res.status(201).json({ session_id: session.id, started_at: session.started_at })
  })

  r.get('/active', (req, res) => {
    const device = req.device!
    const session = deps.store.getActiveSession(device.id)
    if (!session) {
      res.status(404).json({ error: 'no active session' })
      return
    }
    const messages_tail = deps.store.listMessages({ session_id: session.id, limit: 50 })
    res.json({ session, messages_tail })
  })

  r.post('/:id/activate', (req, res) => {
    const device = req.device!
    const session_id = req.params.id
    const session = deps.store.getSession(session_id)
    if (!session || session.device_id !== device.id) {
      res.status(404).json({ error: 'session not found' })
      return
    }
    deps.store.setActiveSession({ device_id: device.id, session_id })
    const messages_tail = deps.store.listMessages({ session_id, limit: 50 })
    res.json({ session, messages_tail })
  })

  r.get('/', (req, res) => {
    const device = req.device!
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200)
    const sessions = deps.store.listSessions({ device_id: device.id, limit })
    res.json({ sessions })
  })

  return r
}
```

- [x] **Step 23.4: Run, expect pass.**
- [x] **Step 23.5: Commit**

```bash
git add apps/api/src/routes/sessions.*
git commit -m "feat(api): add sessions routes (create/active/activate/list) with deviceAuth"
```

---

### Task 24: `POST /capture` route + multer

**Files:**

- Create: `apps/api/src/routes/capture.ts` + `.test.ts`

- [x] **Step 24.1: Write failing test**

```ts
// apps/api/src/routes/capture.test.ts
import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { Store } from '../infra/store.js'
import { VisionAI } from '../infra/vision-ai.js'
import { ChatAI } from '../infra/chat-ai.js'
import { ObsidianWriter } from '../infra/obsidian-writer.js'

const sampleAnalysis = {
  raw_text: 'README for cool-lib',
  urls: [{ href: 'https://github.com/x/cool-lib' }],
  regions: [],
  context_kind: 'browser_article' as const,
  summary: 'GitHub repo: cool-lib',
}

function setup(opts: { chatResponse?: string; visionAnalysis?: typeof sampleAnalysis } = {}) {
  const store = Store.createNull()
  const { token } = store.registerDevice({ install_id: 'inst-1' })
  store.setActiveSession({
    device_id: store.findDeviceByToken(token)!.id,
    session_id: store.createSession({
      device_id: store.findDeviceByToken(token)!.id,
      now: new Date(),
    }).id,
  })
  const app = createApp({
    store,
    visionAI: VisionAI.createNull({ analysis: opts.visionAnalysis ?? sampleAnalysis }),
    chatAI: ChatAI.createNull({
      responses: [opts.chatResponse ?? 'Looks like a JSON parser repo.'],
    }),
    obsidianWriter: ObsidianWriter.createNull(),
    visionPrompt: 'p',
    chatPersonaPrompt: 'p',
    vaultPath: '/tmp/vault',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
  return { app, token, store }
}

describe('POST /capture', () => {
  it('runs vision, appends capture + assistant messages, returns analysis', async () => {
    const { app, token } = setup()
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('fake-image-bytes'), 'screen.png')
    expect(res.status).toBe(201)
    expect(res.body.analysis.summary).toBe('GitHub repo: cool-lib')
    expect(res.body.assistant_message.text).toMatch(/JSON parser/)
  })

  it('rejects when no active session', async () => {
    const store = Store.createNull()
    const { token } = store.registerDevice({ install_id: 'inst-1' })
    const app = createApp({
      store,
      visionAI: VisionAI.createNull({ analysis: sampleAnalysis }),
      chatAI: ChatAI.createNull({ responses: ['x'] }),
      obsidianWriter: ObsidianWriter.createNull(),
      visionPrompt: 'p',
      chatPersonaPrompt: 'p',
      vaultPath: '/tmp/vault',
      captureFolder: 'GotIt!',
      dataDir: '/tmp/data',
      version: 'test',
    })
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('x'), 'a.png')
    expect(res.status).toBe(409)
  })

  it('rejects invalid source', async () => {
    const { app, token } = setup()
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'bogus')
      .attach('image', Buffer.from('x'), 'a.png')
    expect(res.status).toBe(400)
  })

  it('returns 502 on vision provider failure', async () => {
    const { app, token } = setup()
    // Override visionAI on this app — cleaner: build a fresh app with failing VisionAI
    const store2 = Store.createNull()
    const { token: t2 } = store2.registerDevice({ install_id: 'i2' })
    store2.setActiveSession({
      device_id: store2.findDeviceByToken(t2)!.id,
      session_id: store2.createSession({
        device_id: store2.findDeviceByToken(t2)!.id,
        now: new Date(),
      }).id,
    })
    const app2 = createApp({
      store: store2,
      visionAI: VisionAI.createNull({ failure: new Error('vision down') }),
      chatAI: ChatAI.createNull({ responses: ['x'] }),
      obsidianWriter: ObsidianWriter.createNull(),
      visionPrompt: 'p',
      chatPersonaPrompt: 'p',
      vaultPath: '/tmp/vault',
      captureFolder: 'GotIt!',
      dataDir: '/tmp/data',
      version: 'test',
    })
    const res = await request(app2)
      .post('/capture')
      .set('Authorization', `Bearer ${t2}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('x'), 'a.png')
    expect(res.status).toBe(502)
  })
})
```

- [x] **Step 24.2: Run, expect fail.**

- [x] **Step 24.3: Implement**

```ts
// apps/api/src/routes/capture.ts
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { v4 as uuid } from 'uuid'
import { CaptureSourceSchema } from '@got-it/shared'
import { buildChatRequest } from '@got-it/core'
import type { Message } from '@got-it/shared'
import type { AppDeps } from '../app.js'
import { deviceAuth } from '../middleware/auth.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

export function captureRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))

  r.post('/', upload.single('image'), async (req, res) => {
    const sourceParse = CaptureSourceSchema.safeParse(req.body.source)
    if (!sourceParse.success) {
      res.status(400).json({ error: 'invalid source' })
      return
    }
    if (!req.file) {
      res.status(400).json({ error: 'image is required' })
      return
    }
    const device = req.device!
    const session = deps.store.getActiveSession(device.id)
    if (!session) {
      res.status(409).json({ error: 'no active session — call POST /sessions first' })
      return
    }

    let analysis
    try {
      analysis = await deps.visionAI.analyze({ image: req.file.buffer, prompt: deps.visionPrompt })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'vision failure'
      res.status(502).json({ error: msg })
      return
    }

    const imageRef = `${uuid()}.png`
    const imagesDir = join(deps.dataDir, 'images')
    await mkdir(imagesDir, { recursive: true })
    await writeFile(join(imagesDir, imageRef), req.file.buffer)

    const now = new Date().toISOString()
    const captureMessage: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'screen_capture',
      image_ref: imageRef,
      analysis,
      source: sourceParse.data,
      created_at: now,
    }
    deps.store.appendMessage(captureMessage)

    const tail = deps.store.listMessages({ session_id: session.id, limit: 50 })
    const userTextStub: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'user_text',
      text: 'Summarize the screen.',
      source: 'text',
      created_at: now,
    }
    const chatPayload = buildChatRequest({
      personaPrompt: deps.chatPersonaPrompt,
      messagesTail: tail,
      userMessage: userTextStub,
    })
    let assistantText: string
    try {
      assistantText = await deps.chatAI.complete(chatPayload)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'chat failure'
      res.status(502).json({ error: msg })
      return
    }

    const assistantMessage: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'assistant',
      text: assistantText,
      created_at: new Date().toISOString(),
    }
    deps.store.appendMessage(assistantMessage)

    res.status(201).json({
      message_id: captureMessage.id,
      analysis,
      assistant_message: assistantMessage,
    })
  })

  return r
}
```

- [x] **Step 24.4: Run, expect pass.**
- [x] **Step 24.5: Commit**

```bash
git add apps/api/src/routes/capture.*
git commit -m "feat(api): add POST /capture (vision + auto-summary chat turn)"
```

---

### Task 25: `POST /chat` route

**Files:**

- Create: `apps/api/src/routes/chat.ts` + `.test.ts`

- [x] **Step 25.1: Write failing test**

```ts
// apps/api/src/routes/chat.test.ts
import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { Store } from '../infra/store.js'
import { VisionAI } from '../infra/vision-ai.js'
import { ChatAI } from '../infra/chat-ai.js'
import { ObsidianWriter } from '../infra/obsidian-writer.js'

function setup(chatResponse = 'reply') {
  const store = Store.createNull()
  const { token } = store.registerDevice({ install_id: 'i' })
  const device = store.findDeviceByToken(token)!
  const session = store.createSession({ device_id: device.id, now: new Date() })
  store.setActiveSession({ device_id: device.id, session_id: session.id })
  const app = createApp({
    store,
    visionAI: VisionAI.createNull(),
    chatAI: ChatAI.createNull({ responses: [chatResponse] }),
    obsidianWriter: ObsidianWriter.createNull(),
    visionPrompt: 'p',
    chatPersonaPrompt: 'persona',
    vaultPath: '/tmp/vault',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
  return { app, token, store, device, session }
}

describe('POST /chat', () => {
  it('appends user message, returns assistant reply', async () => {
    const { app, token } = setup('hello back')
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'hello', source: 'text' })
    expect(res.status).toBe(201)
    expect(res.body.assistant_message.text).toBe('hello back')
  })

  it('rejects empty text', async () => {
    const { app, token } = setup()
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '', source: 'text' })
    expect(res.status).toBe(400)
  })

  it('rejects mic/listen sources in Phase 1a (deferred to 1b/1c)', async () => {
    const { app, token } = setup()
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'voice text', source: 'mic' })
    expect(res.status).toBe(400)
  })
})
```

- [x] **Step 25.2: Run, expect fail.**

- [x] **Step 25.3: Implement**

```ts
// apps/api/src/routes/chat.ts
import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { ChatRequestSchema } from '@got-it/shared'
import { buildChatRequest } from '@got-it/core'
import type { Message } from '@got-it/shared'
import type { AppDeps } from '../app.js'
import { deviceAuth } from '../middleware/auth.js'

export function chatRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))

  r.post('/', async (req, res) => {
    const parsed = ChatRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message })
      return
    }
    if (parsed.data.source !== 'text') {
      res.status(400).json({ error: 'only source=text is supported in Phase 1a' })
      return
    }
    const device = req.device!
    const session = deps.store.getActiveSession(device.id)
    if (!session) {
      res.status(409).json({ error: 'no active session' })
      return
    }

    const userMessage: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'user_text',
      text: parsed.data.text,
      source: 'text',
      created_at: new Date().toISOString(),
    }
    deps.store.appendMessage(userMessage)

    const tail = deps.store.listMessages({ session_id: session.id, limit: 50 })
    const payload = buildChatRequest({
      personaPrompt: deps.chatPersonaPrompt,
      messagesTail: tail.slice(0, -1),
      userMessage,
    })

    let assistantText: string
    try {
      assistantText = await deps.chatAI.complete(payload)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'chat failure'
      res.status(502).json({ error: msg })
      return
    }

    const assistant: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'assistant',
      text: assistantText,
      created_at: new Date().toISOString(),
    }
    deps.store.appendMessage(assistant)
    res.status(201).json({ message_id: userMessage.id, assistant_message: assistant })
  })

  return r
}
```

- [x] **Step 25.4: Run, expect pass.**
- [x] **Step 25.5: Commit**

```bash
git add apps/api/src/routes/chat.*
git commit -m "feat(api): add POST /chat with text source (mic/listen rejected for Phase 1a)"
```

---

### Task 26: `POST /save` route

**Files:**

- Create: `apps/api/src/routes/save.ts` + `.test.ts`

- [x] **Step 26.1: Write failing test**

````ts
// apps/api/src/routes/save.test.ts
import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { Store } from '../infra/store.js'
import { VisionAI } from '../infra/vision-ai.js'
import { ChatAI } from '../infra/chat-ai.js'
import { ObsidianWriter } from '../infra/obsidian-writer.js'
import type { Message } from '@got-it/shared'

const captureMsg: Omit<
  Extract<Message, { kind: 'screen_capture' }>,
  'id' | 'session_id' | 'created_at'
> = {
  kind: 'screen_capture',
  image_ref: 'r.png',
  source: 'keybind',
  analysis: {
    raw_text: '',
    urls: [{ href: 'https://example.com' }],
    regions: [],
    context_kind: 'browser_article',
    summary: 'A page about A',
  },
}

function setupWithCapture(chatResponses: string[] = []) {
  const store = Store.createNull()
  const { token } = store.registerDevice({ install_id: 'i' })
  const device = store.findDeviceByToken(token)!
  const session = store.createSession({
    device_id: device.id,
    now: new Date('2026-04-28T15:42:00Z'),
  })
  store.setActiveSession({ device_id: device.id, session_id: session.id })
  store.appendMessage({
    ...captureMsg,
    id: 'cap1',
    session_id: session.id,
    created_at: '2026-04-28T15:42:00Z',
  })
  store.appendMessage({
    id: 'a1',
    session_id: session.id,
    kind: 'assistant',
    text: 'Notes about the page.',
    created_at: '2026-04-28T15:42:01Z',
  })
  const obsidian = ObsidianWriter.createNull()
  const app = createApp({
    store,
    visionAI: VisionAI.createNull(),
    chatAI: ChatAI.createNull({ responses: chatResponses }),
    obsidianWriter: obsidian,
    visionPrompt: 'p',
    chatPersonaPrompt: 'p',
    vaultPath: '/tmp/vault',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
  return { app, token, obsidian, session }
}

describe('POST /save', () => {
  it('writes default-template entry to vault', async () => {
    const { app, token, obsidian } = setupWithCapture()
    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(201)
    expect(obsidian.writes).toHaveLength(1)
    const w = obsidian.writes[0]!
    expect(w.vaultPath).toBe('/tmp/vault')
    expect(w.relativePath.startsWith('GotIt!/')).toBe(true)
    expect(w.relativePath.endsWith('.md')).toBe(true)
    expect(w.contents).toContain('# A page about A')
    expect(w.contents).toContain('## Notes')
    expect(w.contents).toContain('Notes about the page.')
  })

  it('uses override template when instruction supplied', async () => {
    const { app, token, obsidian } = setupWithCapture(['```\ncode body from AI\n```'])
    const res = await request(app)
      .post('/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ instruction: 'save as a code snippet' })
    expect(res.status).toBe(201)
    const w = obsidian.writes[0]!
    expect(w.contents).toContain('code body from AI')
    expect(w.contents).not.toContain('## Notes')
  })

  it('returns 422 when active session has no capture yet', async () => {
    const store = Store.createNull()
    const { token } = store.registerDevice({ install_id: 'i' })
    const device = store.findDeviceByToken(token)!
    const session = store.createSession({ device_id: device.id, now: new Date() })
    store.setActiveSession({ device_id: device.id, session_id: session.id })
    const app = createApp({
      store,
      visionAI: VisionAI.createNull(),
      chatAI: ChatAI.createNull(),
      obsidianWriter: ObsidianWriter.createNull(),
      visionPrompt: 'p',
      chatPersonaPrompt: 'p',
      vaultPath: '/tmp/vault',
      captureFolder: 'GotIt!',
      dataDir: '/tmp/data',
      version: 'test',
    })
    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(422)
  })

  it('returns 422 on writer failure', async () => {
    const store = Store.createNull()
    const { token } = store.registerDevice({ install_id: 'i' })
    const device = store.findDeviceByToken(token)!
    const session = store.createSession({ device_id: device.id, now: new Date() })
    store.setActiveSession({ device_id: device.id, session_id: session.id })
    store.appendMessage({
      ...captureMsg,
      id: 'cap1',
      session_id: session.id,
      created_at: '2026-04-28T15:42:00Z',
    })
    const app = createApp({
      store,
      visionAI: VisionAI.createNull(),
      chatAI: ChatAI.createNull(),
      obsidianWriter: ObsidianWriter.createNull({ writeFailure: new Error('ENOENT vault') }),
      visionPrompt: 'p',
      chatPersonaPrompt: 'p',
      vaultPath: '/nope',
      captureFolder: 'GotIt!',
      dataDir: '/tmp/data',
      version: 'test',
    })
    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/ENOENT|vault/)
  })
})
````

- [x] **Step 26.2: Run, expect fail.**

- [x] **Step 26.3: Implement**

```ts
// apps/api/src/routes/save.ts
import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { SaveRequestSchema } from '@got-it/shared'
import {
  formatObsidianEntry,
  nextAvailableFilename,
  resolveSaveFormat,
  slugifySummary,
} from '@got-it/core'
import type { Message } from '@got-it/shared'
import type { AppDeps } from '../app.js'
import { deviceAuth } from '../middleware/auth.js'

export function saveRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))

  r.post('/', async (req, res) => {
    const parsed = SaveRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message })
      return
    }
    const device = req.device!
    const session = deps.store.getActiveSession(device.id)
    if (!session) {
      res.status(409).json({ error: 'no active session' })
      return
    }

    const tail = deps.store.listMessages({ session_id: session.id, limit: 50 })
    const lastCapture = [...tail].reverse().find((m) => m.kind === 'screen_capture')
    if (!lastCapture || lastCapture.kind !== 'screen_capture') {
      res.status(422).json({ error: 'active session has no screen capture to save' })
      return
    }
    const lastAssistant = [...tail].reverse().find((m) => m.kind === 'assistant')

    const plan = resolveSaveFormat(parsed.data.instruction)
    let body: string
    if (plan.template === 'default') {
      body = lastAssistant && lastAssistant.kind === 'assistant' ? lastAssistant.text : ''
    } else {
      const overridePayload = {
        system: deps.chatPersonaPrompt,
        messages: [
          {
            role: 'user' as const,
            content: `Render the following content per this instruction. Return ONLY the body markdown.\n\nInstruction: ${plan.instruction}\n\nSummary: ${lastCapture.analysis.summary}\n\nNotes: ${lastAssistant && lastAssistant.kind === 'assistant' ? lastAssistant.text : '(none)'}`,
          },
        ],
      }
      try {
        body = await deps.chatAI.complete(overridePayload)
      } catch (e) {
        res.status(502).json({ error: e instanceof Error ? e.message : 'chat failure' })
        return
      }
    }

    const title = lastCapture.analysis.summary.split('\n')[0] ?? 'Untitled'
    const savedAt = new Date()
    const slug = slugifySummary(title)
    const stamp = savedAt.toISOString().replace(/[:T]/g, '-').slice(0, 16)
    const candidate = `${stamp}-${slug}.md`
    const taken = await deps.obsidianWriter.listFolder({
      vaultPath: deps.vaultPath,
      relativeFolder: deps.captureFolder,
    })
    const filename = nextAvailableFilename(candidate, taken)
    const relativePath = `${deps.captureFolder}/${filename}`

    const contents = formatObsidianEntry({
      template: plan.template,
      analysis: lastCapture.analysis,
      body,
      sessionId: session.id,
      savedAt,
      title,
    })

    let written
    try {
      written = await deps.obsidianWriter.write({
        vaultPath: deps.vaultPath,
        relativePath,
        contents,
      })
    } catch (e) {
      res.status(422).json({ error: e instanceof Error ? e.message : 'write failure' })
      return
    }

    const record: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'save_record',
      vault_path: written.fullPath,
      ...(plan.instruction ? { instruction: plan.instruction } : {}),
      created_at: new Date().toISOString(),
    }
    deps.store.appendMessage(record)
    res.status(201).json({ vault_path: written.fullPath, save_record_id: record.id })
  })

  return r
}
```

- [x] **Step 26.4: Run, expect pass.**
- [x] **Step 26.5: Commit**

```bash
git add apps/api/src/routes/save.*
git commit -m "feat(api): add POST /save (default + override templates, atomic vault write)"
```

---

### Task 27: `server.ts` entry point

**Files:**

- Modify: `apps/api/src/server.ts`

- [ ] **Step 27.1: Replace stub**

```ts
// apps/api/src/server.ts
import 'dotenv/config'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { Store } from './infra/store.js'
import { VisionAI } from './infra/vision-ai.js'
import { ChatAI } from './infra/chat-ai.js'
import { ObsidianWriter } from './infra/obsidian-writer.js'
import { DEFAULT_VISION_PROMPT } from './prompts/default-vision.js'
import { DEFAULT_CHAT_PROMPT } from './prompts/default-chat.js'

const cfg = loadConfig(process.env)
const pkg = JSON.parse(readFileSync(resolve('apps/api/package.json'), 'utf8')) as {
  version: string
}

const store = Store.create({
  dbPath: cfg.dbPath,
  migrationsDir: resolve('apps/api/migrations'),
})

const app = createApp({
  store,
  visionAI: VisionAI.create({ apiKey: cfg.anthropicApiKey, model: cfg.visionModel }),
  chatAI: ChatAI.create({ apiKey: cfg.anthropicApiKey, model: cfg.chatModel }),
  obsidianWriter: ObsidianWriter.create(),
  visionPrompt: DEFAULT_VISION_PROMPT,
  chatPersonaPrompt: DEFAULT_CHAT_PROMPT,
  vaultPath: cfg.vaultPath,
  captureFolder: 'GotIt!',
  dataDir: cfg.dataDir,
  version: pkg.version,
})

app.listen(cfg.port, () => {
  console.warn(`got-it api listening on ${cfg.port}`)
})
```

(Note: `GOTIT_VAULT_PATH` is read at server boot only via `cfg.vaultPath` — `process.env` is touched only inside `config.ts` per spec §13.2. The var is documented in spec §13.2 and §17 as a Phase 1a dev-only convenience; Phase 1b+ moves vault path to per-device settings.)

- [ ] **Step 27.2a: Confirm `.env.template` already contains `GOTIT_VAULT_PATH`**

The repo's `.env.template` was amended alongside spec §13.2 / §17 to declare this var, so no edit is needed here. If the var is missing for any reason, restore it:

```env
# ─── Dev-only Obsidian vault path (Phase 1a convenience) ─────
# Absolute path to the Obsidian vault used by `POST /save`.
# Phase 1b+ moves this to per-device settings via the client;
# this var becomes deprecated then. Empty string disables save.
GOTIT_VAULT_PATH=
```

- [ ] **Step 27.2b: Extend `apps/api/src/config.ts` schema, type, and return**

Add the line marked `+` in `ConfigSchema`:

```ts
const ConfigSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  GOTIT_VISION_MODEL: z.string().default('claude-opus-4-7'),
  GOTIT_CHAT_MODEL: z.string().default('claude-opus-4-7'),
  GOTIT_DB_PATH: z.string().default('./data/gotit.db'),
  GOTIT_DATA_DIR: z.string().default('./data'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  GOTIT_VAULT_PATH: z.string().default(''), // +
})
```

Add the field to the `Config` type:

```ts
export type Config = {
  anthropicApiKey: string
  visionModel: string
  chatModel: string
  dbPath: string
  dataDir: string
  port: number
  logLevel: 'error' | 'warn' | 'info' | 'debug'
  vaultPath: string
}
```

Add the field to the `loadConfig` return object:

```ts
export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config {
  const parsed = ConfigSchema.parse(env)
  return {
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    visionModel: parsed.GOTIT_VISION_MODEL,
    chatModel: parsed.GOTIT_CHAT_MODEL,
    dbPath: parsed.GOTIT_DB_PATH,
    dataDir: parsed.GOTIT_DATA_DIR,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    vaultPath: parsed.GOTIT_VAULT_PATH,
  }
}
```

- [ ] **Step 27.2c: Extend `apps/api/src/config.test.ts`**

Append two cases to the existing `describe('loadConfig', ...)` block:

```ts
it('defaults vaultPath to empty string when GOTIT_VAULT_PATH is unset', () => {
  const cfg = loadConfig({ ANTHROPIC_API_KEY: 'sk-test' })
  expect(cfg.vaultPath).toBe('')
})

it('parses a populated GOTIT_VAULT_PATH', () => {
  const cfg = loadConfig({
    ANTHROPIC_API_KEY: 'sk-test',
    GOTIT_VAULT_PATH: '/Users/me/Vault',
  })
  expect(cfg.vaultPath).toBe('/Users/me/Vault')
})
```

- [ ] **Step 27.2d: Thread `cfg.vaultPath` through `server.ts`**

In the `server.ts` block above, replace the `vaultPath:` field of the `createApp({ ... })` call:

```ts
  vaultPath: cfg.vaultPath,
```

This removes the lone `process.env.GOTIT_VAULT_PATH ?? ''` read from `server.ts` so `process.env` access stays confined to `config.ts` per spec §13.2.

- [ ] **Step 27.2e: Run config tests, expect pass**

```bash
pnpm --filter @got-it/api test config
```

- [ ] **Step 27.3: Run typecheck and full test**

```bash
pnpm --filter @got-it/api typecheck
pnpm --filter @got-it/api test
```

- [ ] **Step 27.4: Smoke run** (optional, requires real `.env`)

```bash
cp .env.template .env
# fill in ANTHROPIC_API_KEY and GOTIT_VAULT_PATH locally
pnpm dev
# in another terminal:
curl http://localhost:3000/health
```

Expected: `{"ok":true,"version":"0.0.1"}`

- [ ] **Step 27.5: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/config.ts apps/api/src/config.test.ts .env.template
git commit -m "feat(api): wire server entry point with dotenv, Config, and real infra wrappers"
```

---

### Task 28: Full validation pass

**Files:** none — verification only

- [ ] **Step 28.1: Run typecheck across all packages**

```bash
pnpm typecheck
```

Expected: passes for `@got-it/shared`, `@got-it/core`, `@got-it/api`.

- [ ] **Step 28.2: Run lint**

```bash
pnpm lint
```

Expected: zero warnings.

- [ ] **Step 28.3: Run tests**

```bash
pnpm test
```

Expected: all tests green across all packages.

- [ ] **Step 28.4: Run purity check**

```bash
pnpm purity-check
```

Expected: `purity check passed`.

- [ ] **Step 28.5: Run combined validate**

```bash
pnpm validate
```

Expected: full pipeline green.

- [ ] **Step 28.6: Verify pre-push hook trips on a deliberate failure** (sanity)

```bash
echo 'console.log("oops")' >> packages/core/src/extract-urls.ts
git add packages/core/src/extract-urls.ts
git commit -m "chore: deliberately fail purity"
git push origin HEAD --dry-run 2>&1 | head -20
```

Expected: pre-push hook fails on purity check. Revert the change:

```bash
git reset --hard HEAD~1
```

- [ ] **Step 28.7: No commit** — this task is verification-only.

---

## Self-Review

**Spec coverage** (against §16.1 Phase 1a sprint contract):

| Sprint criterion                                                                  | Implementing task                                               |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Keybind triggers screen capture, panel <3s                                        | Task 24 (`POST /capture`) — client portion in Plan B            |
| Screenshot drag-in updates active session                                         | Task 24 (server side) — client UI in Plan B                     |
| Direct invoke opens panel without capturing                                       | (client only) — Plan B                                          |
| Text chat round-trips through backend                                             | Task 25                                                         |
| "Look again" appends to active session                                            | Task 24 (same `POST /capture` route)                            |
| Reset starts new session, old persists                                            | Task 23 (`POST /sessions`)                                      |
| Save writes Markdown to vault folder with default template                        | Tasks 12, 20, 26                                                |
| Save instruction overrides body format                                            | Tasks 13, 26                                                    |
| Offline mode                                                                      | (client only) — Plan B; server provides `GET /health` (Task 22) |
| Device fallback                                                                   | (client only) — Plan B                                          |
| Configuration: `.nvmrc`, `.env.template`, `config.ts`, no scattered `process.env` | Tasks 1, 16, 27                                                 |
| `packages/core` tests pass with zero doubles                                      | Tasks 8-14                                                      |
| `apps/api` tests pass with `createNull()`; no `jest.mock`                         | Tasks 17-26                                                     |
| Husky pre-push gates pass                                                         | Tasks 3, 4, 28                                                  |

Server-side coverage of Phase 1a is complete. Client-side criteria are explicitly deferred to Plan B and not gaps in this plan.

**Placeholder scan:** none. All steps include concrete code.

**Type consistency check:**

- `Message` kind enum (`user_text | screen_capture | assistant | save_record | system`) consistent across Tasks 5, 9, 14, 17, 24, 25, 26.
- `ChatTurn` defined in core (Task 14) and re-defined in `chat-ai.ts` (Task 19). These are structurally identical — kept separate to avoid the shell importing from core just for a type. Acceptable per FC/IS.
- `RenderTemplate` defined in core (Task 12), used by `resolveSaveFormat` (Task 13), consumed in route (Task 26). Consistent.
- `Session.title` is `string | null` everywhere.
- `AppDeps` shape stable across `app.ts`, all routers, `server.ts`.

**Spec gap fixes applied:**

- Phase 1a explicitly rejects `mic` and `listen` sources on `POST /chat` (Task 25) — these belong to Phase 1b/1c. The route returns 400 instead of silently accepting.
- `GOTIT_VAULT_PATH` added to `.env.template`, spec §13.2, spec §17, and `Config` as a dev-only Phase 1a convenience (Task 27 step 27.2b–d). Spec §9.1 says vault is client-side long-term; the var is explicitly marked deprecated-in-1b+ in §13.2 and §17, and `process.env` access remains confined to `config.ts`.

---

## Plan Complete

Plan saved to `docs/plans/f001-phase-1a-backend.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration. Use `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batched with checkpoints.

Which approach?
