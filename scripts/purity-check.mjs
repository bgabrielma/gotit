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
