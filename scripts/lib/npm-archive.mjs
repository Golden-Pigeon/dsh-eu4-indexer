import { execFile } from 'node:child_process'
import { promisify, isDeepStrictEqual } from 'node:util'
import path from 'node:path'

const exec = promisify(execFile)
const tar =
  process.platform === 'win32'
    ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    : process.platform === 'darwin'
      ? '/usr/bin/tar'
      : '/bin/tar'

/** Inspect data without extracting files or forwarding credentials to the system archive tool. */
export async function verifyNpmManifest(archive, expected) {
  const env = { LC_ALL: 'C' }
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
  const run = async (args) => {
    try {
      return (
        await exec(tar, args, {
          env,
          encoding: 'utf8',
          maxBuffer: 4 * 1024 * 1024,
          timeout: 30_000,
        })
      ).stdout
    } catch {
      // Never echo attacker-controlled tar headers, stderr or JSON contents.
      throw new Error('Cannot inspect the npm archive safely')
    }
  }
  const entries = (await run(['-tzf', archive])).trimEnd().split('\n')
  if (
    entries.some(
      (p) =>
        !p.startsWith('package/') ||
        p.includes('\\') ||
        /[\x00-\x1f\x7f]/.test(p) ||
        path.posix.normalize(p) !== p,
    ) ||
    entries.filter((p) => p === 'package/package.json').length !== 1
  )
    throw new Error('Ambiguous or unsafe npm archive paths')
  const detail = (await run(['-tvzf', archive, 'package/package.json'])).trim()
  if (!detail.startsWith('-') || detail.split('\n').length !== 1)
    throw new Error('The npm manifest must be a single regular file')
  let manifest
  try {
    manifest = JSON.parse(await run(['-xOf', archive, 'package/package.json']))
  } catch {
    throw new Error('Invalid packed npm manifest')
  }
  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest)
  )
    throw new Error('Invalid packed npm manifest')
  if (Object.hasOwn(manifest, 'publishConfig'))
    throw new Error(
      'Packed publishConfig is forbidden; staging options must come from CI',
    )
  if (manifest.private || !isDeepStrictEqual(manifest, expected))
    throw new Error(
      'Packed npm manifest differs from the trusted source manifest',
    )
}
