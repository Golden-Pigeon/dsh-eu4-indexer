import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** Check the outer npm payload, including notices duplicated outside bin/. */
export async function verifyPlatformFiles(
  directory,
  entries,
  receipt,
  expected,
) {
  const files = new Set([
    'package/package.json',
    'package/engine.json',
    'package/README.md',
    'package/LICENSE',
    ...Object.keys(receipt.files).map((file) => `package/${file}`),
  ])
  for (const [file, digest] of Object.entries(receipt.files)) {
    if (
      !file.startsWith('bin/third-party/') &&
      file !== 'bin/THIRD-PARTY-NOTICES.md'
    )
      continue
    const relative = file.slice('bin/'.length)
    files.add(`package/${relative}`)
    assert.equal(
      createHash('sha256')
        .update(await readFile(path.join(directory, relative)))
        .digest('hex'),
      digest,
      `Changed top-level notice: ${relative}`,
    )
  }
  assert.deepEqual(
    new Set(entries.filter((file) => !file.endsWith('/'))),
    files,
    'Unexpected platform package files',
  )
  for (const file of ['README.md', 'LICENSE'])
    assert.ok(
      (await readFile(path.join(directory, file))).equals(expected[file]),
      `Changed platform ${file}`,
    )
}
