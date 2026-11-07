import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  chmod,
  rm,
  symlink,
  access,
} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { Engine, rid } from '../src/engine/runtime.js'
async function fixture(link = false) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'e4-install-')),
    bin = path.join(home, 'source/bin')
  await mkdir(bin, { recursive: true })
  const exe = path.join(bin, 'eu4indexer')
  await writeFile(
    exe,
    `#!${process.execPath}\nprocess.stdin.resume();console.log(JSON.stringify({apiVersion:1,type:'result',data:{apiVersion:1,engineVersion:'test'}}))`,
  )
  await chmod(exe, 0o755)
  if (link) await symlink('/etc/passwd', path.join(bin, 'unsafe'))
  const file = path.join(home, 'engine.tar.gz')
  execFileSync('tar', ['-czf', file, '-C', path.join(home, 'source'), 'bin'])
  const archive = await readFile(file)
  const manifest = {
    apiVersion: 1,
    sourceCommit: 'test',
    assets: {
      [rid()]: {
        url: 'https://example.invalid/engine',
        sha256: createHash('sha256').update(archive).digest('hex'),
      },
    },
  }
  return {
    home,
    manifest,
    engine: new Engine({
      home,
      manifest,
      fetchImpl: async () => new Response(archive),
    }),
    cleanup: () => rm(home, { recursive: true, force: true }),
  }
}
test(
  'engine installation verifies complete archive, activates atomically and retains previous version',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await fixture()
    let changing = 0,
      changed = 0
    try {
      assert.equal(
        (
          await f.engine.install({
            beforeActivate: async () => changing++,
            afterActivate: async () => changed++,
          })
        ).ready,
        true,
      )
      await f.engine.install()
      await access(path.join(f.home, 'engine/previous/bin/eu4indexer'))
      assert.equal(changing, 1)
      assert.equal(changed, 1)
      const receipt = JSON.parse(
        await readFile(path.join(f.home, 'engine/current/receipt.json')),
      )
      assert.equal(receipt.sourceCommit, 'test')
    } finally {
      await f.cleanup()
    }
  },
)
test(
  'checksum failure and archive links cannot replace an installed engine',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await fixture()
    try {
      await f.engine.install()
      f.manifest.assets[rid()].sha256 = '0'.repeat(64)
      await assert.rejects(f.engine.install(), { code: 'checksum_mismatch' })
      assert.equal((await f.engine.status()).ready, true)
    } finally {
      await f.cleanup()
    }
    const linked = await fixture(true)
    try {
      await assert.rejects(linked.engine.install(), /must not contain links/)
    } finally {
      await linked.cleanup()
    }
  },
)
