import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  cp,
  rm,
  access,
  link,
} from 'node:fs/promises'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import {
  writeReleaseReceipt,
  readReleaseReceipt,
} from '../scripts/lib/release-receipt.mjs'
import { stagingRunner } from '../scripts/lib/npm-staging-runner.mjs'
import { npmArchiveName } from '../scripts/lib/npm-package.mjs'

const root = path.resolve(import.meta.dirname, '..')
const commit = '1'.repeat(40)
const fakeToken = 'fixture-sensitive-stage-token'
async function packManifest(directory, item, manifest) {
  const contents = path.join(directory, 'contents', item.name)
  await mkdir(path.join(contents, 'package'), { recursive: true })
  await writeFile(
    path.join(contents, 'package/package.json'),
    JSON.stringify(manifest),
  )
  execFileSync('tar', ['-czf', item.archive, '-C', contents, 'package'])
}
async function forgeCurrentDigest(f, item) {
  const receipt = structuredClone(f.receipt)
  receipt.packages.find((p) => p.name === item.name).integrity =
    `sha512-${createHash('sha512')
      .update(await readFile(item.archive))
      .digest('base64')}`
  await writeFile(f.receiptPath, JSON.stringify(receipt))
}
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dsh-stage-security-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const lock = JSON.parse(await readFile(path.join(root, 'engine.lock.json')))
  lock.engineVersion = '0.4.0'
  for (const p of Object.values(lock.packages)) p.version = lock.engineVersion
  const pkg = {
    name: '@goldenpigeon/dsh-eu4-indexer',
    version: '0.2.0',
    type: 'module',
    optionalDependencies: Object.fromEntries(
      Object.values(lock.packages).map((p) => [p.name, p.version]),
    ),
  }
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(pkg))
  await writeFile(
    path.join(directory, 'engine.lock.json'),
    JSON.stringify(lock),
  )
  await mkdir(path.join(directory, 'artifacts/npm'), { recursive: true })
  const packages = [...Object.values(lock.packages), pkg].map(
    ({ name, version }) => ({
      name,
      version,
      archive: path.join(
        directory,
        'artifacts/npm',
        npmArchiveName(name, version),
      ),
    }),
  )
  for (const [rid, p] of Object.entries(lock.packages)) {
    const dir = path.join(directory, 'packages', `engine-${rid}`)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(p))
  }
  for (const p of packages)
    await packManifest(
      directory,
      p,
      p.name === pkg.name
        ? pkg
        : Object.values(lock.packages).find((engine) => engine.name === p.name),
    )
  const receipt = await writeReleaseReceipt(directory, commit)
  for (const [index, p] of packages.entries())
    p.integrity = receipt.packages[index].integrity
  return {
    directory,
    packages,
    receipt,
    receiptPath: path.join(directory, 'artifacts/npm/release-set.json'),
  }
}
async function childResult(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout = [],
      stderr = []
    child.stdout.on('data', (data) => stdout.push(data))
    child.stderr.on('data', (data) => stderr.push(data))
    child.once('error', reject)
    child.once('close', (code) =>
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      }),
    )
  })
}

test('release receipt binds all nine archives, exact dependency versions and the source commit', async (t) => {
  const f = await fixture(t)
  assert.equal(f.receipt.packages.at(-1).version, '0.2.0')
  assert.ok(f.receipt.packages.slice(0, 8).every((p) => p.version === '0.4.0'))
  assert.deepEqual(await readReleaseReceipt(f.directory, commit), f.packages)
  await assert.rejects(
    readReleaseReceipt(f.directory, '2'.repeat(40)),
    /another source commit/,
  )
  for (const change of ['missing', 'duplicate', 'filename', 'digest']) {
    const receipt = structuredClone(f.receipt)
    if (change === 'missing') receipt.packages.pop()
    if (change === 'duplicate') receipt.packages[0] = receipt.packages[1]
    if (change === 'filename')
      receipt.packages[0].filename = '../../.secret/npm_token'
    if (change === 'digest') receipt.packages[0].integrity = 'sha512-wrong'
    await writeFile(f.receiptPath, JSON.stringify(receipt))
    await assert.rejects(readReleaseReceipt(f.directory, commit))
  }
  await writeFile(f.receiptPath, JSON.stringify(f.receipt))
  await writeFile(f.packages.at(-1).archive, 'changed after verification')
  await assert.rejects(
    readReleaseReceipt(f.directory, commit),
    /digest mismatch/,
  )
  const pkg = JSON.parse(await readFile(path.join(f.directory, 'package.json')))
  pkg.optionalDependencies[f.packages[0].name] = '0.1.0'
  await writeFile(path.join(f.directory, 'package.json'), JSON.stringify(pkg))
  await assert.rejects(
    writeReleaseReceipt(f.directory, commit),
    /Optional dependencies/,
  )
})

test('a matching digest cannot bless publishConfig, changed identity, extra metadata or ambiguous manifests', async (t) => {
  const f = await fixture(t)
  const item = f.packages.at(-1)
  const expected = JSON.parse(
    await readFile(path.join(f.directory, 'package.json')),
  )
  for (const attack of [
    'publishConfig',
    'identity',
    'extra',
    'private',
    'duplicate',
    'hardlink',
    'invalid',
  ]) {
    const manifest = structuredClone(expected)
    if (attack === 'publishConfig')
      manifest.publishConfig = {
        proxy: 'http://127.0.0.1:9',
        'strict-ssl': false,
      }
    if (attack === 'identity') manifest.name = 'fixture-unpublished-package'
    if (attack === 'extra')
      manifest.fixtureUntrustedField = 'fixture-sensitive-manifest-text'
    if (attack === 'private') manifest.private = true
    await packManifest(f.directory, item, manifest)
    if (attack === 'duplicate') {
      const plain = path.join(f.directory, 'duplicate.tar')
      const contents = path.join(f.directory, 'contents', item.name)
      execFileSync('tar', [
        '-cf',
        plain,
        '-C',
        contents,
        'package/package.json',
      ])
      execFileSync('tar', [
        '-rf',
        plain,
        '-C',
        contents,
        'package/package.json',
      ])
      await writeFile(item.archive, gzipSync(await readFile(plain)))
    }
    if (attack === 'hardlink') {
      const contents = path.join(f.directory, 'contents', item.name)
      const alias = path.join(contents, 'package/manifest-alias.json')
      await link(path.join(contents, 'package/package.json'), alias)
      execFileSync('tar', [
        '-czf',
        item.archive,
        '-C',
        contents,
        'package/manifest-alias.json',
        'package/package.json',
      ])
      await rm(alias)
    }
    if (attack === 'invalid')
      await writeFile(item.archive, 'fixture-invalid-tar-sensitive-data')
    await forgeCurrentDigest(f, item)
    await assert.rejects(
      readReleaseReceipt(f.directory, commit),
      (error) => {
        assert.ok(!error.message.includes('fixture-sensitive'))
        assert.ok(!error.message.includes('fixture-invalid-tar-sensitive-data'))
        return true
      },
      attack,
    )
  }
})

test('receipt creation rejects bytes changed after validation instead of recording their new digest', async (t) => {
  const f = await fixture(t)
  await mkdir(path.join(f.directory, 'scripts/lib'), { recursive: true })
  for (const file of [
    'create-release-receipt.mjs',
    'lib/release-receipt.mjs',
    'lib/npm-archive.mjs',
    'lib/npm-package.mjs',
  ])
    await cp(
      path.join(root, 'scripts', file),
      path.join(f.directory, 'scripts', file),
    )
  await writeFile(
    path.join(f.directory, 'scripts/verify-release.mjs'),
    `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(f.packages.at(-1).archive)}, 'changed-after-validation');`,
  )
  const env = {
    GITHUB_SHA: commit,
    TMPDIR: f.directory,
    TEMP: f.directory,
    TMP: f.directory,
  }
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
  const result = await childResult(
    [path.join(f.directory, 'scripts/create-release-receipt.mjs')],
    { cwd: f.directory, env },
  )
  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /digest mismatch/)
  assert.ok(!result.stdout.includes('Recorded the verified'))
})

test('isolated runner strips Node preloads, unrelated secrets, npm config and PATH lookups; config contains no token', async (t) => {
  const f = await fixture(t)
  const sentinel = path.join(f.directory, 'preload-ran')
  const preload = path.join(f.directory, 'preload.cjs')
  await writeFile(
    preload,
    `require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'bad')`,
  )
  const npmCli = path.join(f.directory, 'fake-npm.cjs')
  await writeFile(
    npmCli,
    `const fs=require('fs'); console.log(JSON.stringify({
    cwd:process.cwd(), keys:Object.keys(process.env), path:process.env.PATH,
    hasToken:process.env.NODE_AUTH_TOKEN===${JSON.stringify(fakeToken)},
    config:fs.readFileSync(process.env.NPM_CONFIG_USERCONFIG,'utf8'),
    privateProject:JSON.parse(fs.readFileSync('package.json','utf8')).private,
    logs:process.env.NPM_CONFIG_LOGS_MAX
  }))`,
  )
  const values = {
    NODE_OPTIONS: `--require=${preload}`,
    NPM_CONFIG_PROXY: 'fixture-proxy',
    NPM_CONFIG_USERCONFIG: 'fixture-userconfig',
    UNRELATED_SECRET: 'fixture-other-secret',
    PATH: path.join(f.directory, 'untrusted-bin'),
  }
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  )
  Object.assign(process.env, values)
  t.after(() => {
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
  })
  const runner = await stagingRunner({ npmCli, token: fakeToken })
  let cwd
  try {
    const version = JSON.parse(await runner.runNpm(['--version']))
    assert.equal(version.hasToken, false)
    const result = JSON.parse(
      await runner.runNpm(['stage', 'list', '@goldenpigeon/dsh-eu4-indexer']),
    )
    cwd = result.cwd
    assert.equal(result.hasToken, true)
    assert.equal(result.privateProject, true)
    assert.notEqual(cwd, f.directory)
    for (const key of Object.keys(values).filter(
      (key) => key !== 'NPM_CONFIG_USERCONFIG' && key !== 'PATH',
    ))
      assert.ok(!result.keys.includes(key))
    assert.equal(result.path, '')
    assert.ok(!result.config.includes(fakeToken))
    assert.ok(result.config.includes('${NODE_AUTH_TOKEN}'))
    assert.equal(result.logs, '0')
    await assert.rejects(access(sentinel), { code: 'ENOENT' })
    for (const args of [
      ['publish'],
      ['stage', 'approve', 'fixture'],
      ['stage', 'reject', 'fixture'],
    ])
      await assert.rejects(runner.runNpm(args), /Only npm version/)
  } finally {
    await runner.close()
  }
  await assert.rejects(access(cwd), { code: 'ENOENT' })
})

test('subprocess failures never echo token-bearing stdout or stderr', async (t) => {
  const f = await fixture(t)
  const npmCli = path.join(f.directory, 'failing-npm.cjs')
  await writeFile(
    npmCli,
    `process.stdout.write(process.env.NODE_AUTH_TOKEN); process.stderr.write(process.env.NODE_AUTH_TOKEN); process.exit(1)`,
  )
  const runner = await stagingRunner({ npmCli, token: fakeToken })
  try {
    await assert.rejects(
      runner.runNpm(['stage', 'list', '@goldenpigeon/dsh-eu4-indexer']),
      (error) => {
        assert.ok(!error.message.includes(fakeToken))
        assert.match(error.message, /staging command failed/)
        return true
      },
    )
  } finally {
    await runner.close()
  }
})

async function entryFixture(
  t,
  {
    missingInitial = false,
    failMain = false,
    stage = 'true',
    eventName = 'workflow_dispatch',
    ref = 'refs/heads/main',
    sourceCommit = commit,
    unsafeManifest = false,
  } = {},
) {
  const f = await fixture(t)
  if (unsafeManifest) {
    const item = f.packages.at(-1)
    const manifest = JSON.parse(
      await readFile(path.join(f.directory, 'package.json')),
    )
    manifest.publishConfig = {
      proxy: 'http://127.0.0.1:9',
      'strict-ssl': false,
    }
    await packManifest(f.directory, item, manifest)
    await forgeCurrentDigest(f, item)
  }
  await mkdir(path.join(f.directory, 'scripts/lib'), { recursive: true })
  for (const file of [
    'stage-npm.mjs',
    'lib/npm-staging.mjs',
    'lib/npm-staging-runner.mjs',
    'lib/release-receipt.mjs',
    'lib/npm-archive.mjs',
    'lib/npm-package.mjs',
  ])
    await cp(
      path.join(root, 'scripts', file),
      path.join(f.directory, 'scripts', file),
    )
  const requests = path.join(f.directory, 'npm-requests.jsonl')
  const npmCli = path.join(f.directory, 'fake-npm.cjs')
  await writeFile(
    npmCli,
    `const fs=require('fs'),crypto=require('crypto');
    const args=process.argv.slice(2),packages=${JSON.stringify(f.packages)};
    fs.appendFileSync(${JSON.stringify(requests)},JSON.stringify(args)+'\\n');
    if(args[0]==='--version') console.log('11.21.2');
    else if(args[1]==='list') console.log('[]');
    else {
      const p=packages.find(p=>fs.realpathSync(p.archive)===fs.realpathSync(args[2]));
      if(${failMain} && p.name==='@goldenpigeon/dsh-eu4-indexer') {
        process.stderr.write(process.env.NODE_AUTH_TOKEN);process.exit(1)
      }
      console.log(JSON.stringify({[p.name]:{name:p.name,version:p.version,
        stageId:'12345678-1234-1234-1234-123456789abc',
        integrity:'sha512-'+crypto.createHash('sha512').update(fs.readFileSync(p.archive)).digest('base64')}}));
    }`,
  )
  const preload = path.join(f.directory, 'metadata-fixture.mjs')
  await writeFile(
    preload,
    `globalThis.fetch=async url=>{
    const name=decodeURIComponent(new URL(url).pathname.slice(1));
    const missing=${missingInitial} && name==='@goldenpigeon/dsh-eu4-indexer';
    return {status:missing?404:200,ok:!missing,json:async()=>({name,versions:{'0.1.0':{}}})}
  }`,
  )
  const eventFile = path.join(f.directory, 'event.json')
  const summary = path.join(f.directory, 'summary.md')
  await writeFile(eventFile, JSON.stringify({ inputs: { stage } }))
  const env = {
    TMPDIR: f.directory,
    TEMP: f.directory,
    TMP: f.directory,
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: eventName,
    GITHUB_REF: ref,
    DEFAULT_BRANCH: 'main',
    GITHUB_SHA: sourceCommit,
    GITHUB_EVENT_PATH: eventFile,
    GITHUB_STEP_SUMMARY: summary,
    NPM_DIST_TAG: 'latest',
    NPM_STAGE_CLI: npmCli,
    NODE_AUTH_TOKEN: fakeToken,
  }
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
  // No node_modules or dist exist; the credential entry must work using only builtins.
  const result = await childResult(
    [
      '--import',
      pathToFileURL(preload).href,
      path.join(f.directory, 'scripts/stage-npm.mjs'),
    ],
    { cwd: f.directory, env },
  )
  let calls = [],
    text = ''
  try {
    calls = (await readFile(requests, 'utf8'))
      .trim()
      .split('\n')
      .map(JSON.parse)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  try {
    text = await readFile(summary, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  assert.ok(!result.stdout.includes(fakeToken))
  assert.ok(!result.stderr.includes(fakeToken))
  assert.ok(!text.includes(fakeToken))
  return { result, calls, text }
}

test('credential entry rejects disabled staging, push events, other branches and another source commit before invoking npm', async (t) => {
  for (const [options, message] of [
    [{ stage: 'false' }, /explicitly request npm staging/],
    [{ eventName: 'push' }, /manual run on the default branch/],
    [{ ref: 'refs/heads/untrusted' }, /manual run on the default branch/],
    [{ sourceCommit: '2'.repeat(40) }, /another source commit/],
  ]) {
    const { result, calls, text } = await entryFixture(t, options)
    assert.notEqual(result.code, 0)
    assert.match(result.stderr, message)
    assert.deepEqual(calls, [])
    assert.ok(!text.includes('COMPLETE:'))
  }
})

test('credential entry blocks every upload when the last package has not been initially published', async (t) => {
  const { result, calls, text } = await entryFixture(t, {
    missingInitial: true,
  })
  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /Initial publication/)
  assert.equal(calls.filter((c) => c[1] === 'publish').length, 0)
  assert.ok(!text.includes('\nCOMPLETE:'))
  assert.match(text, /Staging stopped/)
})

test('credential entry rejects archive-controlled npm settings before any credential-bearing subprocess', async (t) => {
  const { result, calls, text } = await entryFixture(t, {
    unsafeManifest: true,
  })
  assert.notEqual(result.code, 0)
  assert.match(result.stderr, /publishConfig is forbidden/)
  assert.deepEqual(calls, [])
  assert.ok(!text.includes('COMPLETE:'))
})

test('credential entry distinguishes complete staging from partial failure without approving any package', async (t) => {
  for (const failMain of [false, true]) {
    const { result, calls, text } = await entryFixture(t, { failMain })
    assert.equal(result.code, failMain ? 1 : 0, result.stderr)
    assert.equal(calls.filter((c) => c[1] === 'publish').length, 9)
    assert.ok(
      calls.every(
        (c) =>
          c[0] === '--version' ||
          (c[0] === 'stage' && ['list', 'publish'].includes(c[1])),
      ),
    )
    assert.match(text, /IN PROGRESS/)
    assert.equal(text.includes('\nCOMPLETE:'), !failMain)
    if (failMain) assert.match(text, /Staging stopped/)
  }
})
