import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { localRegistry } from '../scripts/lib/package-registry.mjs'
import { npmArchiveName } from '../scripts/lib/npm-package.mjs'
import { platforms } from '../dist/engine/platforms.js'

test('upgrade registry resolves historical engines from each plugin manifest instead of its version', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-registry-versions-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const name = '@goldenpigeon/dsh-eu4-indexer'
  const dependencies = (version) =>
    Object.fromEntries(Object.values(platforms).map((p) => [p.name, version]))
  await mkdir(path.join(root, 'artifacts/npm'), { recursive: true })
  const pack = async (manifest) => {
    const dir = path.join(root, 'contents/package')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(manifest))
    execFileSync('tar', [
      '-czf',
      path.join(
        root,
        'artifacts/npm',
        npmArchiveName(manifest.name, manifest.version),
      ),
      '-C',
      path.dirname(dir),
      'package',
    ])
  }
  const current = {
    name,
    version: '0.1.2',
    optionalDependencies: dependencies('0.4.0'),
  }
  await writeFile(path.join(root, 'package.json'), JSON.stringify(current))
  await pack(current)
  await pack({
    name,
    version: '0.1.1',
    optionalDependencies: dependencies('0.4.0'),
  })
  await pack({
    name,
    version: '0.1.0',
    optionalDependencies: dependencies('0.3.2'),
  })
  for (const [rid, platform] of Object.entries(platforms)) {
    const manifest = { name: platform.name, version: '0.4.0' }
    const dir = path.join(root, 'packages', `engine-${rid}`)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(manifest))
    await pack(manifest)
    await pack({ ...manifest, version: '0.3.2' })
  }
  const registry = await localRegistry(root, 0, ['0.1.0', '0.1.1'])
  t.after(() => new Promise((resolve) => registry.server.close(resolve)))
  const main = await (
    await fetch(`${registry.url}/${encodeURIComponent(name)}`)
  ).json()
  assert.deepEqual(Object.keys(main.versions).sort(), [
    '0.1.0',
    '0.1.1',
    '0.1.2',
  ])
  for (const p of Object.values(platforms)) {
    const engine = await (
      await fetch(`${registry.url}/${encodeURIComponent(p.name)}`)
    ).json()
    assert.deepEqual(Object.keys(engine.versions).sort(), ['0.3.2', '0.4.0'])
    const response = await fetch(engine.versions['0.3.2'].dist.tarball)
    assert.equal(response.status, 200)
    assert.ok((await response.arrayBuffer()).byteLength)
  }
})
