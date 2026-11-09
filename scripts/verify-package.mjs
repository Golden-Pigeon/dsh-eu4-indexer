import path from 'node:path'
import os from 'node:os'
import {
  mkdtemp,
  mkdir,
  rm,
  readFile,
  writeFile,
  access,
  rename,
  realpath,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import spawn from 'cross-spawn'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { rid, platforms } from '../dist/engine/platforms.js'
import { localRegistry } from './lib/package-registry.mjs'
import { npmArchiveName } from './lib/npm-package.mjs'

const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json')))
const archive = path.resolve(
  process.argv[2] ?? `artifacts/npm/${npmArchiveName(pkg.name, pkg.version)}`,
)
// Exercise argument boundaries with a space in every consumer/cache/store path.
const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh package-'))
let server
async function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, npm_config_cache: path.join(temp, 'cache') },
    })
    let output = ''
    child.stdout.on('data', (c) => {
      output = (output + c).slice(-65536)
    })
    child.stderr.on('data', (c) => {
      output = (output + c).slice(-65536)
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code !== 0
        ? reject(new Error(`${command} exited ${code}: ${output}`))
        : resolve(output),
    )
  })
}
try {
  const entries = await run('tar', ['-tzf', archive], root)
  assert.doesNotMatch(entries, /(?:archives\/|engine\.(?:tar\.gz|zip)|\.dll\n)/)
  const local = await localRegistry(root)
  server = local.server
  const registry = local.url
  const managers = process.argv.includes('--npm-only')
    ? ['npm']
    : ['npm', 'pnpm']
  for (const manager of managers) {
    const consumer = path.join(temp, manager)
    await mkdir(consumer)
    await writeFile(
      path.join(consumer, 'package.json'),
      JSON.stringify({
        name: 'dsh-packed-consumer',
        version: '1.0.0',
        private: true,
      }),
    )
    const args =
      manager === 'npm'
        ? [
            'install',
            '--ignore-scripts',
            '--legacy-peer-deps',
            '--no-audit',
            '--no-fund',
            `--registry=${registry}`,
            archive,
          ]
        : [
            'add',
            '--ignore-scripts',
            '--config.auto-install-peers=false',
            `--store-dir=${path.join(temp, 'pnpm-store')}`,
            `--registry=${registry}`,
            archive,
          ]
    await run(manager, args, consumer)
    const packageDir = path.join(consumer, 'node_modules', pkg.name)
    const consumerTypes = path.join(consumer, 'consumer.mts')
    const browserTypes = path.join(consumer, 'host-client.ts')
    // DSH client entries are classic scripts. Their declarations must not add
    // generic names such as Api to the host's global TypeScript scope.
    await writeFile(
      browserTypes,
      `/// <reference path="node_modules/${pkg.name}/dist/client/client.d.ts" />
type Api = { host: true }
const hostApi: Api = { host: true }
interface Window { __ModuleLoader__: { load(entry: unknown): void } }
declare const browser: Window
browser.__ModuleLoader__.load(hostApi)
`,
    )
    await writeFile(
      consumerTypes,
      `import type { Api, Task, Config } from '${pkg.name}'
declare const api: Api
const job: Promise<Task> = api({ operation: 'index', name: 'base', game: 'eu4' })
const config: Config = { home: '/data', concurrency: 2 }
// @ts-expect-error The published API must reject unknown operations.
void api({ operation: 'exec' })
// @ts-expect-error The published configuration must retain its numeric type.
config.concurrency = 'two'
void job
`,
    )
    const program = ts.createProgram([consumerTypes, browserTypes], {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      moduleDetection: ts.ModuleDetectionKind.Legacy,
      target: ts.ScriptTarget.ES2023,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    assert.equal(
      diagnostics.length,
      0,
      ts.formatDiagnostics(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => consumer,
        getNewLine: () => '\n',
      }),
    )
    const { Engine } = await import(
      pathToFileURL(path.join(packageDir, 'dist/engine/runtime.js'))
    )
    const lock = JSON.parse(
      await readFile(path.join(packageDir, 'engine.lock.json')),
    )
    assert.deepEqual(
      Object.keys(lock.packages).sort(),
      Object.keys(platforms).sort(),
    )
    for (const game of ['eu4', 'hoi4'])
      for (const language of ['en', 'zh'])
        assert.ok(
          (
            await readFile(
              path.join(
                packageDir,
                'resources/skills',
                game,
                language,
                'SKILL.md',
              ),
              'utf8',
            )
          ).includes('eu4_indexer_manage'),
        )
    const engine = new Engine({
      home: path.join(temp, `home-${manager}`),
      fetchImpl: async () => {
        throw Error('Engine installation must stay offline')
      },
    })
    assert.equal((await engine.install()).ready, true)
    assert.equal((await engine.call({ operation: 'list' })).databases.length, 0)
    const managedReceipt = path.join(engine.home, 'engine/current/receipt.json')
    const installedReceipt = await readFile(managedReceipt, 'utf8')
    try {
      for (const change of [
        { sourceCommit: 'old' },
        { apiVersion: 0 },
        { build: { sdkVersion: 'old' } },
        { rid: 'wrong-platform' },
        { package: { ...lock.packages[rid()], version: 'old' } },
        { sourceCommit: lock.sourceCommit, package: undefined },
      ]) {
        await writeFile(
          managedReceipt,
          JSON.stringify({ ...JSON.parse(installedReceipt), ...change }),
        )
        assert.equal((await engine.status()).code, 'engine_update_required')
        await assert.rejects(engine.call({ operation: 'list' }), {
          code: 'engine_update_required',
        })
      }
      await rm(managedReceipt)
      assert.equal((await engine.status()).code, 'engine_update_required')
      assert.equal((await engine.install()).ready, true)
    } finally {
      await writeFile(managedReceipt, installedReceipt)
    }
    await access(
      path.join(engine.home, 'engine/current/bin/third-party/cwtools/LICENSE'),
    )
    await access(
      path.join(
        engine.home,
        'engine/current/bin/third-party/dotnet-runtime/THIRD-PARTY-NOTICES.TXT',
      ),
    )
    const dependencyRoot = path.dirname(
      createRequire(
        path.join(await realpath(packageDir), 'package.json'),
      ).resolve(`${lock.packages[rid()].name}/package.json`),
    )
    const receiptPath = path.join(dependencyRoot, 'engine.json')
    const receipt = await readFile(receiptPath, 'utf8')
    try {
      await writeFile(
        receiptPath,
        JSON.stringify({
          ...JSON.parse(receipt),
          build: { sdkVersion: 'stale' },
        }),
      )
      await assert.rejects(
        new Engine({ home: path.join(temp, `stale-${manager}`) }).install(),
        { code: 'engine_package_mismatch' },
      )
    } finally {
      await writeFile(receiptPath, receipt)
    }
    await rename(dependencyRoot, dependencyRoot + '.held')
    try {
      assert.equal(
        (await engine.status()).ready,
        true,
        'A matching managed engine remains usable offline without the optional package',
      )
      await assert.rejects(
        new Engine({ home: path.join(temp, `missing-${manager}`) }).install(),
        { code: 'engine_package_missing' },
      )
    } finally {
      await rename(dependencyRoot + '.held', dependencyRoot)
    }
    const { IndexerService } = await import(
      pathToFileURL(path.join(packageDir, 'dist/service.js'))
    )
    const service = new IndexerService({
      home: path.join(temp, `external-${manager}`),
      timeoutMs: 5000,
    })
    await service.init()
    try {
      await service.dispatch({
        operation: 'configure',
        executablePath: await engine.resolve(),
      })
      assert.equal(service.engine.explicit, await engine.resolve())
      assert.equal(
        (await service.dispatch({ operation: 'configure', executablePath: '' }))
          .ready,
        false,
      )
      assert.equal(service.engine.explicit, '')
      const task = await service.dispatch({ operation: 'install_engine' })
      while (
        ['queued', 'running', 'cancelling'].includes(
          service.tasks.list().find((r) => r.id === task.id).state,
        )
      )
        await new Promise((r) => setTimeout(r, 20))
      assert.equal(
        service.tasks.list().find((r) => r.id === task.id).state,
        'succeeded',
      )
    } finally {
      await service.stop()
    }
    console.log(
      `${manager}: only ${rid()} installed; offline activation, notices and external-to-managed recovery passed.`,
    )
  }
  const requested = local.requested
  assert.ok(requested.length)
  assert.ok(
    requested.every((target) => target === rid()),
    `Unexpected binary downloads: ${requested.join(', ')}`,
  )
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  await rm(temp, { recursive: true, force: true })
}
