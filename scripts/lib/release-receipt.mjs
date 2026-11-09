import { readFile, writeFile, lstat } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { verifyNpmManifest } from './npm-archive.mjs'
import { npmArchiveName } from './npm-package.mjs'

const packageName =
  /^@goldenpigeon\/dsh-eu4-indexer-engine-(?:darwin|win32|linux|linux-musl)-(?:x64|arm64)$/
const commitPattern = /^[0-9a-f]{40}$/
const integrity = (bytes) =>
  `sha512-${createHash('sha512').update(bytes).digest('base64')}`

async function expectedPackages(root) {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json')))
  const lock = JSON.parse(await readFile(path.join(root, 'engine.lock.json')))
  assert.equal(
    pkg.name,
    '@goldenpigeon/dsh-eu4-indexer',
    'Unexpected main package',
  )
  const engines = Object.entries(lock.packages).map(([rid, p]) => ({
    ...p,
    rid,
  }))
  assert.equal(engines.length, 8, 'Expected all eight engine packages')
  assert.equal(
    new Set(engines.map((p) => p.name)).size,
    8,
    'Duplicate engine package',
  )
  for (const p of engines) {
    assert.ok(packageName.test(p.name), 'Unexpected engine package name')
    assert.equal(
      p.version,
      pkg.version,
      'Engine version must match the main package',
    )
  }
  assert.deepEqual(
    pkg.optionalDependencies,
    Object.fromEntries(engines.map((p) => [p.name, pkg.version])),
    'Optional dependencies must match the complete release set',
  )
  const result = []
  for (const item of [...engines, pkg]) {
    const manifest = item.rid
      ? JSON.parse(
          await readFile(
            path.join(root, 'packages', `engine-${item.rid}`, 'package.json'),
          ),
        )
      : pkg
    assert.equal(manifest.name, item.name, 'Source manifest package mismatch')
    assert.equal(
      manifest.version,
      item.version,
      'Source manifest version mismatch',
    )
    result.push({
      name: item.name,
      version: item.version,
      filename: npmArchiveName(item.name, item.version),
      manifest,
    })
  }
  return result
}

/** Record candidate inputs without credentials; the caller must validate then recheck them. */
export async function writeReleaseReceipt(root, commit) {
  assert.ok(commitPattern.test(commit), 'A full source commit is required')
  const packages = []
  for (const { manifest, ...p } of await expectedPackages(root)) {
    const archive = path.join(root, 'artifacts/npm', p.filename)
    assert.ok(
      (await lstat(archive)).isFile(),
      'Expected a regular release archive',
    )
    await verifyNpmManifest(archive, manifest)
    packages.push({ ...p, integrity: integrity(await readFile(archive)) })
  }
  const receipt = { schemaVersion: 1, commit, packages }
  await writeFile(
    path.join(root, 'artifacts/npm/release-set.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  )
  return receipt
}

/** The credential job parses only data and hashes; it never loads the build dependencies. */
export async function readReleaseReceipt(root, commit) {
  assert.ok(commitPattern.test(commit), 'A full source commit is required')
  const receipt = JSON.parse(
    await readFile(path.join(root, 'artifacts/npm/release-set.json')),
  )
  assert.equal(receipt.schemaVersion, 1, 'Unsupported release receipt')
  assert.equal(
    receipt.commit,
    commit,
    'Release receipt belongs to another source commit',
  )
  const expected = await expectedPackages(root)
  assert.ok(Array.isArray(receipt.packages), 'Missing release packages')
  assert.deepEqual(
    receipt.packages.map(({ name, version, filename }) => ({
      name,
      version,
      filename,
    })),
    expected.map(({ manifest, ...p }) => p),
    'Incomplete or mismatched release set',
  )
  const packages = []
  for (const [index, p] of receipt.packages.entries()) {
    const archive = path.join(root, 'artifacts/npm', p.filename)
    assert.ok(
      (await lstat(archive)).isFile(),
      'Expected a regular release archive',
    )
    assert.equal(
      integrity(await readFile(archive)),
      p.integrity,
      'Release archive digest mismatch',
    )
    await verifyNpmManifest(archive, expected[index].manifest)
    packages.push({
      name: p.name,
      version: p.version,
      archive,
      integrity: p.integrity,
    })
  }
  return packages
}
