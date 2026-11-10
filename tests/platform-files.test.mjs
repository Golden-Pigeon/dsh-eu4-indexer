import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { verifyPlatformFiles } from '../scripts/lib/platform-files.mjs'

test('platform npm payload rejects extra files and changes to outer notices or trusted docs', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'e4-npm-payload-'))
  try {
    const expected = {
      'README.md': Buffer.from('readme'),
      LICENSE: Buffer.from('license'),
    }
    const notice = 'full license text'
    const receipt = {
      files: {
        'bin/eu4indexer': '0'.repeat(64),
        'bin/third-party/component/LICENSE': createHash('sha256')
          .update(notice)
          .digest('hex'),
      },
    }
    await mkdir(path.join(directory, 'third-party/component'), {
      recursive: true,
    })
    for (const [file, bytes] of Object.entries(expected))
      await writeFile(path.join(directory, file), bytes)
    const license = path.join(directory, 'third-party/component/LICENSE')
    await writeFile(license, notice)
    const entries = [
      'package/package.json',
      'package/engine.json',
      'package/README.md',
      'package/LICENSE',
      'package/bin/eu4indexer',
      'package/bin/third-party/component/LICENSE',
      'package/third-party/component/LICENSE',
    ]
    const check = (list = entries) =>
      verifyPlatformFiles(directory, list, receipt, expected)
    await check()
    await assert.rejects(
      check([...entries, 'package/.secret/fixture']),
      /Unexpected platform package files/,
    )
    await assert.rejects(
      check(entries.filter((file) => !file.endsWith('/eu4indexer'))),
      /Unexpected platform package files/,
    )
    await writeFile(license, 'truncated notice')
    await assert.rejects(check(), /Changed top-level notice/)
    await writeFile(license, notice)
    await writeFile(path.join(directory, 'README.md'), 'stale readme')
    await assert.rejects(check(), /Changed platform README/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
