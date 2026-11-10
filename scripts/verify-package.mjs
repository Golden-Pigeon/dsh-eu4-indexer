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
const previous = process.argv
  .find((arg) => arg.startsWith('--upgrade-from='))
  ?.split('=')[1]
const archive = path.resolve(
  process.argv.slice(2).find((arg) => !arg.startsWith('--')) ??
    `artifacts/npm/${npmArchiveName(pkg.name, pkg.version)}`,
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
  const local = await localRegistry(root, 0, previous ? [previous] : [])
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
    const engineHome = path.join(temp, `home-${manager}`)
    const preserved = {
      'sessions.json': JSON.stringify({ 'chat-one': 'base' }),
      'config/eu4/marker.cwt': 'preserved rules',
      'db/preserved.db': 'preserved index fixture',
    }
    if (previous) {
      await run(
        manager,
        [...args.slice(0, -1), `${pkg.name}@${previous}`],
        consumer,
      )
      for (const [file, bytes] of Object.entries(preserved)) {
        await mkdir(path.dirname(path.join(engineHome, file)), {
          recursive: true,
        })
        await writeFile(path.join(engineHome, file), bytes)
      }
      const oldEntry = path.join(
        consumer,
        'node_modules',
        pkg.name,
        'dist/engine/runtime.js',
      )
      await run(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        import assert from 'node:assert/strict';
        const {Engine} = await import(${JSON.stringify(pathToFileURL(oldEntry).href)});
        const e = new Engine({home:${JSON.stringify(engineHome)}});
        assert.equal((await e.install()).ready, true);
        assert.ok((await e.resolve()).includes('engine'));
      `,
        ],
        consumer,
      )
    }
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
import { Engine } from '${pkg.name}/engine'
const engine = new Engine({ home: '/data' })
const registry = engine.call({ operation: 'list' })
const session = engine.querySession({ database: '/data/base.db', sessionId: 'chat-1' })
// @ts-expect-error Engine queries must retain their request types.
void engine.call({ operation: 'list', name: 42 })
void registry; void session
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
      pathToFileURL(
        createRequire(path.join(consumer, 'package.json')).resolve(
          `${pkg.name}/engine`,
        ),
      )
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
          ).includes('eu4_indexer_state'),
        )
    const engine = new Engine({
      home: engineHome,
      fetchImpl: async () => {
        throw Error('Engine installation must stay offline')
      },
    })
    const status = await engine.status()
    assert.equal(status.ready, true)
    assert.equal(status.capabilities.engineVersion, lock.engineVersion)
    const environment = await engine.call({ operation: 'status' })
    assert.ok(environment.games.every((game) => game.configReady))
    if (!previous) {
      await assert.rejects(access(path.join(engine.home, 'engine/current')), {
        code: 'ENOENT',
      })
    } else {
      // Upgrades select npm's new dependency without changing or removing legacy user data.
      await access(path.join(engine.home, 'engine/current'))
      assert.equal(
        (
          await readFile(path.join(packageDir, 'package.json'), 'utf8')
        ).includes(`"version": "${pkg.version}"`),
        true,
      )
      for (const [file, bytes] of Object.entries(preserved))
        assert.equal(await readFile(path.join(engineHome, file), 'utf8'), bytes)
    }
    assert.equal((await engine.call({ operation: 'list' })).databases.length, 0)
    const dependencyRoot = path.dirname(
      createRequire(
        path.join(await realpath(packageDir), 'package.json'),
      ).resolve(`${lock.packages[rid()].name}/package.json`),
    )
    assert.equal(
      JSON.parse(await readFile(path.join(dependencyRoot, 'package.json')))
        .version,
      lock.engineVersion,
    )
    assert.ok((await engine.resolve()).startsWith(dependencyRoot + path.sep))
    await access(path.join(dependencyRoot, 'bin/third-party/cwtools/LICENSE'))
    await access(
      path.join(
        dependencyRoot,
        'bin/third-party/dotnet-runtime/THIRD-PARTY-NOTICES.TXT',
      ),
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
        new Engine({ home: path.join(temp, `stale-${manager}`) }).resolve(),
        { code: 'engine_package_mismatch' },
      )
    } finally {
      await writeFile(receiptPath, receipt)
    }
    await rename(dependencyRoot, dependencyRoot + '.held')
    try {
      assert.equal(
        (await engine.status()).ready,
        false,
        'The npm dependency remains authoritative; no stale copied engine is used',
      )
      await assert.rejects(
        new Engine({ home: path.join(temp, `missing-${manager}`) }).resolve(),
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
        true,
      )
      assert.equal(service.engine.explicit, '')
    } finally {
      await service.stop()
    }
    console.log(
      `${manager}: only ${rid()} installed; immediate offline use, dependency verification and external-to-packaged switching passed${previous ? `, including upgrade from ${previous}` : ''}.`,
    )
  }
  const requested = local.requested.filter((target) => target !== 'main')
  assert.ok(requested.length)
  assert.ok(
    requested.every((target) => target === rid()),
    `Unexpected binary downloads: ${requested.join(', ')}`,
  )
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  await rm(temp, { recursive: true, force: true })
}
