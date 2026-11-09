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
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { Engine, rid } from '../dist/engine/runtime.js'
import { IndexerService } from '../dist/service.js'
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
  'managed engine provenance must match the current plugin lock, with reinstall recovery',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await fixture()
    const receiptPath = path.join(f.home, 'engine/current/receipt.json')
    try {
      await f.engine.install()
      const original = await readFile(receiptPath, 'utf8')
      for (const change of [
        { sourceCommit: 'older-source' },
        { apiVersion: 0 },
        { build: { sdkVersion: 'older-sdk' } },
        { rid: 'another-platform' },
        { package: { name: 'other', version: '0.0.0' } },
      ]) {
        await writeFile(
          receiptPath,
          JSON.stringify({ ...JSON.parse(original), ...change }),
        )
        assert.equal((await f.engine.status()).code, 'engine_update_required')
        await assert.rejects(f.engine.call({ operation: 'list' }), {
          code: 'engine_update_required',
        })
      }
      for (const legacy of ['{', JSON.stringify({ sourceCommit: 'test' })]) {
        await writeFile(receiptPath, legacy)
        assert.equal((await f.engine.status()).code, 'engine_update_required')
      }
      await rm(receiptPath)
      assert.equal((await f.engine.status()).code, 'engine_update_required')
      assert.equal((await f.engine.install()).ready, true)
      const upgraded = new Engine({
        home: f.home,
        manifest: { ...f.manifest, sourceCommit: 'new-plugin-source' },
      })
      assert.equal((await upgraded.status()).code, 'engine_update_required')
      // A deliberately configured external executable remains owner managed.
      upgraded.explicit = path.join(f.home, 'engine/current/bin/eu4indexer')
      assert.equal((await upgraded.status()).ready, true)
      const service = new IndexerService({
        home: f.home,
        executablePath: upgraded.explicit,
      })
      await service.init()
      try {
        const checked = await service.dispatch({
          operation: 'configure',
          executablePath: '',
        })
        assert.equal(checked.code, 'engine_update_required')
        assert.equal(service.engine.explicit, '')
      } finally {
        await service.stop()
      }
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

test(
  'cancellation while suspending connections cannot activate a replacement engine',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await fixture()
    try {
      await f.engine.install()
      const marker = path.join(f.home, 'engine/current/original')
      await writeFile(marker, 'keep')
      const controller = new AbortController()
      let resumed = false
      await assert.rejects(
        f.engine.install({
          signal: controller.signal,
          beforeActivate: async () =>
            controller.abort(new DOMException('Cancelled', 'AbortError')),
          afterActivate: async () => {
            resumed = true
          },
        }),
        { name: 'AbortError' },
      )
      assert.equal(await readFile(marker, 'utf8'), 'keep')
      assert.equal(resumed, true)
    } finally {
      await f.cleanup()
    }
  },
)

test(
  'failed suspension resumes the original engine connections',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await fixture()
    let resumed = false
    try {
      await assert.rejects(
        f.engine.install({
          beforeActivate: async () => {
            throw new Error('suspension failed')
          },
          afterActivate: async () => {
            resumed = true
          },
        }),
        /suspension failed/,
      )
      assert.equal(resumed, true)
    } finally {
      await f.cleanup()
    }
  },
)

test(
  'relative external engines remain executable from the MCP working directory and persist an absolute path',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await fixture()
    const service = new IndexerService({ home: f.home })
    try {
      await service.init()
      const absolute = path.join(f.home, 'source/bin/eu4indexer')
      await service.dispatch({
        operation: 'configure',
        executablePath: path.relative(process.cwd(), absolute),
      })
      const command = await service.engine.resolve()
      const run = spawnSync(command, ['manage'], {
        cwd: f.home,
        encoding: 'utf8',
      })
      assert.equal(run.status, 0, run.error?.message ?? run.stderr)
      assert.equal(command, absolute)
      assert.equal(
        JSON.parse(await readFile(path.join(f.home, 'settings.json')))
          .executablePath,
        absolute,
      )
    } finally {
      await service.stop()
      await f.cleanup()
    }
  },
)
