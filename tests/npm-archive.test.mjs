import test from 'node:test'
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { promisify } from 'node:util'
import { npmArchivePaths } from '../scripts/lib/npm-archive.mjs'

for (const [label, lineEnding] of [
  ['LF', '\n'],
  ['CRLF', '\r\n'],
]) {
  test(`npm archive paths accept ${label} tool output`, () => {
    const entries = ['package/package.json', 'package/dist/index.js']
    assert.deepEqual(
      npmArchivePaths(entries.join(lineEnding) + lineEnding, lineEnding),
      entries,
    )
  })

  test(`npm archive paths reject unsafe names and duplicate manifests with ${label} output`, () => {
    for (const name of [
      'package/package.json',
      'package/../outside',
      'package\\dist\\index.js',
      'outside/index.js',
      'package/control\r',
      'package/control\x00',
    ])
      assert.throws(
        () =>
          npmArchivePaths(
            ['package/package.json', name].join(lineEnding) + lineEnding,
            lineEnding,
          ),
        /Ambiguous or unsafe npm archive paths/,
      )
  })
}

test('manifest verification accepts CRLF from Windows tar', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')
  const originalExecFile = childProcess.execFile
  const manifest = { name: '@goldenpigeon/dsh-eu4-indexer', version: '0.1.0' }
  const calls = []
  const fakeExec = Object.assign(() => {}, {
    [promisify.custom]: async (_command, args) => {
      calls.push(args)
      return {
        stdout:
          args[0] === '-tzf'
            ? 'package/package.json\r\npackage/dist/index.js\r\n'
            : args[0] === '-tvzf'
              ? '-rw-r--r-- 0 0 0 80 Jan 1 00:00 package/package.json\r\n'
              : JSON.stringify(manifest),
      }
    },
  })
  childProcess.execFile = fakeExec
  try {
    syncBuiltinESMExports()
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
    const { verifyNpmManifest } =
      await import('../scripts/lib/npm-archive.mjs?windows-tar-fixture')
    await verifyNpmManifest('fixture.tgz', manifest)
    assert.deepEqual(
      calls.map((args) => args[0]),
      ['-tzf', '-tvzf', '-xOf'],
    )
  } finally {
    Object.defineProperty(process, 'platform', platform)
    childProcess.execFile = originalExecFile
    syncBuiltinESMExports()
  }
})
