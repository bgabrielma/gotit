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
    const backend = new RealBackend()
    return new ObsidianWriter(backend)
  }

  static createNull(config: NullableObsidianConfig = {}): ObsidianWriter {
    const stub = new StubBackend(config)
    return new ObsidianWriter(stub, stub)
  }

  async write(args: WriteArgs): Promise<WriteResult> {
    const result = await this.backend.write(args)
    if (this.trackingStub) {
      this.writes.push({ ...args })
    }
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
    if (this.config.writeFailure) {
      throw this.config.writeFailure
    }
    const fullPath = join(vaultPath, relativePath)
    return { fullPath }
  }

  async listFolder({ relativeFolder }: ListFolderArgs): Promise<Set<string>> {
    return this.config.existing?.[relativeFolder] ?? new Set()
  }
}
