import { readFile, readdir, lstat, mkdtemp, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import assert from 'node:assert/strict'
import os from 'node:os'
import { platforms } from '../dist/engine/platforms.js'
import { compiledFiles } from './compile.mjs'
import { npmArchiveName } from './lib/npm-package.mjs'
import { npmArchivePaths } from './lib/npm-archive.mjs'
import { verifyPublishPackage } from '../dist/engine/package.js'
import { verifyPlatformFiles } from './lib/platform-files.mjs'
const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json')))
const lock = JSON.parse(await readFile(path.join(root, 'engine.lock.json')))
const main = path.resolve(
  process.argv[2] ??
    path.join(root, 'artifacts/npm', npmArchiveName(pkg.name, pkg.version)),
)
const mainJson = (file) =>
  JSON.parse(
    execFileSync('tar', ['-xOf', main, `package/${file}`], {
      encoding: 'utf8',
    }),
  )
const manifest = mainJson('package.json')
for (const key of [
  'name',
  'version',
  'dsh',
  'exports',
  'types',
  'peerDependencies',
  'engines',
  'optionalDependencies',
])
  assert.deepEqual(
    manifest[key],
    pkg[key],
    `Stale main package ${key}; repack it`,
  )
assert.deepEqual(
  mainJson('engine.lock.json'),
  lock,
  'Main package engine lock differs from the release set; repack it',
)
const archivePaths = (archive) =>
  npmArchivePaths(
    execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }),
    process.platform === 'win32' ? '\r\n' : '\n',
  )
const mainEntries = archivePaths(main).filter((entry) => !entry.endsWith('/'))
const expected = new Set(['package/package.json'])
const compiled = compiledFiles()
function verifyBytes(relative, bytes) {
  const entry = `package/${relative}`
  expected.add(entry)
  const message = `Main package content differs: ${relative}; repack it`
  assert.ok(mainEntries.includes(entry), message)
  const packed = execFileSync('tar', ['-xOf', main, entry], {
    maxBuffer: 16 * 1024 * 1024,
  })
  assert.ok(packed.equals(bytes), message)
}
async function verifyContent(relative) {
  if (relative === 'dist') {
    for (const [file, bytes] of compiled) verifyBytes(file, bytes)
    return
  }
  const file = path.join(root, relative)
  const info = await lstat(file)
  if (info.isDirectory()) {
    for (const entry of await readdir(file))
      await verifyContent(path.posix.join(relative, entry))
    return
  }
  assert.ok(info.isFile(), `Package source must be a regular file: ${relative}`)
  verifyBytes(relative, await readFile(file))
}
for (const entry of pkg.files) await verifyContent(entry)
assert.deepEqual(
  new Set(mainEntries),
  expected,
  'Unexpected main package files',
)
for (const [target, platform] of Object.entries(platforms)) {
  const archive = path.join(
    root,
    'artifacts/npm',
    npmArchiveName(platform.name, lock.packages[target].version),
  )
  const entries = archivePaths(archive)
  const json = (file) =>
    JSON.parse(
      execFileSync('tar', ['-xOf', archive, `package/${file}`], {
        encoding: 'utf8',
      }),
    )
  const manifest = json('package.json'),
    engine = json('engine.json')
  assert.equal(manifest.name, platform.name)
  assert.equal(manifest.version, lock.engineVersion)
  assert.equal(manifest.version, lock.packages[target].version)
  assert.equal(pkg.optionalDependencies[manifest.name], manifest.version)
  assert.deepEqual(manifest.os, platform.os)
  assert.deepEqual(manifest.cpu, platform.cpu)
  assert.deepEqual(manifest.libc, platform.libc)
  assert.equal(engine.rid, target)
  assert.equal(engine.apiVersion, lock.apiVersion)
  assert.equal(engine.sourceCommit, lock.sourceCommit)
  assert.deepEqual(engine.build, lock.build)
  assert.deepEqual(
    manifest,
    JSON.parse(
      await readFile(
        path.join(root, 'packages', `engine-${target}`, 'package.json'),
      ),
    ),
  )
  assert.equal(
    new Set(entries).size,
    entries.length,
    'Duplicate engine package members',
  )
  const detail = execFileSync('tar', ['-tvzf', archive], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  assert.ok(
    detail
      .split(/\r?\n/)
      .filter(Boolean)
      .every((line) => /^[-d]/.test(line)),
    'Engine package members must be ordinary files or directories',
  )
  const extracted = await mkdtemp(path.join(os.tmpdir(), 'dsh-engine-verify-'))
  try {
    execFileSync('tar', ['-xzf', archive, '-C', extracted])
    const directory = path.join(extracted, 'package')
    await verifyPublishPackage(directory, lock, target)
    await verifyPlatformFiles(directory, entries, engine, {
      'README.md': await readFile(
        path.join(root, 'packages', `engine-${target}`, 'README.md'),
      ),
      LICENSE: await readFile(
        path.join(root, 'packages', `engine-${target}`, 'LICENSE'),
      ),
    })
  } finally {
    await rm(extracted, { recursive: true, force: true })
  }
  assert.ok(entries.includes('package/third-party/cwtools/LICENSE'))
  assert.ok(
    entries.includes(
      'package/third-party/dotnet-runtime/THIRD-PARTY-NOTICES.TXT',
    ),
  )
  const inventory = json('third-party/inventory.json')
  assert.ok(
    inventory
      .find((item) => item.component === 'FParsec')
      .files.some((file) => file.endsWith('/UNICODE-LICENSE.txt')),
  )
  for (const item of inventory)
    for (const file of item.files)
      assert.ok(
        entries.includes(`package/${file}`),
        `Missing ${target} notice: ${file}`,
      )
  assert.equal(
    entries.filter((s) => /engine\.(?:zip|tar\.gz)$/.test(s)).length,
    0,
  )
}
console.log(
  `Release set verified locally: main package + ${Object.keys(platforms).length} platform packages; nothing published.`,
)
