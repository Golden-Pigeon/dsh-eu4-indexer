import path from 'node:path'
import os from 'node:os'
import { mkdtemp, rm, readFile, access } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const archive = path.resolve(
    process.argv[2] ?? 'artifacts/dsh-eu4-indexer-0.1.0.tgz',
  ),
  temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-package-'))
try {
  execFileSync('tar', ['-xzf', archive, '-C', temp])
  const packageDir = path.join(temp, 'package'),
    { Engine, rid } = await import(
      pathToFileURL(path.join(packageDir, 'src/engine/runtime.js'))
    )
  const lock = JSON.parse(
    await readFile(path.join(packageDir, 'engine.lock.json')),
  )
  assert.ok(lock.assets[rid()])
  for (const game of ['eu4', 'hoi4'])
    for (const language of ['en', 'zh'])
      assert.ok(
        (
          await readFile(
            path.join(
              packageDir,
              'resources/skills',
              game,
              language,
              'SKILL.md',
            ),
            'utf8',
          )
        ).includes('eu4_indexer_manage'),
      )
  await access(path.join(packageDir, 'docs/architecture.md'))
  await access(path.join(packageDir, 'resources/docs/management.md'))
  const engine = new Engine({
    home: path.join(temp, 'home'),
    fetchImpl: async () => {
      throw new Error('An offline package must not fetch its engine')
    },
  })
  const result = await engine.install()
  assert.equal(result.ready, true)
  assert.equal(result.capabilities.apiVersion, 1)
  assert.equal((await engine.call({ operation: 'list' })).databases.length, 0)
  console.log(
    `Offline package verified: ${rid()}, API 1, source ${lock.sourceCommit}`,
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
