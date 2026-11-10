import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  chmod,
  rm,
  realpath,
} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { Engine, rid } from '../dist/engine/index.js'
import { publishFiles } from '../dist/engine/package.js'
import { IndexerService } from '../dist/service.js'

async function fixture() {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), 'e4-library-')),
  )
  const home = path.join(root, 'user-data')
  const name = '@fixture/engine',
    version = '1.0.0'
  const directory = path.join(root, 'node_modules', name)
  const executable = path.join(
    directory,
    'bin',
    process.platform === 'win32' ? 'eu4indexer.exe' : 'eu4indexer',
  )
  await mkdir(path.dirname(executable), { recursive: true })
  await writeFile(
    executable,
    `#!${process.execPath}\nprocess.stdin.resume();console.log(JSON.stringify({apiVersion:1,type:'result',data:{apiVersion:1,engineVersion:'test'}}))`,
  )
  await chmod(executable, 0o755)
  await writeFile(
    path.join(directory, 'bin', 'runtime.dll'),
    'complete publish tree',
  )
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', private: true }),
  )
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name, version }),
  )
  const manifest = {
    apiVersion: 1,
    sourceCommit: 'test',
    build: { sdkVersion: 'fixture' },
    packages: { [rid()]: { name, version } },
  }
  const receipt = {
    formatVersion: 2,
    apiVersion: 1,
    sourceCommit: 'test',
    build: manifest.build,
    rid: rid(),
    entryPoint: path.relative(directory, executable).split(path.sep).join('/'),
    files: await publishFiles(directory),
  }
  const receiptPath = path.join(directory, 'engine.json')
  await writeFile(receiptPath, JSON.stringify(receipt))
  return {
    root,
    home,
    directory,
    executable,
    manifest,
    receipt,
    receiptPath,
    engine: new Engine({
      home,
      packageRoot: root,
      manifest,
      fetchImpl: async () => {
        throw new Error('No runtime downloads')
      },
    }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

test('library resolves npm binary immediately and ignores stale user-directory engines', async () => {
  const f = await fixture()
  try {
    await mkdir(path.join(f.home, 'engine/current/bin'), { recursive: true })
    await writeFile(
      path.join(f.home, 'engine/current/bin/eu4indexer'),
      'stale engine',
    )
    assert.equal(await f.engine.resolve(), f.executable)
    const launch = await f.engine.querySession({
      database: path.join(f.home, 'a.db'),
      sessionId: 'chat-one',
    })
    assert.equal(launch.command, f.executable)
    assert.deepEqual(launch.args, [
      'serve',
      '--db',
      path.join(f.home, 'a.db'),
      '--query-session',
      'chat-one',
    ])
    assert.equal(launch.env.EU4INDEXER_HOME, f.home)
    assert.equal(
      await readFile(
        path.join(f.home, 'engine/current/bin/eu4indexer'),
        'utf8',
      ),
      'stale engine',
    )
  } finally {
    await f.cleanup()
  }
})

test('library checks complete publish files and all package provenance fields', async () => {
  const f = await fixture()
  try {
    for (const change of [
      { sourceCommit: 'older' },
      { apiVersion: 0 },
      { formatVersion: 1 },
      { build: { sdkVersion: 'older' } },
      { rid: 'another-platform' },
      { entryPoint: '../outside' },
      { files: { '../outside': '0'.repeat(64) } },
    ]) {
      await writeFile(
        f.receiptPath,
        JSON.stringify({ ...f.receipt, ...change }),
      )
      await assert.rejects(f.engine.resolve(), {
        code: 'engine_package_mismatch',
      })
    }
    await writeFile(f.receiptPath, JSON.stringify(f.receipt))
    assert.equal(await f.engine.resolve(), f.executable)
    await writeFile(
      path.join(f.directory, 'bin/runtime.dll'),
      'damaged runtime',
    )
    await assert.rejects(f.engine.resolve(), { code: 'checksum_mismatch' })
    await writeFile(
      path.join(f.directory, 'bin/runtime.dll'),
      'complete publish tree',
    )
    assert.equal(await f.engine.resolve(), f.executable)
    if (process.platform !== 'win32') {
      await chmod(f.executable, 0o644)
      await assert.rejects(f.engine.resolve(), {
        code: 'engine_package_mismatch',
      })
      await chmod(f.executable, 0o755)
      assert.equal(await f.engine.resolve(), f.executable)
    }
    await writeFile(
      path.join(f.directory, 'bin/extra.dll'),
      'unexpected runtime',
    )
    await assert.rejects(f.engine.resolve(), { code: 'checksum_mismatch' })
  } finally {
    await f.cleanup()
  }
})

test('package upgrades follow exact dependencies while preserving user data', async () => {
  const f = await fixture()
  try {
    await mkdir(f.home, { recursive: true })
    await writeFile(path.join(f.home, 'sessions.json'), '{"one":"index"}')
    assert.equal(await f.engine.resolve(), f.executable)
    await writeFile(
      path.join(f.directory, 'package.json'),
      JSON.stringify({ name: '@fixture/engine', version: '1.0.1' }),
    )
    await assert.rejects(f.engine.resolve(), {
      code: 'engine_package_mismatch',
    })
    const upgraded = new Engine({
      home: f.home,
      packageRoot: f.root,
      manifest: {
        ...f.manifest,
        packages: { [rid()]: { name: '@fixture/engine', version: '1.0.1' } },
      },
    })
    assert.equal(await upgraded.resolve(), f.executable)
    assert.equal(
      await readFile(path.join(f.home, 'sessions.json'), 'utf8'),
      '{"one":"index"}',
    )
    await rm(f.directory, { recursive: true })
    await assert.rejects(upgraded.resolve(), {
      code: 'engine_package_missing',
    })
  } finally {
    await f.cleanup()
  }
})

test(
  'relative external executable paths remain absolute and persist in settings',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await fixture()
    const service = new IndexerService({ home: f.home })
    try {
      await service.init()
      await service.dispatch({
        operation: 'configure',
        executablePath: path.relative(process.cwd(), f.executable),
      })
      assert.equal(await service.engine.resolve(), f.executable)
      assert.equal(
        JSON.parse(await readFile(path.join(f.home, 'settings.json')))
          .executablePath,
        f.executable,
      )
    } finally {
      await service.stop()
      await f.cleanup()
    }
  },
)
