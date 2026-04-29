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
