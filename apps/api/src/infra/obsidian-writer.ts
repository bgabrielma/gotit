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

/**
 * Infrastructure wrapper for Obsidian vault file operations.
 * Use {@link ObsidianWriter.create} in production and {@link ObsidianWriter.fromBackend} in tests.
 */
export class ObsidianWriter {
  private constructor(private readonly backend: ObsidianBackend) {}

  /**
   * Creates a writer backed by the local filesystem.
   */
  static create(): ObsidianWriter {
    const backend = new FilesystemObsidianBackend()
    return new ObsidianWriter(backend)
  }

  /**
   * Creates a writer from an injected backend.
   */
  static fromBackend(backend: ObsidianBackend): ObsidianWriter {
    return new ObsidianWriter(backend)
  }

  /**
   * Writes a markdown file to the configured vault path.
   */
  async write(args: WriteArgs): Promise<WriteResult> {
    return this.backend.write(args)
  }

  /**
   * Lists file names under a folder in the configured vault.
   */
  listFolder(args: ListFolderArgs): Promise<Set<string>> {
    return this.backend.listFolder(args)
  }
}

class FilesystemObsidianBackend implements ObsidianBackend {
  /**
   * Writes atomically using a temporary file + rename.
   */
  async write({ vaultPath, relativePath, contents }: WriteArgs): Promise<WriteResult> {
    const fullPath = join(vaultPath, relativePath)
    await mkdir(dirname(fullPath), { recursive: true })
    const tmp = `${fullPath}.${randomBytes(4).toString('hex')}.tmp`
    await writeFile(tmp, contents, 'utf8')
    await rename(tmp, fullPath)
    return { fullPath }
  }

  /**
   * Reads directory contents and returns a set of file names.
   */
  async listFolder({ vaultPath, relativeFolder }: ListFolderArgs): Promise<Set<string>> {
    try {
      const entries = await readdir(join(vaultPath, relativeFolder))
      return new Set(entries)
    } catch {
      return new Set()
    }
  }
}
