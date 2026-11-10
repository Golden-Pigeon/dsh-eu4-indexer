import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { access, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { manage } from './process.js'
import { verifyPublishPackage } from './package.js'
import type { ManageOptions } from './process.js'
import type {
  EngineManifest,
  EngineResponses,
  ManagementRequest,
  EngineStatus,
} from '../contracts.js'
import { readJson, UserError, failure, sessionId } from '../util.js'
import { rid } from './platforms.js'
export { rid } from './platforms.js'
export const packageRoot = fileURLToPath(new URL('../../', import.meta.url))

export interface EngineOptions {
  home: string
  executablePath?: string
  manifest?: EngineManifest
  /** Package anchor for embedded distributions and isolated consumers. */
  packageRoot?: string
  /** Retained for source compatibility; packaged engines never download at runtime. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}
export interface QuerySessionOptions {
  database: string
  sessionId: string
}

/** Typed, DSH-independent access to the engine installed by the package manager. */
export class Engine {
  home: string
  executablePath = ''
  manifest?: EngineManifest
  timeoutMs: number
  private root: string
  constructor({
    home,
    executablePath = '',
    manifest,
    timeoutMs = 30000,
    packageRoot: root = packageRoot,
  }: EngineOptions) {
    this.home = path.resolve(home)
    this.explicit = executablePath
    this.manifest = manifest
    this.timeoutMs = timeoutMs
    this.root = root
  }
  get explicit() {
    return this.executablePath
  }
  set explicit(value: string) {
    this.executablePath = value ? path.resolve(value) : ''
  }
  async resolve(): Promise<string> {
    if (this.explicit) {
      try {
        await access(this.explicit)
        return this.explicit
      } catch (error) {
        if (failure(error).code !== 'ENOENT') throw error
        throw new UserError(
          'The configured external engine does not exist. Correct executablePath, or clear it to use the engine installed with the plugin.',
          'engine_missing',
        )
      }
    }
    const manifest =
      this.manifest ??
      (await readJson<EngineManifest>(path.join(this.root, 'engine.lock.json')))
    if (!manifest)
      throw new UserError('Engine lock is missing', 'engine_package_mismatch')
    const target = rid()
    const dependency = manifest.packages?.[target]
    if (!dependency)
      throw new UserError(
        'No engine package supports this platform',
        'engine_asset_missing',
      )
    let directory: string
    try {
      directory = path.dirname(
        createRequire(path.join(this.root, 'package.json')).resolve(
          `${dependency.name}/package.json`,
        ),
      )
    } catch (error) {
      if (failure(error).code !== 'MODULE_NOT_FOUND') throw error
      // A source checkout may use its separately built platform package. Published
      // consumers cannot fall back to stale copies in the user's data directory.
      try {
        await access(path.join(this.root, 'src/engine/runtime.ts'))
        await access(
          path.join(this.root, 'packages', `engine-${target}`, 'engine.json'),
        )
        directory = path.join(this.root, 'packages', `engine-${target}`)
      } catch {
        throw new UserError(
          `Missing ${dependency.name}@${dependency.version}. Reinstall the plugin with optional dependencies enabled, or configure an external engine. No separate engine installation is required.`,
          'engine_package_missing',
        )
      }
    }
    try {
      return await verifyPublishPackage(directory, manifest, target)
    } catch (error) {
      if (error instanceof UserError) throw error
      throw new UserError(
        `Cannot verify the installed engine package: ${failure(error).error}. Reinstall the plugin and its platform dependency.`,
        'engine_package_mismatch',
      )
    }
  }
  call<K extends keyof EngineResponses>(
    request: ManagementRequest & { operation: K },
    options?: ManageOptions,
  ): Promise<EngineResponses[K]>
  call(request: ManagementRequest, options?: ManageOptions): Promise<unknown>
  async call(
    request: ManagementRequest,
    options: ManageOptions = {},
  ): Promise<unknown> {
    options.signal?.throwIfAborted()
    const executable = await this.resolve()
    await mkdir(this.home, { recursive: true })
    return manage(executable, this.home, request, options)
  }
  async status({
    signal,
  }: { signal?: AbortSignal } = {}): Promise<EngineStatus> {
    try {
      signal?.throwIfAborted()
      const executable = await this.resolve()
      const capabilities = await manage<EngineResponses['capabilities']>(
        executable,
        this.home,
        { operation: 'capabilities' },
        { timeoutMs: this.timeoutMs, signal },
      )
      if (capabilities.apiVersion !== 1)
        throw new UserError('Incompatible engine management API')
      return { ready: true, executable, capabilities }
    } catch (error) {
      if (signal?.aborted) throw error
      return { ready: false, ...failure(error) }
    }
  }
  /** Per-session MCP launch options; the host owns transport and process lifetime. */
  async querySession(options: QuerySessionOptions) {
    const id = sessionId(options.sessionId)
    if (!options.database || typeof options.database !== 'string')
      throw new UserError('Expected a database path')
    const command = await this.resolve()
    await mkdir(this.home, { recursive: true })
    return {
      command,
      args: [
        'serve',
        '--db',
        path.resolve(options.database),
        '--query-session',
        id,
      ],
      env: { EU4INDEXER_HOME: this.home },
      cwd: this.home,
    }
  }
}
