import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { EngineManifest, PlatformReceipt } from '../contracts.js'
import { readJson, UserError } from '../util.js'

const digests = new Map<string, { stamp: string; digest: string }>()

/** Hash the complete publish tree, refusing links and ambiguous inventory paths. */
export async function publishFiles(
  directory: string,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  async function visit(relative: string) {
    const file = path.join(directory, ...relative.split('/'))
    const info = await lstat(file)
    if (info.isDirectory()) {
      for (const name of (await readdir(file)).sort())
        await visit(relative ? `${relative}/${name}` : name)
    } else if (info.isFile()) {
      const stamp = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`
      let cached = digests.get(file)
      if (cached?.stamp !== stamp) {
        cached = {
          stamp,
          digest: createHash('sha256')
            .update(await readFile(file))
            .digest('hex'),
        }
        digests.set(file, cached)
      }
      result[relative] = cached.digest
    } else {
      throw new UserError(
        'Engine publish files must be regular files without links',
        'engine_package_mismatch',
      )
    }
  }
  await visit('bin')
  return result
}

export function publishPath(relative: string): boolean {
  return (
    relative.startsWith('bin/') &&
    !relative.includes('\\') &&
    !/[\x00-\x1f\x7f]/.test(relative) &&
    relative
      .split('/')
      .every(
        (part) =>
          part !== '' && part !== '.' && part !== '..' && !part.includes(':'),
      )
  )
}

/** Validate package provenance and every file before its executable is used. */
export async function verifyPublishPackage(
  directory: string,
  manifest: EngineManifest,
  target: string,
): Promise<string> {
  const expected = manifest.packages?.[target]
  const pkg = await readJson<{ name: string; version: string }>(
    path.join(directory, 'package.json'),
  )
  const receipt = await readJson<PlatformReceipt>(
    path.join(directory, 'engine.json'),
  )
  if (!pkg || !receipt)
    throw new UserError(
      'Engine package files are missing; reinstall the plugin with optional dependencies enabled',
      'engine_package_missing',
    )
  const entryPoint = `bin/eu4indexer${target.startsWith('win-') ? '.exe' : ''}`
  if (
    !expected ||
    pkg?.name !== expected.name ||
    pkg.version !== expected.version ||
    receipt?.formatVersion !== 2 ||
    receipt.entryPoint !== entryPoint ||
    receipt.rid !== target ||
    receipt.apiVersion !== manifest.apiVersion ||
    receipt.sourceCommit !== manifest.sourceCommit ||
    !isDeepStrictEqual(receipt.build, manifest.build) ||
    !receipt.files ||
    !Object.hasOwn(receipt.files, entryPoint) ||
    !Object.entries(receipt.files).every(
      ([file, digest]) => publishPath(file) && /^[a-f0-9]{64}$/.test(digest),
    )
  )
    throw new UserError(
      'Engine package does not match the plugin lock; reinstall the plugin with its exact platform dependency',
      'engine_package_mismatch',
    )
  if (!isDeepStrictEqual(await publishFiles(directory), receipt.files))
    throw new UserError(
      'Engine publish files do not match their receipt; reinstall the platform package',
      'checksum_mismatch',
    )
  const executable = path.join(directory, ...entryPoint.split('/'))
  if (
    process.platform !== 'win32' &&
    !target.startsWith('win-') &&
    ((await lstat(executable)).mode & 0o111) === 0
  )
    throw new UserError(
      'Engine executable permission is missing; reinstall the platform package',
      'engine_package_mismatch',
    )
  return executable
}
