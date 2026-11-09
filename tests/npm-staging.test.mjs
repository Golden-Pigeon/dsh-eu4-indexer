import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtemp,
  writeFile,
  mkdir,
  readFile,
  rm,
  access,
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import {
  stageUpdates,
  stagingNpmVersion,
  publicPackage,
} from '../scripts/lib/npm-staging.mjs'
import { stagingRunner } from '../scripts/lib/npm-staging-runner.mjs'
import { npmArchiveName } from '../scripts/lib/npm-package.mjs'

const stageId = '12345678-1234-1234-1234-123456789abc'
const integrity = (bytes) =>
  `sha512-${createHash('sha512').update(bytes).digest('base64')}`
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-npm-staging-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const packages = [
    '@goldenpigeon/dsh-eu4-indexer-engine-linux-x64',
    '@goldenpigeon/dsh-eu4-indexer',
  ].map((name) => ({
    name,
    version: '0.2.0',
    archive: path.join(root, npmArchiveName(name, '0.2.0')),
  }))
  for (const p of packages) await writeFile(p.archive, p.name)
  const calls = []
  const receipts = []
  const getPackage = async (name) => ({ name, versions: { '0.1.0': {} } })
  const runNpm = async (args) => {
    calls.push(args)
    if (args[0] === '--version') return stagingNpmVersion
    if (args[1] === 'list') return '[]'
    assert.deepEqual(args.slice(0, 2), ['stage', 'publish'])
    const item = packages.find((p) => p.archive === args[2])
    return JSON.stringify({
      [item.name]: {
        ...item,
        stageId,
        integrity: integrity(await readFile(item.archive)),
      },
    })
  }
  return {
    root,
    packages,
    calls,
    receipts,
    getPackage,
    runNpm,
    tag: 'latest',
    onStaged: async (entry) => receipts.push(entry),
  }
}
const writes = (f) => f.calls.filter((a) => a[1] === 'publish')

test('public preflight omits authentication, refuses redirects and fails closed for registry errors', async (t) => {
  let status = 200
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(
      url,
      'https://registry.npmjs.org/%40goldenpigeon%2Fdsh-eu4-indexer',
    )
    assert.equal(options.redirect, 'error')
    assert.equal(options.headers, undefined)
    assert.ok(options.signal)
    return {
      status,
      ok: status === 200,
      json: async () => ({ name: '@goldenpigeon/dsh-eu4-indexer' }),
    }
  })
  assert.deepEqual(await publicPackage('@goldenpigeon/dsh-eu4-indexer'), {
    name: '@goldenpigeon/dsh-eu4-indexer',
  })
  status = 404
  await assert.rejects(
    publicPackage('@goldenpigeon/dsh-eu4-indexer'),
    /Initial publication/,
  )
  status = 503
  await assert.rejects(
    publicPackage('@goldenpigeon/dsh-eu4-indexer'),
    /registry HTTP 503/,
  )
})

test('invalid npm JSON cannot expose raw subprocess output', async (t) => {
  const f = await fixture(t)
  const original = f.runNpm
  f.runNpm = async (args) =>
    args[1] === 'list' ? 'fixture-sensitive-output' : original(args)
  await assert.rejects(stageUpdates(f), (error) => {
    assert.match(error.message, /Invalid npm JSON response/)
    assert.ok(!error.message.includes('fixture-sensitive-output'))
    return true
  })
  assert.equal(writes(f).length, 0)
})

test('stage the checked archives in order, disable lifecycle scripts, and report approval IDs', async (t) => {
  const f = await fixture(t)
  const result = await stageUpdates(f)
  assert.equal(result.length, 2)
  assert.deepEqual(f.receipts, result)
  assert.deepEqual(
    writes(f).map((a) => a[2]),
    f.packages.map((p) => p.archive),
  )
  for (const args of writes(f)) {
    assert.ok(args.includes('--ignore-scripts'))
    assert.ok(args.includes('--registry=https://registry.npmjs.org/'))
    assert.ok(args.includes('--fetch-retries=0'))
    assert.ok(args.includes('--tag=latest'))
  }
  assert.ok(
    f.calls.every(
      (a) =>
        a[0] === '--version' ||
        (a[0] === 'stage' && ['list', 'publish'].includes(a[1])),
    ),
  )
})

test('preflight the whole set and refuse missing initial publications, placeholders, conflicts and registry failures', async (t) => {
  for (const reason of [
    'missing',
    'placeholder',
    'published',
    'pending',
    'registry',
  ]) {
    await t.test(reason, async (t) => {
      const f = await fixture(t)
      const original = f.runNpm
      f.getPackage = async (name) => {
        if (name !== f.packages.at(-1).name)
          return { name, versions: { '0.1.0': {} } }
        if (reason === 'missing' || reason === 'registry')
          throw new Error(reason)
        return {
          name,
          versions:
            reason === 'placeholder'
              ? { '0.0.0-stage': {} }
              : reason === 'published'
                ? { '0.2.0': {} }
                : { '0.1.0': {} },
        }
      }
      f.runNpm = async (args) =>
        reason === 'pending' &&
        args[1] === 'list' &&
        args[2] === f.packages.at(-1).name
          ? JSON.stringify([
              { packageName: args[2], version: '0.2.0', id: stageId },
            ])
          : original(args)
      await assert.rejects(stageUpdates(f))
      assert.equal(writes(f).length, 0)
      assert.equal(f.receipts.length, 0)
    })
  }
})

test('reject an unsupported npm, unsafe tags, prerelease latest, duplicate sets and changed archives', async (t) => {
  for (const reason of [
    'npm',
    'tag',
    'prerelease',
    'duplicate',
    'changed',
    'receipt',
    'unscoped',
    'other-scope',
  ]) {
    await t.test(reason, async (t) => {
      const f = await fixture(t)
      if (reason === 'tag') f.tag = 'latest; echo unsafe'
      if (reason === 'prerelease') f.packages[0].version = '0.2.0-rc.1'
      if (reason === 'duplicate') f.packages.push(f.packages[0])
      if (reason === 'unscoped')
        f.packages[0].name = 'dsh-eu4-indexer-engine-linux-x64'
      if (reason === 'other-scope')
        f.packages[0].name = '@other/dsh-eu4-indexer-engine-linux-x64'
      if (reason === 'receipt')
        f.packages[0].integrity = 'sha512-wrong-verified-receipt'
      const original = f.runNpm
      f.runNpm = async (args) => {
        if (reason === 'npm' && args[0] === '--version') return '11.8.0'
        if (
          reason === 'changed' &&
          args[1] === 'list' &&
          args[2] === f.packages.at(-1).name
        )
          await writeFile(f.packages[0].archive, 'replaced after preflight')
        return original(args)
      }
      await assert.rejects(stageUpdates(f))
      assert.equal(writes(f).length, 0)
    })
  }
})

test('preserve receipts on partial failure and stop rather than approving, retrying or publishing', async (t) => {
  const f = await fixture(t)
  const original = f.runNpm
  f.runNpm = async (args) => {
    if (args[1] === 'publish' && args[2] === f.packages.at(-1).archive) {
      f.calls.push(args)
      throw new Error('fixture network failure')
    }
    return original(args)
  }
  await assert.rejects(stageUpdates(f), /network failure/)
  assert.equal(f.receipts.length, 1)
  assert.equal(writes(f).length, 2)
  assert.equal(f.receipts[0].name, f.packages[0].name)
})

test('require the registry receipt to identify the exact staged bytes', async (t) => {
  const f = await fixture(t)
  const original = f.runNpm
  f.runNpm = async (args) => {
    const result = await original(args)
    if (args[1] !== 'publish') return result
    const parsed = JSON.parse(result)
    parsed[f.packages[0].name].integrity = 'sha512-unexpected'
    return JSON.stringify(parsed)
  }
  await assert.rejects(stageUpdates(f), /Invalid stage receipt/)
  assert.equal(f.receipts.length, 0)
  assert.equal(writes(f).length, 1)
})

test('local credentials are ignored by Git and excluded by the actual npm packlist', async (t) => {
  const f = await fixture(t)
  const root = path.resolve(import.meta.dirname, '..')
  // The musl fixture is a source export without .git; test the real rules in an isolated repo.
  execFileSync('git', ['init', '-q', f.root])
  await writeFile(
    path.join(f.root, '.gitignore'),
    await readFile(path.join(root, '.gitignore')),
  )
  assert.equal(
    execFileSync('git', ['check-ignore', '.secret/npm_token'], {
      cwd: f.root,
      encoding: 'utf8',
    }).trim(),
    '.secret/npm_token',
  )
  const npm = process.env.npm_execpath
  // npm run check supplies npm_execpath; direct node runs use the installed npm.
  const args = [
    'pack',
    '--dry-run',
    '--ignore-scripts',
    '--json',
    `--cache=${path.join(f.root, 'pack-cache')}`,
  ]
  const result = npm
    ? execFileSync(process.execPath, [npm, ...args], { cwd: root })
    : execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
        cwd: root,
        shell: process.platform === 'win32',
      })
  const files = JSON.parse(result)[0].files.map((f) => f.path)
  assert.ok(files.length > 0)
  assert.ok(
    files.every(
      (p) => !p.split('/').includes('.secret') && !p.includes('npm_token'),
    ),
  )
})

test(
  'real pinned npm CLI uses only the staging endpoint and preserves tarball bytes',
  {
    skip: !process.env.DSH_TEST_STAGING_NPM_CLI,
  },
  async (t) => {
    const f = await fixture(t)
    const npmCli = process.env.DSH_TEST_STAGING_NPM_CLI
    const requests = []
    const posted = []
    const server = http.createServer(async (req, res) => {
      requests.push(`${req.method} ${req.url}`)
      res.setHeader('content-type', 'application/json')
      if (req.method === 'GET' && req.url.startsWith('/-/stage?'))
        return res.end(JSON.stringify({ items: [], total: 0 }))
      if (
        req.method === 'GET' &&
        f.packages.some((p) => p.name === decodeURIComponent(req.url.slice(1)))
      )
        return res.end(
          JSON.stringify(
            await f.getPackage(decodeURIComponent(req.url.slice(1))),
          ),
        )
      if (req.method === 'POST' && req.url.startsWith('/-/stage/package/')) {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        posted.push(JSON.parse(Buffer.concat(chunks)))
        return res.end(JSON.stringify({ stageId }))
      }
      res
        .writeHead(400)
        .end(JSON.stringify({ error: 'unexpected fixture request' }))
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    t.after(() => new Promise((resolve) => server.close(resolve)))
    const registry = `http://127.0.0.1:${server.address().port}/`
    const config = path.join(f.root, 'npmrc')
    await writeFile(
      config,
      `registry=${registry}\n//127.0.0.1:${server.address().port}/:_authToken=fixture-only\n`,
    )
    const sentinel = path.join(f.root, 'lifecycle-ran')
    for (const item of f.packages) {
      const directory = path.join(f.root, item.name)
      await mkdir(path.join(directory, 'package'), { recursive: true })
      await writeFile(
        path.join(directory, 'package/package.json'),
        JSON.stringify({
          name: item.name,
          version: item.version,
          scripts: {
            prepublishOnly: `node -e "require('fs').writeFileSync('${sentinel.replaceAll('\\', '/')}', 'bad')"`,
          },
        }),
      )
      execFileSync('tar', ['-czf', item.archive, '-C', directory, 'package'])
    }
    // Keep the production runner unchanged; this test-only wrapper redirects npm to loopback.
    const wrapper = path.join(f.root, 'npm-loopback.cjs')
    await writeFile(
      wrapper,
      `
      const cli=${JSON.stringify(npmCli)};
      process.argv=[process.execPath,cli,...process.argv.slice(2).map(a=>
        a.startsWith('--registry=')?${JSON.stringify(`--registry=${registry}`)}:a)];
      process.env.NPM_CONFIG_USERCONFIG=${JSON.stringify(config)};
      require(cli);
    `,
    )
    const runner = await stagingRunner({
      npmCli: wrapper,
      token: 'fixture-only',
    })
    t.after(() => runner.close())
    f.runNpm = runner.runNpm
    const results = await stageUpdates(f)
    assert.equal(results.length, 2)
    assert.equal(posted.length, 2)
    assert.ok(
      requests.every(
        (r) => r.startsWith('GET ') || r.startsWith('POST /-/stage/package/'),
      ),
    )
    for (const [index, body] of posted.entries()) {
      const attachment = Object.values(body._attachments)[0]
      assert.deepEqual(
        Buffer.from(attachment.data, 'base64'),
        await readFile(f.packages[index].archive),
      )
      assert.equal(body['dist-tags'].latest, '0.2.0')
    }
    await assert.rejects(access(sentinel), { code: 'ENOENT' })
  },
)
