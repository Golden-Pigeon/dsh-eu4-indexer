import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  cp,
  symlink,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { archiveEngine } from '../scripts/lib/engine-archive.mjs'
import { verifyUpstreamSource } from '../scripts/lib/upstream-source.mjs'
import {
  stageEngineSource,
  verifyEnginePrivacy,
} from '../scripts/lib/engine-source.mjs'

test('engine tar archives omit private ownership and filesystem metadata while preserving executable content', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-archive-privacy-'))
  try {
    await mkdir(path.join(temp, 'bin'))
    await writeFile(path.join(temp, 'bin/eu4indexer'), 'fixture executable', {
      mode: 0o755,
    })
    if (process.platform === 'darwin')
      execFileSync('xattr', [
        '-w',
        'com.example.private',
        'fixture-local-marker',
        path.join(temp, 'bin/eu4indexer'),
      ])
    const artifact = path.join(temp, 'engine.tar.gz')
    const result = archiveEngine(temp, artifact, false)
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0)
    const bytes = gunzipSync(await readFile(artifact))
    let executable = false
    for (let offset = 0; offset + 512 <= bytes.length; ) {
      const header = bytes.subarray(offset, offset + 512)
      if (header.every((value) => value === 0)) break
      const field = (start, end) =>
        header.subarray(start, end).toString().replace(/\0.*$/s, '')
      assert.equal(parseInt(field(108, 116), 8), 0)
      assert.equal(parseInt(field(116, 124), 8), 0)
      assert.equal(field(265, 297), '')
      assert.equal(field(297, 329), '')
      assert.ok(
        ['0', '5', ''].includes(field(156, 157)),
        'Only ordinary files/directories; no metadata entries',
      )
      assert.ok(
        !field(0, 100)
          .split('/')
          .some((part) => part.startsWith('._')),
      )
      const size = parseInt(field(124, 136), 8)
      if (field(0, 100) === 'bin/eu4indexer') {
        executable = true
        assert.equal(
          bytes.subarray(offset + 512, offset + 512 + size).toString(),
          'fixture executable',
        )
        if (process.platform !== 'win32')
          assert.ok(parseInt(field(100, 108), 8) & 0o111)
      }
      offset += 512 + Math.ceil(size / 512) * 512
    }
    assert.ok(executable)
    assert.ok(!bytes.includes(Buffer.from('fixture-local-marker')))
    if (process.platform !== 'win32') {
      const zip = path.join(temp, 'engine.zip')
      assert.equal(archiveEngine(temp, zip, true).status, 0)
      const zipped = await readFile(zip)
      // Info-ZIP's Unix UID/GID extra field must not be shipped.
      for (let offset = 0; offset + 46 <= zipped.length; offset++) {
        if (zipped.readUInt32LE(offset) !== 0x02014b50) continue
        const nameLength = zipped.readUInt16LE(offset + 28)
        const extraLength = zipped.readUInt16LE(offset + 30)
        let extra = offset + 46 + nameLength
        const end = extra + extraLength
        while (extra + 4 <= end) {
          assert.notEqual(zipped.readUInt16LE(extra), 0x7875)
          extra += 4 + zipped.readUInt16LE(extra + 2)
        }
      }
    }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('engine staging copies tracked sources without local files or Git metadata and removes its temporary workspace', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-source-privacy-'))
  const upstream = path.join(temp, 'upstream')
  let staged
  try {
    await writeFile(
      path.join(temp, 'global.json'),
      '{"sdk":{"version":"9.0.315"}}\n',
    )
    for (const relative of ['', 'external/cwtools']) {
      const repo = path.join(upstream, relative)
      await mkdir(repo, { recursive: true })
      execFileSync('git', ['init', '-q', repo])
      await writeFile(path.join(repo, 'tracked.fs'), 'module Fixture\n')
      execFileSync('git', ['add', 'tracked.fs'], { cwd: repo })
      await writeFile(
        path.join(repo, '.env'),
        'LOCAL_ONLY=fixture-only-marker\n',
      )
    }
    staged = await stageEngineSource(temp, upstream)
    for (const relative of ['', 'external/cwtools']) {
      assert.equal(
        await readFile(
          path.join(staged.source, relative, 'tracked.fs'),
          'utf8',
        ),
        'module Fixture\n',
      )
      for (const local of ['.env', '.git/config'])
        await assert.rejects(
          readFile(path.join(staged.source, relative, local)),
          { code: 'ENOENT' },
        )
    }
    assert.ok(!staged.source.startsWith(os.homedir() + path.sep))
    await staged.cleanup()
    await assert.rejects(
      readFile(path.join(path.dirname(staged.source), 'global.json')),
      { code: 'ENOENT' },
    )
  } finally {
    await staged?.cleanup()
    await rm(temp, { recursive: true, force: true })
  }
})

test('engine validation rejects private source paths in UTF-8 and UTF-16 assembly data', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-binary-privacy-'))
  try {
    for (const name of [
      'eu4indexer',
      'Eu4Indexer.Core',
      'Eu4Indexer.Mcp',
      'CWTools',
      'Shared',
      'CSharpHelpers',
    ])
      await writeFile(
        path.join(temp, `${name}.dll`),
        'neutral assembly fixture',
      )
    await verifyEnginePrivacy(temp, [os.homedir()])
    for (const encoding of ['utf8', 'utf16le']) {
      await writeFile(
        path.join(temp, 'CWTools.dll'),
        Buffer.from(
          path.join(os.homedir(), 'private source', 'Game.fs'),
          encoding,
        ),
      )
      await assert.rejects(
        verifyEnginePrivacy(temp, [os.homedir()]),
        /Private build path embedded in CWTools\.dll/,
      )
    }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

for (const interrupted of ['build', 'typecheck'])
  test(`check rejects a ${interrupted} process stopped by a signal`, async () => {
    const root = path.resolve(import.meta.dirname, '..')
    const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-check-signal-'))
    try {
      for (const directory of [
        'scripts',
        'src',
        'tests',
        'node_modules/typescript/bin',
      ])
        await mkdir(path.join(temp, directory), { recursive: true })
      await cp(
        path.join(root, 'scripts/check.mjs'),
        path.join(temp, 'scripts/check.mjs'),
      )
      await writeFile(path.join(temp, 'package.json'), '{"type":"module"}\n')
      await writeFile(path.join(temp, 'src/index.js'), 'export {}\n')
      await writeFile(
        path.join(temp, 'scripts/build.mjs'),
        interrupted === 'build'
          ? "process.kill(process.pid, 'SIGTERM')\n"
          : 'export {}\n',
      )
      await writeFile(
        path.join(temp, 'node_modules/typescript/bin/tsc'),
        interrupted === 'typecheck'
          ? "process.kill(process.pid, 'SIGTERM')\n"
          : '',
      )
      await writeFile(
        path.join(temp, 'tests/later.test.mjs'),
        "import { writeFileSync } from 'node:fs'\nwriteFileSync('later-tests-ran', '')\n",
      )
      const result = spawnSync(process.execPath, ['scripts/check.mjs'], {
        cwd: temp,
        encoding: 'utf8',
      })
      assert.notEqual(
        result.status,
        0,
        'A terminated check must never report success',
      )
      assert.match(result.stderr, /Check stopped by SIGTERM/)
      await assert.rejects(readFile(path.join(temp, 'later-tests-ran')), {
        code: 'ENOENT',
      })
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

test('an interrupted engine archive cannot produce a success receipt', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-archive-signal-'))
  try {
    for (const directory of [
      'scripts/lib',
      'dist/engine',
      'packages/engine-linux-x64',
    ])
      await mkdir(path.join(temp, directory), { recursive: true })
    await cp(
      path.join(root, 'scripts/build-engine.mjs'),
      path.join(temp, 'scripts/build-engine.mjs'),
    )
    await cp(
      path.join(root, 'scripts/lib/engine-archive.mjs'),
      path.join(temp, 'scripts/lib/engine-archive.mjs'),
    )
    await writeFile(path.join(temp, 'package.json'), '{"type":"module"}\n')
    await writeFile(
      path.join(temp, 'dist/engine/platforms.js'),
      "export const rid = () => 'linux-x64'; export const platforms = { 'linux-x64': {} }\n",
    )
    await writeFile(
      path.join(temp, 'scripts/lib/upstream-source.mjs'),
      'export function verifyUpstreamSource() {}\n',
    )
    await writeFile(
      path.join(temp, 'scripts/lib/engine-source.mjs'),
      'export async function stageEngineSource(root, source) { return { source, cleanup: async () => {} } }; export async function verifyEnginePrivacy() {}\n',
    )
    await writeFile(
      path.join(temp, 'scripts/lib/licenses.mjs'),
      `
      import { mkdir, writeFile } from 'node:fs/promises'
      import path from 'node:path'
      export async function collectLicenses(root, upstream, target, out) {
        await mkdir(path.join(out, 'third-party'), { recursive: true })
        await writeFile(path.join(out, 'THIRD-PARTY-NOTICES.md'), 'fixture')
      }
    `,
    )
    await writeFile(
      path.join(temp, 'engine.lock.json'),
      JSON.stringify({
        build: {
          sdkVersion: '9.0.315',
          sourcePathPolicy: 'neutral-staging-v1',
        },
        packages: { 'linux-x64': { version: '0.1.0' } },
      }),
    )
    await writeFile(
      path.join(temp, 'packages/engine-linux-x64/package.json'),
      '{"version":"0.1.0"}\n',
    )
    await writeFile(
      path.join(temp, 'interrupt-archive.mjs'),
      `
      import childProcess from 'node:child_process'
      import { syncBuiltinESMExports } from 'node:module'
      import { writeFileSync } from 'node:fs'
      childProcess.spawnSync = (command, args) => {
        if (command === 'dotnet') return { status: 0, stdout: '9.0.315' }
        if (command !== 'tar') throw new Error('Unexpected subprocess: ' + command)
        writeFileSync(args[1], 'partial archive')
        return { status: null, signal: 'SIGTERM' }
      }
      syncBuiltinESMExports()
    `,
    )
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        './interrupt-archive.mjs',
        'scripts/build-engine.mjs',
        'linux-x64',
      ],
      { cwd: temp, encoding: 'utf8' },
    )
    assert.notEqual(result.status, 0, 'Partial archives must fail the build')
    assert.match(result.stderr, /Engine archive failed: SIGTERM/)
    await assert.rejects(
      readFile(path.join(temp, 'packages/engine-linux-x64/engine.json')),
      { code: 'ENOENT' },
    )
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('a rejected TypeScript build preserves the last working output and successful builds remove obsolete files', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-build-recovery-'))
  const compile = () =>
    spawnSync(process.execPath, ['scripts/compile.mjs'], {
      cwd: temp,
      encoding: 'utf8',
    })
  try {
    for (const entry of [
      'scripts/compile.mjs',
      'tsconfig.json',
      'package.json',
    ]) {
      await mkdir(path.dirname(path.join(temp, entry)), { recursive: true })
      await cp(path.join(root, entry), path.join(temp, entry))
    }
    await symlink(
      path.join(root, 'node_modules'),
      path.join(temp, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    await mkdir(path.join(temp, 'src'))
    const source = path.join(temp, 'src/index.ts')
    const obsolete = path.join(temp, 'src/obsolete.ts')
    await writeFile(source, "export const version = 'working'\n")
    await writeFile(obsolete, 'export const obsolete = true\n')
    let result = compile()
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const outputs = [
      'index.js',
      'index.d.ts',
      'index.js.map',
      'obsolete.js',
      'obsolete.d.ts',
      'obsolete.js.map',
    ]
    const previous = await Promise.all(
      outputs.map((file) => readFile(path.join(temp, 'dist', file))),
    )
    await writeFile(source, "export const version: number = 'invalid'\n")
    result = compile()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /TS2322/)
    const retained = await Promise.all(
      outputs.map((file) => readFile(path.join(temp, 'dist', file))),
    )
    assert.deepEqual(
      retained,
      previous,
      'A compiler diagnostic must not remove the last runnable build',
    )
    await writeFile(source, "export const version = 'updated'\n")
    await rm(obsolete)
    result = compile()
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(
      await readFile(path.join(temp, 'dist/index.js'), 'utf8'),
      /updated/,
    )
    for (const file of outputs.filter((file) => file.startsWith('obsolete.')))
      await assert.rejects(readFile(path.join(temp, 'dist', file)), {
        code: 'ENOENT',
      })
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('source typecheck works in a clean checkout without generated dist', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-clean-typecheck-'))
  try {
    for (const entry of [
      'src',
      'tests/types',
      'tsconfig.json',
      'tsconfig.check.json',
      'package.json',
    ]) {
      await mkdir(path.dirname(path.join(temp, entry)), { recursive: true })
      await cp(path.join(root, entry), path.join(temp, entry), {
        recursive: true,
      })
    }
    await symlink(
      path.join(root, 'node_modules'),
      path.join(temp, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, 'node_modules/typescript/bin/tsc'),
        '-p',
        'tsconfig.check.json',
      ],
      { cwd: temp, encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
    await assert.rejects(readFile(path.join(temp, 'dist/index.d.ts')), {
      code: 'ENOENT',
    })
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('release verification rejects a tarball and local dist that are both stale relative to TypeScript', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-stale-typescript-'))
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json')))
  try {
    for (const entry of new Set([
      'src',
      'tsconfig.json',
      'package.json',
      'engine.lock.json',
      'scripts/compile.mjs',
      'scripts/verify-release.mjs',
      'scripts/lib/npm-package.mjs',
      ...manifest.files,
    ])) {
      await mkdir(path.dirname(path.join(temp, entry)), { recursive: true })
      await cp(path.join(root, entry), path.join(temp, entry), {
        recursive: true,
      })
    }
    await symlink(
      path.join(root, 'node_modules'),
      path.join(temp, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    const packageDir = path.join(temp, 'package')
    await mkdir(packageDir)
    for (const entry of ['package.json', ...manifest.files])
      await cp(path.join(temp, entry), path.join(packageDir, entry), {
        recursive: true,
      })
    const archive = path.join(temp, 'main.tgz')
    execFileSync('tar', ['-czf', archive, '-C', temp, 'package'])
    const source = path.join(temp, 'src/util.ts')
    await writeFile(
      source,
      (await readFile(source, 'utf8')).replace(
        'Expected an object',
        'Updated TypeScript source',
      ),
    )
    const result = spawnSync(
      process.execPath,
      ['scripts/verify-release.mjs', archive],
      { cwd: temp, encoding: 'utf8' },
    )
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Main package content differs: dist\/util\./)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('packaging refuses changed upstream skills/docs or an unpinned checkout', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-source-'))
  const upstream = path.join(root, 'external/eu4-indexer')
  await mkdir(upstream, { recursive: true })
  const git = (args) =>
    execFileSync('git', args, { cwd: upstream, encoding: 'utf8' }).trim()
  try {
    git(['init', '--quiet'])
    await writeFile(path.join(upstream, 'SKILL.md'), 'Pinned instructions\n')
    git(['add', 'SKILL.md'])
    git([
      '-c',
      'user.name=Packaging Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ])
    const lock = { sourceCommit: git(['rev-parse', 'HEAD']) }
    verifyUpstreamSource(root, lock)
    assert.throws(
      () => verifyUpstreamSource(root, { sourceCommit: '0'.repeat(40) }),
      /sourceCommit/,
    )
    await writeFile(
      path.join(upstream, 'SKILL.md'),
      'Uncommitted instructions\n',
    )
    assert.throws(
      () => verifyUpstreamSource(root, lock),
      /Commit upstream changes/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('release verification rejects stale source, DSH metadata and runtime code in the main package', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-stale-main-'))
  const dir = path.join(temp, 'package')
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json')))
  const lock = JSON.parse(await readFile(path.join(root, 'engine.lock.json')))
  try {
    await mkdir(dir)
    for (const failure of ['source', 'dsh', 'runtime']) {
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({
          ...manifest,
          ...(failure === 'dsh' ? { dsh: { manifestVersion: 999 } } : {}),
        }),
      )
      await writeFile(
        path.join(dir, 'engine.lock.json'),
        JSON.stringify({
          ...lock,
          ...(failure === 'source' ? { sourceCommit: '0'.repeat(40) } : {}),
        }),
      )
      if (failure === 'runtime') {
        for (const entry of manifest.files)
          if (!['engine.lock.json', 'package.json'].includes(entry))
            await cp(path.join(root, entry), path.join(dir, entry), {
              recursive: true,
            })
        await writeFile(
          path.join(dir, 'dist/index.js'),
          '// old plugin code with otherwise current metadata\n',
        )
      }
      const archive = path.join(temp, 'main.tgz')
      execFileSync('tar', ['-czf', archive, '-C', temp, 'package'])
      const result = spawnSync(
        process.execPath,
        ['scripts/verify-release.mjs', archive],
        { cwd: root, encoding: 'utf8' },
      )
      assert.notEqual(result.status, 0)
      assert.match(
        result.stderr,
        failure === 'source'
          ? /Main package engine lock differs/
          : failure === 'dsh'
            ? /Stale main package dsh/
            : /Main package content differs/,
      )
    }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})
