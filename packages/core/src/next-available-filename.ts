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
