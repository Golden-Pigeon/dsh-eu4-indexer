import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  chmod,
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify, isDeepStrictEqual } from 'node:util'
import { createRequire } from 'node:module'
import { manage } from './process.js'
import type { ManageOptions } from './process.js'
import type {
  EngineManifest,
  EngineReceipt,
  EnginePackage,
  PlatformReceipt,
  EngineResponses,
  ManagementRequest,
  EngineStatus,
  TaskEvent,
} from '../contracts.js'
import { readJson, writeJson, UserError, cleanEnv, failure } from '../util.js'
const exec = promisify(execFile)
export const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
import { rid } from './platforms.js'
export { rid } from './platforms.js'
const require = createRequire(import.meta.url)
export interface EngineOptions {
  home: string
  executablePath?: string
  manifest?: EngineManifest
  fetchImpl?: typeof fetch
  timeoutMs?: number
}
export interface InstallOptions {
  signal?: AbortSignal
  onEvent?: (event: TaskEvent) => void
  beforeActivate?: () => void | Promise<void>
  afterActivate?: () => void | Promise<void>
  withActivation?: <T>(work: () => Promise<T>) => Promise<T>
}
export class Engine {
  declare home: string
  declare executablePath: string
  declare manifest?: EngineManifest
  declare fetch: typeof fetch
  declare timeoutMs: number
  declare installing?: boolean
  constructor({
    home,
    executablePath = '',
    manifest,
    fetchImpl = fetch,
    timeoutMs = 30000,
  }: EngineOptions) {
    this.home = home
    this.explicit = executablePath
    this.manifest = manifest
    this.fetch = fetchImpl
    this.timeoutMs = timeoutMs
  }
  get explicit() {
    return this.executablePath
  }
  set explicit(value: string) {
    this.executablePath = value ? path.resolve(value) : ''
  }
  async resolve() {
    const suffix = process.platform === 'win32' ? '.exe' : ''
    const managed = path.join(
      this.home,
      'engine',
      'current',
      'bin',
      `eu4indexer${suffix}`,
    )
    const candidates = this.explicit
      ? [this.explicit]
      : [
          managed,
          path.join(
            packageRoot,
            'artifacts',
            'engine',
            rid(),
            'bin',
            `eu4indexer${suffix}`,
          ),
          path.join(
            packageRoot,
            'resources',
            'engine',
            rid(),
            'bin',
            `eu4indexer${suffix}`,
          ),
        ]
    for (const file of candidates) {
      try {
        await access(file)
      } catch (error) {
        if (failure(error).code !== 'ENOENT') throw error
        continue
      }
      if (!this.explicit && file === managed) {
        const manifest =
          this.manifest ??
          (await readJson<EngineManifest>(
            path.join(packageRoot, 'engine.lock.json'),
          ))
        let receipt: EngineReceipt | undefined
        try {
          receipt = await readJson<EngineReceipt>(
            path.join(this.home, 'engine/current/receipt.json'),
          )
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error
        }
        if (
          receipt?.apiVersion !== manifest!.apiVersion ||
          receipt?.sourceCommit !== manifest!.sourceCommit ||
          !isDeepStrictEqual(receipt?.build, manifest!.build) ||
          receipt?.rid !== rid() ||
          !isDeepStrictEqual(receipt?.package, manifest!.packages?.[rid()])
        )
          throw new UserError(
            'The managed engine does not match this plugin version. Install / update it in the EU4 Indexer panel.',
            'engine_update_required',
          )
      }
      return file
    }
    throw new UserError(
      'Engine is not installed. Install it in the EU4 Indexer panel or configure executablePath.',
      'engine_missing',
    )
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
    return manage(await this.resolve(), this.home, request, options)
  }
  async status({
    signal,
  }: { signal?: AbortSignal } = {}): Promise<EngineStatus> {
    try {
      const executable = await this.resolve(),
        capabilities = await manage<EngineResponses['capabilities']>(
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
  async install({
    signal,
    onEvent = () => {},
    beforeActivate,
    afterActivate,
    withActivation = (work) => work(),
  }: InstallOptions = {}) {
    if (this.explicit)
      throw new UserError(
        'The configured external engine is managed by its owner; clear executablePath to install a managed engine',
      )
    if (this.installing)
      throw new UserError('An engine installation is already running', 'busy')
    this.installing = true
    let temp
    try {
      let manifest =
        this.manifest ??
        (await readJson<EngineManifest>(
          path.join(packageRoot, 'engine.lock.json'),
        ))
      if (!manifest) throw new UserError('Engine lock is missing')
      let dependencyRoot: string | undefined,
        distribution: EnginePackage | undefined
      if (manifest.packages) {
        const dependency = manifest.packages[rid()]
        if (!dependency)
          throw new UserError(
            'No engine package supports this platform',
            'engine_asset_missing',
          )
        distribution = dependency
        let installed
        try {
          dependencyRoot = path.dirname(
            require.resolve(`${dependency.name}/package.json`),
          )
          installed = await readJson<{ version: string }>(
            path.join(dependencyRoot, 'package.json'),
          )
        } catch (error) {
          if (!['MODULE_NOT_FOUND', 'ENOENT'].includes(failure(error).code))
            throw error
          throw new UserError(
            `Missing ${dependency.name}@${dependency.version}. Enable optional dependencies and reinstall the plugin, or configure an external engine.`,
            'engine_package_missing',
          )
        }
        const receipt = await readJson<PlatformReceipt>(
          path.join(dependencyRoot, 'engine.json'),
        )
        if (
          installed?.version !== dependency.version ||
          receipt?.sourceCommit !== manifest.sourceCommit ||
          receipt?.apiVersion !== manifest.apiVersion ||
          !isDeepStrictEqual(receipt?.build, manifest.build) ||
          receipt?.rid !== rid()
        )
          throw new UserError(
            'Engine package does not match the plugin lock',
            'engine_package_mismatch',
          )
        manifest = { ...receipt!, assets: { [rid()]: receipt!.asset } }
      }
      const asset = manifest.assets?.[rid()]
      if (!asset || !/^[a-f0-9]{64}$/i.test(asset.sha256 || ''))
        throw new UserError(
          'No verified engine asset is available for this platform. Build the bundled engine locally or use a packaged release.',
          'engine_asset_missing',
        )
      await mkdir(path.join(this.home, 'engine'), { recursive: true })
      temp = await mkdtemp(path.join(this.home, 'engine', '.install-'))
      let local
      if (asset.file && path.basename(asset.file) === asset.file) {
        for (const directory of dependencyRoot
          ? [dependencyRoot]
          : ['resources/archives', 'artifacts'].map((dir) =>
              path.join(packageRoot, dir),
            )) {
          try {
            local = await readFile(path.join(directory, asset.file))
            break
          } catch (error) {
            if (failure(error).code !== 'ENOENT') throw error
          }
        }
      }
      if (dependencyRoot && !local)
        throw new UserError(
          'Engine package archive is missing; reinstall the platform package',
          'engine_package_missing',
        )
      const response = local
        ? new Response(new Uint8Array(local))
        : await this.fetch(asset.url!, {
            signal: AbortSignal.any([
              ...(signal ? [signal] : []),
              AbortSignal.timeout(this.timeoutMs),
            ]),
          })
      if (!response.ok)
        throw new UserError(`Engine download failed: HTTP ${response.status}`)
      const chunks: Uint8Array[] = []
      let bytes = 0
      if (!response.body)
        throw new UserError('Engine archive response has no body')
      for await (const chunk of response.body) {
        bytes += chunk.length
        if (bytes > 256 * 1024 * 1024)
          throw new UserError('Engine archive exceeds 256 MiB')
        chunks.push(chunk)
        onEvent({
          type: 'download',
          bytes,
          total: Number(response.headers.get('content-length')) || null,
        })
      }
      const archive = Buffer.concat(chunks)
      if (
        createHash('sha256').update(archive).digest('hex') !==
        asset.sha256.toLowerCase()
      )
        throw new UserError(
          'Engine archive checksum mismatch',
          'checksum_mismatch',
        )
      const archivePath = path.join(
        temp,
        process.platform === 'win32' ? 'engine.zip' : 'engine.tar.gz',
      )
      const { writeFile } = await import('node:fs/promises')
      await writeFile(archivePath, archive)
      const extracted = path.join(temp, 'extracted')
      await mkdir(extracted)
      // Verify every member before extraction, including link targets.
      if (process.platform === 'win32') {
        const script =
          'Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead($env:EU4_ARCHIVE); try { foreach($e in $z.Entries) { $target=[IO.Path]::GetFullPath([IO.Path]::Combine($env:EU4_EXTRACT,$e.FullName)); $root=$env:EU4_EXTRACT+[IO.Path]::DirectorySeparatorChar; if(!$target.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe archive path" }; if((($e.ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw "Archive links are not allowed" } }; [IO.Compression.ZipFile]::ExtractToDirectory($env:EU4_ARCHIVE,$env:EU4_EXTRACT) } finally {$z.Dispose()}'
        await exec(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-EncodedCommand',
            Buffer.from(script, 'utf16le').toString('base64'),
          ],
          {
            env: cleanEnv({ EU4_ARCHIVE: archivePath, EU4_EXTRACT: extracted }),
            signal,
          },
        )
      } else {
        const { stdout } = await exec('tar', ['-tzf', archivePath], {
          maxBuffer: 4 * 1024 * 1024,
          signal,
        })
        if (
          stdout
            .split('\n')
            .some((p) => p.startsWith('/') || p.split('/').includes('..'))
        )
          throw new UserError('Unsafe archive path')
        const { stdout: verbose } = await exec('tar', ['-tvzf', archivePath], {
          maxBuffer: 4 * 1024 * 1024,
          signal,
        })
        if (verbose.split('\n').some((p) => /^[lh]/.test(p)))
          throw new UserError('Engine archives must not contain links')
        await exec('tar', ['-xzf', archivePath, '-C', extracted], { signal })
      }
      const executable = path.join(
        extracted,
        'bin',
        process.platform === 'win32' ? 'eu4indexer.exe' : 'eu4indexer',
      )
      if (process.platform !== 'win32') await chmod(executable, 0o755)
      const caps = await manage<EngineResponses['capabilities']>(
        executable,
        this.home,
        { operation: 'capabilities' },
        { timeoutMs: this.timeoutMs, signal },
      )
      if (caps.apiVersion !== manifest.apiVersion)
        throw new UserError('Incompatible engine management API')
      const current = path.join(this.home, 'engine', 'current'),
        previous = path.join(this.home, 'engine', 'previous')
      signal?.throwIfAborted()
      await writeJson(path.join(extracted, 'receipt.json'), {
        ...asset,
        apiVersion: manifest.apiVersion,
        sourceCommit: manifest.sourceCommit,
        build: manifest.build,
        rid: rid(),
        package: distribution,
        installedAt: new Date().toISOString(),
      })
      await withActivation(async () => {
        try {
          await beforeActivate?.()
          signal?.throwIfAborted()
          await rm(previous, { recursive: true, force: true })
          let moved = false
          try {
            await rename(current, previous)
            moved = true
          } catch (error) {
            if (failure(error).code !== 'ENOENT') throw error
          }
          try {
            await rename(extracted, current)
          } catch (error) {
            if (moved) await rename(previous, current)
            throw error
          }
        } finally {
          await afterActivate?.()
        }
      })
      return this.status()
    } finally {
      try {
        if (temp) await rm(temp, { recursive: true, force: true })
      } finally {
        this.installing = false
      }
    }
  }
}
