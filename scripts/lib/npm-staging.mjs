import { readFile, lstat } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export const npmRegistry = 'https://registry.npmjs.org/'
export const stagingNpmVersion = '11.21.2'
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/
const digest = (bytes) => createHash('sha512').update(bytes).digest('base64')
const registryFlags = [
  `--registry=${npmRegistry}`,
  '--fetch-retries=0',
  '--fetch-timeout=60000',
]
function npmJson(output) {
  try {
    return JSON.parse(output)
  } catch {
    // JSON parser diagnostics can echo arbitrary subprocess output.
    throw new Error(
      'Invalid npm JSON response; inspect staged packages before retrying',
    )
  }
}

/** Read public metadata without forwarding the CI credential or following redirects. */
export async function publicPackage(name) {
  const response = await fetch(`${npmRegistry}${encodeURIComponent(name)}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  })
  if (response.status === 404)
    throw new Error(
      `Initial publication must be performed by the owner: ${name}`,
    )
  if (!response.ok)
    throw new Error(`Cannot check ${name}: registry HTTP ${response.status}`)
  return response.json()
}

/** Preflight the entire set before the first write. Never publish, approve or reject. */
export async function stageUpdates({
  packages,
  tag,
  runNpm,
  getPackage = publicPackage,
  onStaged = async () => {},
}) {
  if (!['latest', 'next', 'beta'].includes(tag))
    throw new Error('Choose an explicit npm tag: latest, next or beta')
  if (
    !packages.length ||
    new Set(packages.map((p) => p.name)).size !== packages.length
  )
    throw new Error('Empty or duplicate package set')
  for (const item of packages) {
    if (
      !/^@goldenpigeon\/dsh-eu4-indexer(?:-engine-[a-z0-9-]+)?$/.test(
        item.name,
      ) ||
      !version.test(item.version)
    )
      throw new Error('Unexpected release package or version')
    if (tag === 'latest' && item.version.includes('-'))
      throw new Error('Prerelease versions require next or beta')
    if (!(await lstat(item.archive)).isFile())
      throw new Error(`Release archive must be a regular file: ${item.name}`)
    const actualIntegrity = `sha512-${digest(await readFile(item.archive))}`
    if (item.integrity && item.integrity !== actualIntegrity)
      throw new Error(
        `Release archive differs from the verified receipt: ${item.name}`,
      )
    item.integrity = actualIntegrity
  }
  if ((await runNpm(['--version'])).trim() !== stagingNpmVersion)
    throw new Error(`Staging requires the pinned npm ${stagingNpmVersion}`)
  for (const item of packages) {
    const metadata = await getPackage(item.name)
    if (
      metadata.name !== item.name ||
      !metadata.versions ||
      !Object.keys(metadata.versions).some(
        (v) => version.test(v) && v !== '0.0.0-stage',
      )
    )
      throw new Error(
        `Initial publication must be performed by the owner: ${item.name}`,
      )
    if (Object.hasOwn(metadata.versions, item.version))
      throw new Error(`Version is already public: ${item.name}@${item.version}`)
    const pending = npmJson(
      await runNpm(['stage', 'list', item.name, '--json', ...registryFlags]),
    )
    if (!Array.isArray(pending))
      throw new Error('Invalid npm stage list response')
    if (
      pending.some(
        (p) => p.packageName === item.name && p.version === item.version,
      )
    )
      throw new Error(
        `Version is already staged; review it on npm before retrying: ${item.name}@${item.version}`,
      )
  }
  const staged = []
  for (const item of packages) {
    // Detect local archive changes after preflight, including a replaced symlink.
    if (
      !(await lstat(item.archive)).isFile() ||
      `sha512-${digest(await readFile(item.archive))}` !== item.integrity
    )
      throw new Error(`Release archive changed after preflight: ${item.name}`)
    const result = npmJson(
      await runNpm([
        'stage',
        'publish',
        item.archive,
        '--json',
        `--tag=${tag}`,
        '--access=public',
        '--ignore-scripts',
        '--provenance=false',
        ...registryFlags,
      ]),
    )
    const receipt = result[item.name]
    if (
      !receipt ||
      !uuid.test(receipt.stageId) ||
      receipt.name !== item.name ||
      receipt.version !== item.version ||
      receipt.integrity !== item.integrity
    )
      throw new Error(
        `Invalid stage receipt for ${item.name}; inspect npm before retrying`,
      )
    const entry = {
      name: item.name,
      version: item.version,
      tag,
      stageId: receipt.stageId,
      integrity: item.integrity,
    }
    staged.push(entry)
    await onStaged(entry)
  }
  return staged
}
