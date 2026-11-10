import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { publishPath, publishFiles } from '../dist/engine/package.js'

for (const unsafe of [
  'bin/../outside',
  'bin/..\\outside',
  'bin//outside',
  'bin/C:/outside',
  '/bin/outside',
  'bin/./outside',
  'bin/bad\nname',
])
  test(`publish inventory rejects ambiguous or escaping path ${JSON.stringify(unsafe)}`, () => {
    assert.equal(publishPath(unsafe), false)
    assert.equal(publishPath('bin/eu4indexer.exe'), true)
  })

test('complete publish verification rejects directory links', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-publish-link-'))
  try {
    await mkdir(path.join(root, 'outside'))
    await symlink(
      path.join(root, 'outside'),
      path.join(root, 'bin'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    await assert.rejects(publishFiles(root), /without links/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
