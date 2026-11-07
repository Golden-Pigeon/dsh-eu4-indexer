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
import { promisify } from 'node:util'
import { manage } from './process.js'
import { readJson, writeJson, UserError, cleanEnv } from '../util.js'
const exec = promisify(execFile)
export const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
export function rid(platform = process.platform, arch = process.arch) {
  const os = { darwin: 'osx', win32: 'win', linux: 'linux' }[platform]
  if (!os || !['x64', 'arm64'].includes(arch))
    throw new UserError(
      `Unsupported platform: ${platform}/${arch}`,
      'unsupported_platform',
    )
  return `${os}-${arch}`
}
export class Engine {
  constructor({
    home,
    executablePath = '',
    manifest,
    fetchImpl = fetch,
    timeoutMs = 30000,
  }) {
    this.home = home
    this.explicit = executablePath
    this.manifest = manifest
    this.fetch = fetchImpl
    this.timeoutMs = timeoutMs
  }
  async resolve() {
    const suffix = process.platform === 'win32' ? '.exe' : ''
    const candidates = this.explicit
      ? [this.explicit]
      : [
          path.join(
            this.home,
            'engine',
            'current',
            'bin',
            `eu4indexer${suffix}`,
          ),
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
        return file
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    throw new UserError(
      'Engine is not installed. Install it in the EU4 Indexer panel or configure executablePath.',
      'engine_missing',
    )
  }
  async call(request, options = {}) {
    return manage(await this.resolve(), this.home, request, options)
  }
  async status({ signal } = {}) {
    try {
      const executable = await this.resolve(),
        capabilities = await manage(
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
      return { ready: false, error: error.message, code: error.code }
    }
  }
  async install({
    signal,
    onEvent = () => {},
    beforeActivate,
    afterActivate,
  } = {}) {
    if (this.explicit)
      throw new UserError(
        'The configured external engine is managed by its owner; clear executablePath to install a managed engine',
      )
    if (this.installing)
      throw new UserError('An engine installation is already running', 'busy')
    this.installing = true
    let temp
    try {
      const manifest =
        this.manifest ??
        (await readJson(path.join(packageRoot, 'engine.lock.json')))
      const asset = manifest.assets[rid()]
      if (!asset || !/^[a-f0-9]{64}$/i.test(asset.sha256 || ''))
        throw new UserError(
          'No verified engine asset is available for this platform. Build the bundled engine locally or use a packaged release.',
          'engine_asset_missing',
        )
      await mkdir(path.join(this.home, 'engine'), { recursive: true })
      temp = await mkdtemp(path.join(this.home, 'engine', '.install-'))
      let local
      if (asset.file && path.basename(asset.file) === asset.file) {
        for (const directory of ['resources/archives', 'artifacts']) {
          try {
            local = await readFile(
              path.join(packageRoot, directory, asset.file),
            )
            break
          } catch (error) {
            if (error.code !== 'ENOENT') throw error
          }
        }
      }
      const response = local
        ? new Response(local)
        : await this.fetch(asset.url, {
            signal: AbortSignal.any([
              ...(signal ? [signal] : []),
              AbortSignal.timeout(this.timeoutMs),
            ]),
          })
      if (!response.ok)
        throw new UserError(`Engine download failed: HTTP ${response.status}`)
      const chunks = []
      let bytes = 0
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
      const caps = await manage(
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
        sourceCommit: manifest.sourceCommit,
        installedAt: new Date().toISOString(),
      })
      await beforeActivate?.()
      try {
        await rm(previous, { recursive: true, force: true })
        let moved = false
        try {
          await rename(current, previous)
          moved = true
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
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
      return this.status()
    } finally {
      if (temp) await rm(temp, { recursive: true, force: true })
      this.installing = false
    }
  }
}
