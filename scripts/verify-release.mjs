import { readFile, readdir, lstat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { platforms } from '../dist/engine/platforms.js'
import { compiledFiles } from './compile.mjs'
import { npmArchiveName } from './lib/npm-package.mjs'
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
const mainEntries = execFileSync('tar', ['-tzf', main], { encoding: 'utf8' })
  .split('\n')
  .filter((entry) => entry && !entry.endsWith('/'))
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
    npmArchiveName(platform.name, pkg.version),
  )
  const entries = execFileSync('tar', ['-tzf', archive], {
    encoding: 'utf8',
  }).split('\n')
  const json = (file) =>
    JSON.parse(
      execFileSync('tar', ['-xOf', archive, `package/${file}`], {
        encoding: 'utf8',
      }),
    )
  const manifest = json('package.json'),
    engine = json('engine.json')
  assert.equal(manifest.name, platform.name)
  assert.equal(manifest.version, pkg.version)
  assert.deepEqual(manifest.os, platform.os)
  assert.deepEqual(manifest.cpu, platform.cpu)
  assert.deepEqual(manifest.libc, platform.libc)
  assert.equal(engine.rid, target)
  assert.equal(engine.apiVersion, lock.apiVersion)
  assert.equal(engine.sourceCommit, lock.sourceCommit)
  assert.deepEqual(engine.build, lock.build)
  assert.ok(entries.includes(`package/${engine.asset.file}`))
  const bytes = execFileSync(
    'tar',
    ['-xOf', archive, `package/${engine.asset.file}`],
    { maxBuffer: 256 * 1024 * 1024 },
  )
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    engine.asset.sha256,
  )
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
    1,
  )
}
console.log(
  `Release set verified locally: main package + ${Object.keys(platforms).length} platform packages; nothing published.`,
)
