# GotIt! — Agent Instructions

> **Universal agent instructions.** This file is the single source of truth for all AI coding agents working on this project. `CLAUDE.md` and `CODEX.md` are symlinks to this file.

## Project Overview

GotIt! is a macOS-first second-brain app with a native client and a smart backend.

Product-level behavior, user flows, session semantics, and capability definitions live in:

- `README.md` — what the product does
- `BOARD.md` — feature scope, roadmap, and dependencies
- `STATUS.md` — validated progress and active state

**Architecture:** Functional Core / Imperative Shell + Clean Architecture. Thin Client (Swift/SwiftUI) + Smart Backend (Express/TypeScript). All AI logic lives server-side. The client handles capture, display, and native APIs only.

**Monorepo structure:**

```
got-it/
├── AGENTS.md                    # This file (universal agent instructions)
├── CLAUDE.md -> AGENTS.md       # Symlink
├── CODEX.md -> AGENTS.md        # Symlink
├── STATUS.md                    # Global project state (harness reads/writes)
├── BOARD.md                     # Feature backlog and sprint planning
├── docs/
│   ├── specs/                   # Feature specs (brainstorming output)
│   ├── plans/                   # Implementation plans (writing-plans output)
│   └── research/                # Platform research docs
├── apps/
│   ├── macos/                   # Swift/SwiftUI native client (imperative shell)
│   └── api/                     # Express/TypeScript backend (imperative shell)
└── packages/
    ├── core/                    # Pure business logic (functional core) — NO side effects
    └── shared/                  # API contracts, types, templates
```

---

## Architecture: Functional Core, Imperative Shell

This project follows the **Functional Core, Imperative Shell** pattern. This is non-negotiable.

### The Pattern

```
┌─────────────────────────────────────────────────┐
│  Imperative Shell (apps/macos, apps/api)        │
│  ─ HTTP handlers, Swift UI, file I/O, network   │
│  ─ Reads from the world, calls core, writes     │
│    results back to the world                     │
│                                                  │
│  ┌───────────────────────────────────────────┐   │
│  │  Functional Core (packages/core)          │   │
│  │  ─ Pure functions: input → output         │   │
│  │  ─ NO side effects                        │   │
│  │  ─ NO I/O (no fetch, no fs, no db)        │   │
│  │  ─ NO mocks needed — test with real       │   │
│  │    inputs and assert real outputs          ���   │
│  │  ─ Deterministic: same input = same output │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Rules

1. **`packages/core/` is pure.** Every function takes data in and returns data out. No `fetch`, no `fs`, no database calls, no environment variables, no `Date.now()`, no randomness. If a function needs the current time, it receives it as a parameter.

2. **Mocks policy by layer.**
   - `packages/core/`: Pure functions tested with real inputs and real expected outputs. Zero mocks and zero test doubles.
   - `apps/api/` (shell): Unit tests and non-smoke integration tests use explicit mocks/fakes created in test code. Do not embed nullable stub backends in production infrastructure wrappers.

3. **The shell is thin.** `apps/api/` and `apps/macos/` are imperative shells. They handle I/O (HTTP, file system, screen capture, AI API calls) and delegate all logic to `packages/core/`. The shell follows the **Logic Sandwich**: read from the world → call core → write result back.

4. **Dependencies flow inward.** Core depends on nothing. Shared defines contracts. Shell depends on core and shared. Never the reverse.

```
apps/api ──→ packages/core ←── apps/macos
    │              │
    └──→ packages/shared ←──┘
```

5. **Design principles:** DRY, KISS, YAGNI, SOLID. In that priority order. Don't abstract until you must. Don't build what you don't need yet. Keep it simple. But when you do build, build it right (single responsibility, open/closed, etc.).

### What lives where

| Package            | Contains                                                                        | Side Effects | Testing Strategy                                                                              |
| ------------------ | ------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `packages/core/`   | Business logic, validation, extraction, formatting, scoring, template rendering | **NONE**     | Pure input/output tests. No doubles of any kind.                                              |
| `packages/shared/` | TypeScript types, API contracts, Zod schemas, constants                         | **NONE**     | Type tests, schema validation tests.                                                          |
| `apps/api/`        | HTTP handlers, AI provider calls, file I/O, Obsidian writes                     | Yes          | Unit + route integration tests use explicit mocks. Smoke tests use real connectors + real fs. |
| `apps/macos/`      | SwiftUI, screen capture, audio, keybinds, stealth                               | Yes          | UI tests. Use test-side mocks/fakes for non-smoke flows.                                      |

### Shell Testing Pattern

Infrastructure wrappers encapsulate external I/O and expose production `create()` plus test-focused backend injection:

```typescript
// apps/api/src/infra/vision-ai.ts — INFRASTRUCTURE WRAPPER
export class VisionAI {
  static create(apiKey: string) {
    return new VisionAI(new RealVisionClient(apiKey))
  }

  static fromBackend(backend: VisionBackend) {
    return new VisionAI(backend)
  }

  async analyze(image: Buffer): Promise<AnalysisResult> {
    return this._client.analyze(image)
  }
}
```

```typescript
// apps/api/src/routes/capture.test.ts — SOCIABLE TEST
const visionAI = VisionAI.fromBackend({
  analyze: async () => ({
    text: 'https://example.com some context',
    urls: ['https://example.com'],
  }),
})
const app = createApp({ visionAI }) // real app, mocked dependency
const res = await request(app).post('/capture').send({ image: testImage })
expect(res.body.urls).toEqual(['https://example.com'])
```

### Core Examples

```typescript
// packages/core/src/extract-urls.ts — PURE
export function extractUrls(ocrText: string): string[] {
  // input → output. No side effects. No mocks needed.
}

// packages/core/src/format-obsidian-entry.ts — PURE
export function formatObsidianEntry(
  content: CapturedContent,
  template: SaveTemplate,
  savedAt: Date // time is passed IN, not read from Date.now()
): string {
  // returns markdown string. No file I/O.
}

// apps/api/src/routes/capture.ts — IMPERATIVE SHELL (Logic Sandwich)
import { extractUrls } from '@got-it/core'

app.post('/capture', async (req, res) => {
  const image = req.body.image // READ: from network
  const analysis = await visionAI.analyze(image) // READ: from external API
  const urls = extractUrls(analysis.text) // PROCESS: pure core logic
  res.json({ urls, analysis }) // WRITE: to network
})
```

---

## Orchestration Rules

This project follows a strict harness-based orchestration pattern. **No agent may skip or shortcut these rules.**

### Change Classes

Agents must classify the requested work before starting. The full feature pipeline is mandatory for product work, but not every repository change is product work.

#### Feature Work

New product capability, user-facing behavior, architecture change, or feature expansion.

Requires the full pipeline:

```
BOARD.md → Brainstorming → Spec → Plan → Sprint Contract → Implementation Loop → Validation → STATUS.md Update
```

Examples: adding screen capture, changing chat session semantics, adding Obsidian routing, implementing stealth rendering, adding a new storage integration.

#### Task Work Inside a Feature

A defined implementation task under an approved spec and plan.

Requires:

1. Dependency check against `BOARD.md`, `STATUS.md`, and the feature spec.
2. Sprint contract for the task.
3. Implementation with tests.
4. Post-implementation validator in a clean session.
5. `STATUS.md` update only after validation passes.

Examples: implementing `extractUrls`, adding the capture API route, wiring a global keybind after F001 is specified.

#### Docs and Spec Edits

Changes to specs, plans, `README.md`, `BOARD.md`, architecture docs, or research notes that do not implement product behavior.

Requires:

1. Self-review for contradictions, ambiguity, and scope drift.
2. User review if the change alters product scope, dependencies, acceptance criteria, or feature sequencing.
3. No implementation validator unless the doc change changes feature dependencies or acceptance criteria.

Examples: clarifying stealth constraints, updating roadmap wording, writing or revising a feature spec.

#### Repo Hygiene

Formatting, dependency metadata, config cleanup, generated docs, typo fixes, or non-behavioral maintenance.

Requires lightweight validation only:

1. Run the relevant formatter, lint, typecheck, or docs build if applicable.
2. Do not require the full brainstorming/spec/validator loop.
3. Do not update `STATUS.md` unless validated feature state changed.

Examples: fixing Markdown formatting, regenerating Mermaid output, updating `.gitignore`, correcting spelling.

#### Hotfixes

Urgent fixes for broken builds, failing tests, or blocked developer workflow.

Allowed flow:

1. Identify the breakage.
2. Apply the minimal fix.
3. Run relevant validation.
4. Backfill spec, plan, or `STATUS.md` updates only if behavior or feature state changed.

Hotfixes must not be used to bypass feature planning. They are for restoring a broken baseline.

### The Workflow (per feature)

```
BOARD.md → Brainstorming → Spec → Plan → Sprint Contract → Implementation Loop → Validation → STATUS.md Update
```

Every feature follows this exact pipeline. No implementation without a spec. No spec without brainstorming. No task starts without prerequisite validation.

### Agent Roles

| Role            | Responsibility                                                                | Reads                           | Writes                                                            |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| **Planner**     | Brainstorm, write specs, break down tasks                                     | BOARD.md, existing specs        | Spec doc, task list                                               |
| **Implementor** | Write code for a single task; **tick plan checkboxes as each step completes** | Spec, contract, STATUS.md, plan | Code, tests, ticked checkboxes in the plan, task completion claim |
| **Validator**   | Test, score, gate progress                                                    | Spec, contract, code, tests     | Validation report, STATUS.md update                               |

### The Validator Agent

The validator is the gatekeeper of this project. It runs **before AND after** every implementation step.

**Isolation requirement:** The validator MUST run in a **clean session** — either a new agent session or after `/clear`. It must have ZERO context from the implementor's session. This prevents the validator from being influenced by the implementor's reasoning, excuses, or partial understanding. The validator reads only artifacts: code, tests, specs, contracts, STATUS.md.

**Pre-implementation validation (before):**

1. Fresh session. Read STATUS.md, BOARD.md, and the feature spec.
2. Check: are all prerequisite features/tasks completed and validated?
3. Check: does the sprint contract exist and is it well-defined?
4. **If any check fails → BLOCK.** Report what's missing. Implementation cannot start.

**Post-implementation validation (after):**

1. Fresh session. Read the spec, sprint contract, and the implemented code/tests.
2. Run the full validation pipeline (see Quality Pipeline below).
3. Score 0-10. Minimum passing score: **7**.
4. **Score >= 7 → PASS.** Write validation result to STATUS.md. Mark task complete.
5. **Score < 7 → FAIL.** Generate detailed feedback report. Do not update STATUS.md. Implementor must fix and re-submit.

**The validator never fixes code.** It only observes, tests, scores, and reports.

### Checkbox Discipline (Implementor)

The plan document (`docs/plans/<feature>-<phase>.md`) is the implementor's running ledger. **Every step is a `- [ ]` checkbox. The implementor MUST flip it to `- [x]` the moment that step is complete.** No exceptions, no batching at the end of a task, no "I'll tick them all when I'm done."

**Why this matters:**

- The validator runs in a clean session and reads only artifacts. Unchecked boxes look like incomplete work even when the code exists. A box that says `- [ ] Step 22.4: Run, expect pass` is a claim that the implementor never ran the test — the validator has no way to know otherwise without re-running everything from scratch.
- Checkboxes are how the implementor proves the work was done in the order the plan specified (write failing test → run → implement → run → commit). A retroactive bulk-tick at the end loses that signal.
- If the implementor crashes, hands off, or runs out of context mid-task, the next session needs to know exactly which step is next. Unchecked boxes anywhere in the middle of a "completed" task block are a contract violation.

**Rules:**

1. **Tick on completion, not before.** Flip `- [ ]` → `- [x]` only after the step's own success criteria are met (test ran, command exited 0, file was created, etc.).

2. **Tick before moving to the next step.** Do not start step N+1 until step N is checked off in the plan file.

3. **Never tick on someone else's behalf.** The validator does not tick boxes — it reads them. The implementor does not tick boxes for steps it didn't perform. If a box was completed in a prior session and it's still unchecked, leave it unchecked and flag it to the human; do not retroactively claim completed work as your own.

4. **A ticked box is a load-bearing claim.** If the validator finds a `- [x]` step whose evidence does not exist (e.g., a "commit" step is checked but `git log` shows no such commit), that is a Spec Conformance failure and contributes to the validator score, regardless of whether the underlying code works.

5. **Unchecked boxes block the validator.** If any plan step is unchecked when the implementor declares the task complete, the validator MUST treat the task as incomplete and refuse to score it. The implementor either ticks the box (with evidence) or admits the step is not done.

**STATUS.md vs. plan checkboxes:**

- Plan checkboxes track _step-level_ progress within a task and are written by the implementor.
- STATUS.md tracks _task-level_ validated state across the project and is written only by the validator after a passing score.
- Both must agree. If the plan says all 28 task blocks are fully checked but STATUS.md says `0/28`, that is a normal pre-validation state. If STATUS.md says a task is validated but the plan has unchecked boxes inside that task, something is wrong — escalate to the human.

### Backpressure

Agents must respect backpressure. The system slows down or stops when quality drops.

**Rules:**

1. **Two consecutive failures on the same task → escalate to human.** Do not let the implementor loop indefinitely. If the implementor fails twice and the validator scores < 7 both times, stop and ask the human for guidance.

2. **Validator score trending down → stop and reassess.** If task N scored lower than task N-1, pause before starting task N+1. Review whether the approach is sound or the spec needs revision.

3. **No parallel implementation of dependent tasks.** Only tasks explicitly marked as parallelizable in the spec can run concurrently (via `superpowers:dispatching-parallel-agents`). Sequential tasks run one at a time with validation between each.

4. **Context budget.** If an implementor subagent's context is growing large (many iterations, many files), restart with a fresh subagent rather than continuing with degraded context. Prefer clean starts over polluted sessions.

### Dependency Blocking

Before starting ANY work on a feature or task:

1. Read `BOARD.md` — check if the feature declares dependencies (e.g., `blocked by F001`)
2. Read `STATUS.md` — check if dependencies are marked as completed with passing validation
3. **If dependencies are incomplete → BLOCK.** Report what's missing. Do not proceed.

Example: Feature F002 (Advanced Obsidian Workflows) depends on F001 (Screen Capture MVP). If F001 has 3/8 tasks completed, F002 is blocked. No agent can override this.

### Task-Level Gating

Within a feature, tasks may have sequential dependencies. Before starting task N:

1. Check if tasks that block N are marked completed in the spec
2. Run the validator agent (clean session) to confirm — **checkboxes alone are not trusted**
3. Only proceed if the validator confirms prerequisites are met

### The Sprint Contract

Before implementation of any task begins, the implementor and validator must agree on a sprint contract defined in the spec:

```markdown
## Sprint Contract — [Feature] [Task]

### Success Criteria

- [ ] Criterion 1 (specific, testable)
- [ ] Criterion 2
- [ ] ...

### Quality Gate

- Minimum score: 7/10
- Scoring breakdown: functionality (30%), code quality (20%), test coverage (20%), spec conformance (20%), lint + types (10%)
```

### The Validation Loop

After each task is implemented:

1. **Implementor declares the task complete only when every plan checkbox under that task is ticked.** Unchecked boxes inside a "completed" task block are an automatic block — see Checkbox Discipline above.
2. **Validator agent** (clean session) tests the implementation against the sprint contract.
3. Validator scores 0-10 based on the quality pipeline. Spec Conformance includes a check that every plan checkbox claimed as `- [x]` has corresponding evidence in the repo (test ran, file exists, commit landed, etc.).
4. **Score >= 7 → PASS.** Validator updates STATUS.md and marks the task complete in the spec. The validator does NOT tick plan checkboxes — those are the implementor's record.
5. **Score < 7 → FAIL.** Generate feedback report. Implementor must fix and re-validate. If the failure was a falsely-ticked checkbox, the implementor must un-tick it before re-submitting.
6. Two consecutive failures → escalate to human.

### STATUS.md Contract

STATUS.md is the global state file. It is the **single source of truth** for project progress. Both the validator and implementor agents must agree on its contents.

- Only the validator agent writes to STATUS.md after successful validation
- The implementor reads STATUS.md to understand current state
- STATUS.md contains: current sprint, task completion status, validation log, blockers

---

## Quality Pipeline

Every task must pass ALL of these checks. The validator runs them in order. Failure at any stage means the task fails.

### 1. TypeScript Strict Type Checking

```bash
pnpm --filter @got-it/core typecheck
pnpm --filter @got-it/api typecheck
pnpm --filter @got-it/shared typecheck
```

All packages use `strict: true` in tsconfig. No `any` types. No `@ts-ignore`. No `as unknown as`. Type errors are build failures.

### 2. Linting

```bash
pnpm --filter @got-it/core lint
pnpm --filter @got-it/api lint
```

ESLint with strict rules. No warnings allowed (warnings are errors in CI).

### 3. Tests (TDD — mocks in shell, none in core)

```bash
pnpm --filter @got-it/core test
pnpm --filter @got-it/api test
```

- `packages/core/`: Pure input/output tests. Zero mocks. Zero test doubles.
- `apps/api/`: Unit and route integration tests use explicit mocks/fakes in test code. Smoke tests use real connectors and real filesystem behavior.

### 4. Spec Conformance (Terminology Lint)

Code must use the **same terminology as the spec.** This is a linting check, not a style preference.

**Rules:**

- If the spec says "CapturedContent", the code type is `CapturedContent`, not `ScreenData` or `CaptureResult`
- If the spec says "extract URLs", the function is `extractUrls`, not `parseLinks` or `getUrls`
- If the spec says "floating panel", comments and variable names say "floating panel", not "popup" or "overlay" or "widget"
- Module names, file names, and export names must trace back to spec terminology

**Why:** When code diverges from spec language, agents lose track of what's implemented. The spec is the shared vocabulary between planner, implementor, and validator. Drift causes bugs.

**How the validator checks this:** The validator reads the spec terminology section, then greps the implementation for matching names. Mismatches are scored as conformance failures.

### 5. Purity Check (Core Package)

The validator verifies that `packages/core/` contains no side effects:

- No imports from `fs`, `path`, `http`, `net`, `child_process`, or any I/O module
- No `fetch`, `XMLHttpRequest`, or network calls
- No `Date.now()`, `Math.random()`, or `process.env` reads
- No `console.log` (use return values, not logging)
- No async functions that perform I/O (async for computation is fine)

Any impure code in `packages/core/` is an automatic failure.

### Scoring Breakdown

| Category         | Weight | What the validator checks                                                  |
| ---------------- | ------ | -------------------------------------------------------------------------- |
| Functionality    | 30%    | Does the code do what the contract says? Do tests prove it?                |
| Code Quality     | 20%    | Clean architecture boundaries, functional core purity, shell thinness      |
| Test Coverage    | 20%    | Core functions have tests. Edge cases covered. No mocks in core.           |
| Spec Conformance | 20%    | Terminology matches. Names trace to spec. Module structure matches design. |
| Lint + Types     | 10%    | Zero lint errors, zero type errors, strict mode, no escape hatches         |

---

## Superpowers Integration

This project uses the [superpowers](https://github.com/anthropics/superpowers) plugin skills. The orchestration maps to superpowers as follows:

| Workflow Step                    | Superpowers Skill                            |
| -------------------------------- | -------------------------------------------- |
| Brainstorming a new feature      | `superpowers:brainstorming`                  |
| Writing the implementation plan  | `superpowers:writing-plans`                  |
| Implementing tasks (recommended) | `superpowers:subagent-driven-development`    |
| Implementing tasks (alternative) | `superpowers:executing-plans`                |
| Parallel independent tasks       | `superpowers:dispatching-parallel-agents`    |
| Test-driven development          | `superpowers:test-driven-development`        |
| Isolated workspace per feature   | `superpowers:using-git-worktrees`            |
| Finishing a feature branch       | `superpowers:finishing-a-development-branch` |
| Code review                      | `superpowers:requesting-code-review`         |
| Debugging                        | `superpowers:systematic-debugging`           |

### How the Harness Extends Superpowers

Superpowers provides task-level validation (spec reviewer + code quality reviewer). This project adds **feature-level and sprint-level gating** on top:

- **Superpowers handles:** Per-task spec compliance review, per-task code quality review
- **Harness adds:** Scoring gate (0-10, min 7), dependency blocking between features, STATUS.md state management, sprint contracts, BOARD.md backlog management, backpressure rules, validator isolation (clean session), purity checks, spec conformance linting

When using `superpowers:subagent-driven-development`, the two-stage review (spec compliance → code quality) runs first. Then the harness validator (in a clean session) scores the result and updates STATUS.md.

---

## Spec Location

Specs are saved to `docs/specs/` (not the superpowers default of `docs/superpowers/specs/`).
Plans are saved to `docs/plans/` (not the superpowers default of `docs/superpowers/plans/`).

This overrides the superpowers default paths.

---

## Tech Stack

### macOS Client (`apps/macos/`)

- **Language:** Swift
- **UI Framework:** SwiftUI
- **Target:** macOS 13 Ventura+
- **Key APIs:** ScreenCaptureKit, AVAudioEngine, NSPanel, NSStatusItem, RegisterEventHotKey
- **Stealth:** `NSWindow.sharingType = .none`

### Backend API (`apps/api/`)

- **Runtime:** Node.js
- **Framework:** Express
- **Language:** TypeScript
- **Package Manager:** pnpm
- **Role:** Imperative shell — handles HTTP, AI provider calls, file I/O. Delegates all logic to `@got-it/core`.

### Core (`packages/core/`)

- **Language:** TypeScript
- **Purpose:** Pure business logic. URL extraction, content formatting, template rendering, validation, scoring.
- **Rules:** No I/O. No side effects. Input → output.

### Shared (`packages/shared/`)

- **Language:** TypeScript
- **Purpose:** API contracts, request/response types, Zod schemas, constants, enums

---

## Code Style

- **Architecture:** Functional Core, Imperative Shell. Clean Architecture. No exceptions.
- **Testing:** TDD enforced via `superpowers:test-driven-development`. No mocks in `packages/core/`. Use test-side mocks in `apps/api` unit and non-smoke integration tests.
- **Comments:** Use JSDoc block comments (`/** ... */`) for exported modules, functions, classes, interfaces, and non-obvious behavior.
- **TypeScript:** `strict: true`. No `any`. No `@ts-ignore`. No `as unknown as`.
- **Readability:** Avoid inline returns when they reduce clarity. Prefer named intermediate variables and explicit return statements.
- **Swift:** Follow Apple's Swift API Design Guidelines.
- **Naming:** Must match spec terminology. See "Spec Conformance" in Quality Pipeline.
- **Purity:** All `packages/core/` functions are pure. See "Purity Check" in Quality Pipeline.

---

## Build & Test Commands

```bash
# Core (pure logic — no mocks)
cd packages/core && pnpm test

# Backend (integration tests)
cd apps/api && pnpm test

# Type checking (all packages)
pnpm typecheck

# Linting (all packages)
pnpm lint

# Full validation pipeline
pnpm validate  # runs: typecheck → lint → test → purity-check

# Docs (Mermaid diagrams)
pnpm docs:build

# macOS client
cd apps/macos && xcodebuild -scheme GotIt -configuration Debug build
```

---

## Git Hooks (Husky) — Backpressure at the Git Level

Quality gates are enforced at commit and push time via [Husky](https://typicode.github.io/husky/) pre-commit and pre-push hooks. This is the backpressure mechanism that prevents broken code from entering the repository.

**No agent and no human bypasses these hooks.** If a hook fails, the code doesn't commit/push. Fix the issue, don't skip the hook.

### Pre-commit (fast — runs on every commit)

```bash
# .husky/pre-commit
pnpm lint-staged
```

`lint-staged` runs on staged files only (fast):

- TypeScript files: `eslint --fix` + `prettier --write`
- Swift files: `swiftlint`
- Markdown files: `prettier --write`

### Pre-push (thorough — runs before push)

```bash
# .husky/pre-push
pnpm typecheck && pnpm lint && pnpm test && pnpm purity-check
```

The full quality pipeline runs before any code reaches the remote:

1. **Type checking** — all packages, strict mode
2. **Linting** — zero warnings (warnings are errors)
3. **Tests** — all packages, TDD, no mocks in core, explicit mocks/fakes in shell unit and non-smoke integration tests
4. **Purity check** — verify `packages/core/` has no side effects

If any step fails, the push is blocked. This is non-negotiable backpressure.

### Setup

```bash
pnpm add -D husky lint-staged
pnpm exec husky init
```

### Why Husky for backpressure

The validator agent catches issues after implementation. But Husky catches issues **before code enters the repo.** Together they form two layers:

1. **Husky (pre-commit/pre-push):** Automated, fast, catches lint/type/test/purity failures at commit time. No context needed. Binary pass/fail.
2. **Validator agent (post-implementation):** Deep, contextual, checks spec conformance, scores quality, updates STATUS.md. Requires a clean session.

Both must pass. Husky is the first line of defense. The validator is the second.

---

## Git Conventions

- Feature branches: `feature/<feature-id>-<short-name>` (e.g., `feature/f001-screen-capture`)
- Use git worktrees for isolated feature development (`superpowers:using-git-worktrees`)
- Commit messages: conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`)
- One feature per branch. Do not mix features.
